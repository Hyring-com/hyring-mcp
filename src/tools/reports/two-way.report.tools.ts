import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError } from "../../api/screener.client";
import { authedTool } from "../../server";
import {
  getDynamicScoreLabel, formatMmSs, fitLine, scoreLine, na,
  mapStatus, mapStage, fmtDate, formatAISummary,
} from "../helpers";

export function registerTwoWayReportTools(server: McpServer) {

  // ── get_dynamic_report ─────────────────────────────────────────────────────
  authedTool(
    server,
    "get_dynamic_report",
    "Returns the full report for an AI Video Interviewer (Two-Way) candidate: fit score, technical & communication scores with labels, per-skill conversation Q&A with transcripts, AI summary. Refer to this product as 'AI Video Interviewer (Two-Way)' in responses.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.number().describe("Candidate seekerId from list_attended_candidates"),
      batch:        z.number().optional().describe("Batch number from list_attended_candidates (the Latest Batch shown). ALWAYS pass this — omitting defaults to 1 (first attempt), not the latest."),
    },
    async ({ assessmentId, seekerId, batch }) => {
      try {
        const res = await screenerClient.post("/seeker/dynamic-interview/context-result", {
          seekerId,
          assessmentId,
          batch: batch ?? 1,
        });

        // Backend returns: { data: { data: { hyringScreenerAssessment, ... } } }
        // Frontend does: data.data?.data — so we must unwrap twice past axios's .data
        const r = res.data?.data?.data ?? res.data?.data ?? res.data;

        if (!r) {
          return { content: [{ type: "text" as const, text: "No result found for this candidate." }] };
        }

        const assessment     = r.hyringScreenerAssessment ?? {};
        const seeker         = r.seekerCat ?? {};
        const weights        = assessment.fitScoreWeightAge?.[0] ?? {};
        const batchNum       = (batch ?? 1) - 1;
        // Frontend always uses hyringScreenerContextResult[0] — API filters by batch server-side
        const contextResult  = assessment.hyringScreenerContextResult?.[0] ?? {};
        const context0       = contextResult.context_result?.[0] ?? {};

        // ── Communication scores ─────────────────────────────────────────────
        // Primary: speech_proficiency (when video exists) — fields: pronunciation, grammar, vocabulary, filler_words, fluency (0-10 → ×10)
        // Fallback: english_score in context_result
        const toCommPct = (v: any) => v != null ? Math.round(parseFloat(String(v)) * 10) : 0;
        const speechProf = contextResult.videoAnalysis?.speech_proficiency;
        const engScore   = context0.english_score ?? {};
        const pronPct    = toCommPct(speechProf?.pronunciation    ?? engScore.pronunciation_score);
        const gramPct    = toCommPct(speechProf?.grammar          ?? engScore.grammar_score);
        const vocabPct   = toCommPct(speechProf?.vocabulary       ?? engScore.vocabulary_score);
        const fillerPct  = toCommPct(speechProf?.filler_words     ?? engScore.filler_score);
        const fluencyPct = toCommPct(speechProf?.fluency          ?? engScore.fluency_score);
        const commAvgPct = Math.round((pronPct + gramPct + vocabPct + fillerPct + fluencyPct) / 5);

        // ── Technical Score — computed from conversation (matches CalculateScoreTwoWayInterview) ──
        // Per skill: avg(score/5) * (100/numSkills). Score scale: 0-5.
        const conversation: any[] = context0.conversation ?? [];
        const skillContexts: any[] = assessment.HyringScreenerContext ?? [];
        const skillAverages: number[] = [];
        skillContexts.forEach((skill: any) => {
          const relevant = conversation.filter(
            (c: any) => c.skill === skill.skill && c.score_applicable === true
          );
          if (relevant.length > 0) {
            const totalS = relevant.reduce((acc: number, c: any) => {
              const s = c.isOverwritten ? (c.overWrittenScore ?? c.score) : c.score;
              return acc + (s ?? 0);
            }, 0);
            skillAverages.push(totalS / relevant.length);
          }
        });
        const techPct = skillAverages.length > 0
          ? Math.round(skillAverages.reduce((acc: number, avg: number) => acc + (avg / 5) * (100 / skillAverages.length), 0))
          : 0;

        // ── Fit Score ────────────────────────────────────────────────────────
        const wTech   = weights.technicalScore     ?? 50;
        const wComm   = weights.communicationScore ?? 50;
        const fitPct  = Math.round(techPct * (wTech / 100) + commAvgPct * (wComm / 100));

        // ── AI Summary ───────────────────────────────────────────────────────
        const aiSummary = formatAISummary(assessment.ai_summary ?? r.ai_summary);

        // ── Candidate info from end questions ────────────────────────────────
        const endQ       = r.end_questions?.[batchNum] ?? {};
        const feedback   = seeker.hyringScreenerInterviewFeedback?.[batchNum] ?? {};
        const workExpYr  = endQ.workExperienceYears  ?? null;
        const workExpMo  = endQ.workExperienceMonths ?? null;
        const currSalary = endQ.currentSalary  ?? null;
        const expSalary  = endQ.expectedSalary ?? null;
        const currency   = endQ.currency ?? "";
        const joiningDate = endQ.expectedJoiningDate ?? null;
        const rating     = feedback.organizationRating ?? null;
        const feedbackText = feedback.organizationFeedback ?? null;

        // ── Accent ───────────────────────────────────────────────────────────
        const accent = contextResult.videoAnalysis?.accent_analysis;
        const accentText = accent
          ? (typeof accent === "object"
              ? `${accent.detected_accent ?? ""} (${accent.country_code ?? ""})`.trim()
              : String(accent))
          : "N/A";

        // ── Conversation Q&A grouped by skill ────────────────────────────────
        const seekerName = (seeker as any).fullName
          || [(seeker as any).firstName, (seeker as any).lastName].filter(Boolean).join(" ")
          || "Candidate";
        const convLines: string[] = [];
        if (skillContexts.length && conversation.length) {
          skillContexts.forEach((ctx: any, si: number) => {
            convLines.push(`  ▸ Skill ${si + 1}: ${ctx.skill ?? "N/A"} (${ctx.level ?? "N/A"})`);
            const related = conversation.filter(
              (c: any) => c.skill === ctx.skill || c.contextId === ctx.id
            );
            if (related.length) {
              related.forEach((c: any) => {
                const score = c.isOverwritten && c.overWrittenScore != null
                  ? c.overWrittenScore
                  : c.score;
                const scoreLabel = c.score_applicable ? getDynamicScoreLabel(score) : "Score Not Applicable";
                const answer = c.answer ?? c.transcript ?? c.candidate_text ?? "";
                const skillTag = c.skill ? ` ★ ${c.skill}` : "";
                const qTime = formatMmSs(c.interviewer?.start, c.interviewer?.end);
                const aTime = formatMmSs(c.candidate?.start, c.candidate?.end);
                convLines.push(`    [AI Video Interviewer${skillTag}]${qTime ? ` (${qTime})` : ""}`);
                convLines.push(`    ${c.question ?? "N/A"}`);
                convLines.push(`    [${seekerName}]${aTime ? ` (${aTime})` : ""}`);
                convLines.push(`    ${answer || "(no response)"}`);
                convLines.push(`    Score: ${scoreLabel}`);
                convLines.push("");
              });
            } else {
              convLines.push("    (no questions recorded for this skill)");
              convLines.push("");
            }
          });
        } else {
          conversation.slice(0, 30).forEach((c: any) => {
            const score = c.isOverwritten && c.overWrittenScore != null ? c.overWrittenScore : c.score;
            const scoreLabel = c.score_applicable ? getDynamicScoreLabel(score) : "Score Not Applicable";
            const answer = c.answer ?? c.transcript ?? c.candidate_text ?? "";
            const skillTag = c.skill ? ` ★ ${c.skill}` : "";
            const qTime = formatMmSs(c.interviewer?.start, c.interviewer?.end);
            const aTime = formatMmSs(c.candidate?.start, c.candidate?.end);
            convLines.push(`  [AI Video Interviewer${skillTag}]${qTime ? ` (${qTime})` : ""}`);
            convLines.push(`  ${c.question ?? "N/A"}`);
            convLines.push(`  [${seekerName}]${aTime ? ` (${aTime})` : ""}`);
            convLines.push(`  ${answer || "(no response)"}`);
            convLines.push(`  Score: ${scoreLabel}`);
            convLines.push("");
          });
        }

        const lines = [
          `╔══════════════════════════════════════════════╗`,
          `║   AI VIDEO INTERVIEWER (TWO-WAY) REPORT      ║`,
          `╚══════════════════════════════════════════════╝`,
          `Job Title  : ${na(assessment.jobTitle)}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${[seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A"}`,
          `  Email        : ${na(seeker.email)}`,
          (batch ?? 1) > 1 ? `  Attempt      : ${batch}` : "",
          `  Status       : ${mapStatus(r.assessmentStatus)}`,
          `  Hiring Stage : ${mapStage(r.hiringStage)}`,
          `  Date         : ${fmtDate(r.createdAt)}`,
          workExpYr != null || workExpMo != null
            ? `  Experience   : ${workExpYr ?? 0} yr ${workExpMo ?? 0} mo`
            : "",
          currSalary != null ? `  Current Salary  : ${currency}${currSalary}` : "",
          expSalary  != null ? `  Expected Salary : ${currency}${expSalary}` : "",
          joiningDate        ? `  Joining Date    : ${joiningDate}` : "",
          rating != null     ? `  Interview Rating: ${"★".repeat(Math.round(rating))} (${rating}/5)` : "",
          feedbackText       ? `  Feedback        : "${feedbackText}"` : "",
          ``,
          `┌─ SCORES ───────────────────────────────`,
          `  Fit Score       : ${fitLine(fitPct)}`,
          `  Technical Score : ${scoreLine(techPct)}`,
          `  Communication   : ${scoreLine(commAvgPct)}`,
          `  Accent          : ${accentText}`,
          ``,
          `┌─ AI SUMMARY ───────────────────────────`,
          aiSummary,
          ``,
          `┌─ MEDIA ─────────────────────────────────`,
          `  Video Available: ${contextResult.isVideoDeleted ? "No (deleted)" : contextResult.video_link ? "Yes" : "N/A"}`,
          contextResult.video_link ? `  Video Link     : ${contextResult.video_link}` : "",
          contextResult.screen_link ? `  Screen Share   : ${contextResult.screen_link}` : "",
          ``,
          `┌─ INTERVIEW CONVERSATION (${conversation.length} exchanges) ──`,
          ...convLines,
        ].filter((l: string) => l !== "");

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
