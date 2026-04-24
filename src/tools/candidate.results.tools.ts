import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError } from "../api/screener.client";
import { authedTool } from "../server";

// ── Score label helpers (match frontend communication-helper.js exactly) ──────

/** Dynamic interview score (0-5 scale) → label — matches getScoreInfo in two.way.helper.js */
function getDynamicScoreLabel(score: number | null | undefined): string {
  if (score == null) return "Score Not Applicable";
  if (score <= 1) return "Poor";
  if (score <= 2) return "Average";
  if (score <= 3) return "Fair";
  return "Perfect";
}

/** Format seconds as MM:SS - MM:SS range (matches formatTimeRange in TranscriptListPanel) */
function formatMmSs(start: number | null | undefined, end: number | null | undefined): string | null {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };
  if (start == null && end == null) return null;
  if (start != null && end != null) return `${fmt(start)} - ${fmt(end)}`;
  return start != null ? fmt(start) : fmt(end!);
}

/** Fit Score: 0-25=Weak Fit, 26-50=Moderate Fit, 51-75=Good Fit, 76+=Strong Fit */
function getFitLabel(score: number): string {
  if (score <= 25) return "WEAK FIT";
  if (score <= 50) return "MODERATE FIT";
  if (score <= 75) return "GOOD FIT";
  return "STRONG FIT";
}

/** Technical/Communication % score: ≤30=Poor, ≤50=Below Avg., ≤70=Average, ≤90=Good, >90=Excellent */
function getScoreLabel(score: number | string | null): string {
  if (score == null || score === "N/A") return "N/A";
  const n = parseFloat(String(score));
  if (isNaN(n)) return "N/A";
  if (n <= 30) return "POOR";
  if (n <= 50) return "BELOW AVG.";
  if (n <= 70) return "AVERAGE";
  if (n <= 90) return "GOOD";
  return "EXCELLENT";
}

/** Per-question score (0–10 scale) → label */
function getQuestionLabel(score: number | null | undefined): string {
  if (score == null) return "Score Not Applicable";
  switch (Math.round(score)) {
    case 0:  return "Completely Incorrect";
    case 1:  return "Very Poor";
    case 2:  return "Poor";
    case 3:  return "Weak";
    case 4:  return "Below Average";
    case 5:  return "Average";
    case 6:  return "Fair";
    case 7:  return "Good";
    case 8:  return "Very Good";
    case 9:  return "Excellent";
    case 10: return "Perfect";
    default: return "Score Not Applicable";
  }
}

/** Format fit score line: "38% — MODERATE FIT" */
function fitLine(score: number | null): string {
  if (score == null || isNaN(score)) return "N/A";
  const pct = Math.round(score);
  return `${pct}% — ${getFitLabel(pct)}`;
}

/** Format score line: "37% — BELOW AVG." */
function scoreLine(score: number | string | null): string {
  if (score == null || score === "N/A") return "N/A";
  const n = parseFloat(String(score));
  if (isNaN(n)) return "N/A";
  return `${Math.round(n)}% — ${getScoreLabel(n)}`;
}

function na(v: any): string {
  return v != null && v !== "" ? String(v) : "N/A";
}

/** Parse AI summary: JSON array → bullet list, or plain string */
function formatAISummary(summary: any): string {
  if (!summary) return "N/A";
  if (Array.isArray(summary)) {
    return summary.map((s: any, i: number) => `  ${i + 1}. ${s}`).join("\n");
  }
  if (typeof summary === "string") {
    try {
      const parsed = JSON.parse(summary);
      if (Array.isArray(parsed)) {
        return parsed.map((s: any, i: number) => `  ${i + 1}. ${s}`).join("\n");
      }
    } catch { /* not JSON */ }
    return summary.trim() || "N/A";
  }
  return JSON.stringify(summary);
}

/** Normalize 0-to-(totalAnswered×10) raw sum → 0-100% */
function normalizeEngScore(raw: number, totalAnswered: number): number {
  if (!totalAnswered) return 0;
  return Math.round((raw / (totalAnswered * 10)) * 100);
}

export function registerCandidateResultsTools(server: McpServer) {

  // ── list_attended_candidates ───────────────────────────────────────────────
  authedTool(
    server,
    "list_attended_candidates",
    `Lists candidates who have completed an assessment, with their scores.

- AI Video Interviewer (One-Way) [fixed] / AI Video Interviewer (Two-Way) [dynamic] / AI Coding Interviewer [coding]: shows Hiring Stage (SHORTLISTED / HIRED / REJECTED / ON_HOLD / NOT_YET_EVALUATED)
- English Proficiency Test [verbal]: shows Qualified (Yes/No) — no hiring stage

The Batch number shown for each candidate is their LATEST attempt. Always pass this batch number to the report tool — if you omit it, the report defaults to batch 1 (first attempt) which may be outdated.

For English Proficiency Test assessments each entry includes a statusId — pass that to get_verbal_report.
For all other types the seekerId is used with get_fixed_report / get_dynamic_report / get_coding_report.

When presenting results, always refer to products by their product-page names: "AI Video Interviewer (One-Way)", "AI Video Interviewer (Two-Way)", "AI Coding Interviewer", "English Proficiency Test".`,
    {
      assessmentId:  z.string().describe("Assessment UUID"),
      interviewType: z.enum(["fixed", "dynamic", "coding", "verbal"]).describe("Type of assessment"),
    },
    async ({ assessmentId, interviewType }) => {
      try {
        let candidates: any[] = [];

        if (interviewType === "verbal") {
          // Verbal attended — different endpoint, tuple: [assessmentData, topFive, filteredResponses, total_count, ...]
          const res = await screenerClient.get(`/assessment/verbal/attended/${assessmentId}`, {
            params: { skip: 0, take: 50, search: "", stage: "", level: "", status: "", date: "", sortBy: "" },
          });
          const raw = res.data?.data;
          if (Array.isArray(raw)) {
            const slot2 = raw[2];
            candidates = Array.isArray(slot2) ? slot2 : [];
          }
        } else {
          // /assessment/view/attended/seekers/:id — flat array (not tuple)
          const res = await screenerClient.get(`/assessment/view/attended/seekers/${assessmentId}`);
          const raw = res.data?.data ?? res.data;
          candidates = Array.isArray(raw) ? raw : [];
        }

        if (!candidates.length) {
          return { content: [{ type: "text" as const, text: `No attended candidates found for assessment ${assessmentId}.` }] };
        }

        const lines = candidates.map((c: any, i: number) => {
          const seeker   = c.seekerCat ?? c;
          const name     = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A";
          const email    = seeker.email ?? c.email ?? "N/A";
          const seekerId = c.seekerId ?? seeker.seekerId ?? "N/A";
          const statusId = c.id ?? c.statusId ?? "N/A";
          const batch    = c.batch ?? 1;
          const score    = c.totalScore  ?? "N/A";

          const idInfo = interviewType === "verbal"
            ? `StatusId: ${statusId}`
            : `SeekerId: ${seekerId}`;
          const retakeNote = batch > 1 ? ` (retake — ${batch} attempts)` : "";

          const statusInfo = interviewType === "verbal"
            ? `Qualified: ${c.isQualified != null ? (c.isQualified ? "Yes ✓" : "No ✗") : "N/A"}`
            : `Stage: ${c.hiringStage ?? "N/A"}`;

          return `${i + 1}. [${idInfo} | Latest Batch: ${batch}${retakeNote}] ${name} <${email}>\n   Score: ${score} | ${statusInfo}`;
        });

        const reportTool = interviewType === "fixed" ? "get_fixed_report" : interviewType === "dynamic" ? "get_dynamic_report" : "get_coding_report";
        const idHint = interviewType === "verbal"
          ? `\n⚠ Always pass the StatusId AND Batch to get_verbal_report to view the correct (latest) attempt.`
          : `\n⚠ Always pass the SeekerId AND the Latest Batch number to ${reportTool} — omitting batch will show the first attempt, not the latest.`;

        return {
          content: [{
            type: "text" as const,
            text: `${candidates.length} attended candidate(s) for assessment ${assessmentId}:\n\n${lines.join("\n\n")}${idHint}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_fixed_report ───────────────────────────────────────────────────────
  authedTool(
    server,
    "get_fixed_report",
    "Returns the full report for an AI Video Interviewer (One-Way) candidate: fit score, technical & communication scores with labels, per-question breakdown with transcripts, AI summary, and candidate info. Refer to this product as 'AI Video Interviewer (One-Way)' in responses.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.number().describe("Candidate seekerId from list_attended_candidates"),
      batch:        z.number().optional().describe("Batch number from list_attended_candidates (the Latest Batch shown). ALWAYS pass this — omitting defaults to 1 (first attempt), not the latest."),
    },
    async ({ assessmentId, seekerId, batch }) => {
      try {
        const res = await screenerClient.post("/assessment/result", {
          seekerId,
          assessmentId,
          batch: batch ?? 1,
        });

        // Response tuple: [result, sentiment, result_stats, english_score, final_score]
        const raw: any[]  = res.data?.data ?? [];
        const r           = Array.isArray(raw) ? raw[0] : raw;    // main result object
        const resultStats = Array.isArray(raw) ? raw[2] : null;   // { _count: answeredCount }
        const engScoreAgg = Array.isArray(raw) ? raw[3] : null;   // aggregate english scores (raw sums)
        const techScore   = Array.isArray(raw) ? raw[4] : null;   // final/technical score % (pre-calculated)

        if (!r) {
          return { content: [{ type: "text" as const, text: "No result found for this candidate." }] };
        }

        const assessment   = r.hyringScreenerAssessment ?? {};
        const seeker       = r.seekerCat ?? {};
        const weights      = assessment.fitScoreWeightAge?.[0] ?? {};
        const batchNum     = (batch ?? 1) - 1;
        const videoResult  = assessment.HyringScreenerVideoAnalysisResult?.[batchNum] ?? {};
        const speech       = videoResult.videoAnalysis?.speech_proficiency ?? {};
        const questions: any[] = assessment.hyringScreenerQuestions ?? [];
        const answeredCount = resultStats?._count ?? questions.length;

        // ── Communication scores ─────────────────────────────────────────────
        // Primary: speech_proficiency from videoAnalysis (0-10 scale → × 10 = %)
        // Fallback: raw[3] aggregate raw sums — normalize: (rawSum / (answeredCount × 10)) × 100
        const toCommPct = (v: any) => v != null ? Math.round(parseFloat(String(v)) * 10) : 0;

        let pronPct: number, gramPct: number, vocabPct: number, fillerPct: number, fluencyPct: number;

        const hasSpeech = speech && (
          speech.pronunciation != null ||
          speech.grammar != null ||
          speech.fluency != null
        );

        if (hasSpeech) {
          // Primary: speech_proficiency (0-10 → × 10 for %, matches frontend)
          pronPct    = toCommPct(speech.pronunciation);
          gramPct    = toCommPct(speech.grammar);
          vocabPct   = toCommPct(speech.vocabulary);
          fillerPct  = toCommPct(speech.filler_words);
          fluencyPct = toCommPct(speech.fluency);
        } else if (engScoreAgg && answeredCount > 0) {
          // Fallback: aggregate raw sums from raw[3]
          pronPct    = normalizeEngScore(engScoreAgg.english_pronunciation ?? 0, answeredCount);
          gramPct    = normalizeEngScore(engScoreAgg.english_grammar       ?? 0, answeredCount);
          vocabPct   = normalizeEngScore(engScoreAgg.english_vocabulary    ?? 0, answeredCount);
          fillerPct  = normalizeEngScore(engScoreAgg.english_filler_words  ?? 0, answeredCount);
          fluencyPct = normalizeEngScore(engScoreAgg.english_fluency       ?? 0, answeredCount);
        } else {
          pronPct = gramPct = vocabPct = fillerPct = fluencyPct = 0;
        }

        const commAvgPct = Math.round((pronPct + gramPct + vocabPct + fillerPct + fluencyPct) / 5);

        // ── Fit Score ────────────────────────────────────────────────────────
        const techPct    = techScore != null ? parseFloat(String(techScore)) : (r.totalScore ?? 0);
        const wTech      = weights.technicalScore     ?? 50;
        const wComm      = weights.communicationScore ?? 50;
        const fitPct     = Math.round(techPct * (wTech / 100) + commAvgPct * (wComm / 100));

        // ── AI Summary ───────────────────────────────────────────────────────
        const aiSummary = formatAISummary(r.ai_summary);

        // ── Candidate info from end questions ────────────────────────────────
        const endQ       = r.end_questions?.[batchNum] ?? {};
        const feedback   = seeker.hyringScreenerInterviewFeedback?.[batchNum] ?? {};
        const workExpYr  = endQ.workExperienceYears  ?? null;
        const workExpMo  = endQ.workExperienceMonths ?? null;
        const currSalary = endQ.currentSalary  ?? null;
        const expSalary  = endQ.expectedSalary ?? null;
        const currency   = endQ.currency ?? assessment.currency ?? "";
        const joiningDate = endQ.expectedJoiningDate ?? null;
        const rating     = feedback.organizationRating ?? null;
        const feedbackText = feedback.organizationFeedback ?? null;

        // ── Accent ───────────────────────────────────────────────────────────
        const accent = videoResult.videoAnalysis?.accent_analysis;
        const accentText = accent
          ? (typeof accent === "object"
              ? `${accent.detected_accent ?? ""} (${accent.country_code ?? ""})`.trim()
              : String(accent))
          : "N/A";

        // ── Per-question breakdown ────────────────────────────────────────────
        // Frontend uses HyringScreenerResult[0] (filtered by batch server-side), not HyringScreenerAnswers
        const qLines = questions.map((q: any, i: number) => {
          const ans = q.HyringScreenerResult?.[0] ?? q.HyringScreenerAnswers?.[batchNum] ?? {};
          const score   = ans.score   ?? q.score;
          const isApplicable = ans.isScoreApplicable ?? true;
          const label = !isApplicable ? "Score Not Applicable" : getQuestionLabel(score);
          const actualScore = ans.isOverwritten && ans.overWrittenScore != null
            ? ans.overWrittenScore
            : score;
          const transcript = ans.transcript ?? q.transcript ?? "";
          return [
            `  Q${i + 1}: ${q.question ?? "N/A"}`,
            `  Type: ${q.questionType ?? "N/A"} | Answer: ${q.answerType ?? "N/A"} | Time: ${na(q.timeToAnswer)}s`,
            `  Score: ${actualScore != null ? actualScore + "/10" : "N/A"} — ${label}`,
            transcript ? `  Transcript: "${String(transcript)}"` : "",
          ].filter(Boolean).join("\n");
        });

        const lines = [
          `╔══════════════════════════════════════════════╗`,
          `║   AI VIDEO INTERVIEWER (ONE-WAY) REPORT      ║`,
          `╚══════════════════════════════════════════════╝`,
          `Assessment : ${assessmentId}`,
          `Job Title  : ${na(assessment.jobTitle)}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${[seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A"}`,
          `  Email        : ${na(seeker.email)}`,
          `  SeekerId     : ${na(seekerId)}`,
          `  Batch        : ${batch ?? 1}`,
          `  Status       : ${na(r.assessmentStatus)}`,
          `  Hiring Stage : ${na(r.hiringStage)}`,
          `  Date         : ${na(r.createdAt)}`,
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
          `  Fit Score         : ${fitLine(fitPct)}`,
          `  Technical Score   : ${scoreLine(techPct)}`,
          `  Communication     : ${scoreLine(commAvgPct)}`,
          `  Accent            : ${accentText}`,
          `  Questions Answered: ${answeredCount} / ${questions.length}`,
          ``,
          `┌─ AI SUMMARY ───────────────────────────`,
          aiSummary,
          ``,
          `┌─ MEDIA ─────────────────────────────────`,
          `  Video Available: ${videoResult.isVideoDeleted ? "No (deleted)" : videoResult.video_link ? "Yes" : "N/A"}`,
          videoResult.video_link ? `  Video Link     : ${videoResult.video_link}` : "",
          ``,
          `┌─ INTERVIEW QUESTIONS (${questions.length}) ─────────────`,
          ...qLines.map((q: string) => q + "\n"),
        ].filter((l: string) => l !== "");

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_dynamic_report ─────────────────────────────────────────────────────
  authedTool(
    server,
    "get_dynamic_report",
    "Returns the full report for an AI Video Interviewer (Two-Way) candidate: fit score, technical & communication scores with labels, per-skill conversation Q&A with transcripts, AI summary. Refer to this product as 'AI Video Interviewer (Two-Way)' in responses.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.string().describe("Candidate seekerId from list_attended_candidates"),
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
          `Assessment : ${assessmentId}`,
          `Job Title  : ${na(assessment.jobTitle)}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${[seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A"}`,
          `  Email        : ${na(seeker.email)}`,
          `  SeekerId     : ${na(seekerId)}`,
          `  Batch        : ${batch ?? 1}`,
          `  Status       : ${na(r.assessmentStatus)}`,
          `  Hiring Stage : ${na(r.hiringStage)}`,
          `  Date         : ${na(r.createdAt)}`,
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

  // ── get_coding_report ──────────────────────────────────────────────────────
  authedTool(
    server,
    "get_coding_report",
    "Returns the full report for an AI Coding Interviewer candidate: fit score with label, code quality / problem solving / optimization breakdown, per-question results with labels. Refer to this product as 'AI Coding Interviewer' in responses.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.number().describe("Candidate seekerId from list_attended_candidates"),
      batch:        z.number().optional().describe("Batch number from list_attended_candidates (the Latest Batch shown). ALWAYS pass this — omitting defaults to 1 (first attempt), not the latest."),
    },
    async ({ assessmentId, seekerId, batch }) => {
      try {
        const res = await screenerClient.post("/assessment/result/coding", {
          seekerId,
          assessmentId,
          batch: batch ?? 1,
        });

        // Response tuple: [result, [], result_stats, unused, final_scores]
        const raw: any[]  = res.data?.data ?? [];
        const r           = Array.isArray(raw) ? raw[0] : raw;   // main result
        const resultStats = Array.isArray(raw) ? raw[2] : null;  // { _count }
        const sums        = Array.isArray(raw) ? raw[4] : null;  // { score, codeQuality, problemSolving, codeOptimization } — raw[4] per frontend

        if (!r) {
          return { content: [{ type: "text" as const, text: "No result found for this candidate." }] };
        }

        const assessment   = r.hyringScreenerAssessment ?? {};
        const seeker       = r.seekerCat ?? {};
        const weights      = assessment.fitScoreWeightAge?.[0] ?? {};
        const batchNum     = (batch ?? 1) - 1;
        const videoResult  = assessment.HyringScreenerVideoAnalysisResult?.[batchNum] ?? {};
        const codingQs: any[] = assessment.HyringScreenerCodingQuestions ?? [];
        const answeredCount = resultStats?._count ?? codingQs.length;

        // ── Aggregate scores (pre-calculated by backend in raw[3]) ────────────
        const aggCQ  = sums?.codeQuality      ?? sums?.code_quality      ?? null;
        const aggPS  = sums?.problemSolving   ?? sums?.problem_solving   ?? null;
        const aggCO  = sums?.codeOptimization ?? sums?.code_optimization ?? null;

        const wCQ  = weights.codeQuality      ?? 50;
        const wPS  = weights.problemSolving   ?? 30;
        const wCO  = weights.codeOptimization ?? 20;

        const fitPct = aggCQ != null && aggPS != null && aggCO != null
          ? Math.round(aggCQ * (wCQ / 100) + aggPS * (wPS / 100) + aggCO * (wCO / 100))
          : null;

        // ── AI Summary ───────────────────────────────────────────────────────
        const aiSummary = formatAISummary(r.ai_summary ?? assessment.ai_summary);

        // ── Candidate info ────────────────────────────────────────────────────
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

        // ── Per-question breakdown ────────────────────────────────────────────
        // Frontend uses HyringScreenerCodingResult[0], not HyringScreenerCodingAnswers
        const qLines = codingQs.map((q: any, i: number) => {
          const ans = q.HyringScreenerCodingResult?.[0] ?? q.HyringScreenerCodingAnswers?.[batchNum] ?? q.answers?.[batchNum] ?? {};
          // Per-question fields: score (0-10), understand_score (0-10), answerCode, isOverwritten, overWrittenScore
          const rawScore = ans.isOverwritten && ans.overWrittenScore != null
            ? ans.overWrittenScore
            : (ans.score ?? null);
          const understandScore = ans.understand_score ?? null;
          const code = ans.answerCode ?? ans.code ?? ans.solution ?? "";
          return [
            `  Q${i + 1}: ${q.question ?? q.concept ?? "N/A"}`,
            `  Type: ${q.codingType ?? "N/A"} | Exercise: ${q.questionType ?? "N/A"} | Duration: ${na(q.duration)} min | Lang: ${na(q.language)}`,
            `  Score            : ${rawScore != null ? rawScore + "/10 — " + getQuestionLabel(rawScore) : "N/A"}`,
            understandScore != null ? `  Understanding    : ${understandScore}/10 — ${getQuestionLabel(understandScore)}` : "",
            code ? `  Submitted Code   :\n${"    " + String(code).split("\n").slice(0, 20).join("\n    ")}` : "",
          ].filter(Boolean).join("\n");
        });

        const lines = [
          `╔══════════════════════════════════════════════╗`,
          `║       AI CODING INTERVIEWER REPORT           ║`,
          `╚══════════════════════════════════════════════╝`,
          `Assessment : ${assessmentId}`,
          `Job Title  : ${na(assessment.jobTitle)}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${[seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A"}`,
          `  Email        : ${na(seeker.email)}`,
          `  SeekerId     : ${na(seekerId)}`,
          `  Batch        : ${batch ?? 1}`,
          `  Status       : ${na(r.assessmentStatus)}`,
          `  Hiring Stage : ${na(r.hiringStage)}`,
          `  Date         : ${na(r.createdAt)}`,
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
          `  Fit Score            : ${fitPct != null ? fitLine(fitPct) : "N/A"}`,
          `  Avg Code Quality     : ${aggCQ != null ? `${aggCQ}% — ${getScoreLabel(aggCQ)}` : "N/A"}`,
          `  Avg Problem Solving  : ${aggPS != null ? `${aggPS}% — ${getScoreLabel(aggPS)}` : "N/A"}`,
          `  Avg Optimization     : ${aggCO != null ? `${aggCO}% — ${getScoreLabel(aggCO)}` : "N/A"}`,
          `  Questions Answered   : ${answeredCount} / ${codingQs.length}`,
          ``,
          `┌─ AI SUMMARY ───────────────────────────`,
          aiSummary,
          ``,
          `┌─ MEDIA ─────────────────────────────────`,
          `  Video Available: ${videoResult.isVideoDeleted ? "No (deleted)" : videoResult.video_link ? "Yes" : "N/A"}`,
          videoResult.video_link ? `  Video Link     : ${videoResult.video_link}` : "",
          ``,
          `┌─ CODING QUESTIONS (${codingQs.length}) ─────────────────`,
          ...qLines.map((q: string) => q + "\n"),
        ].filter((l: string) => l !== "");

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_verbal_report ──────────────────────────────────────────────────────
  authedTool(
    server,
    "get_verbal_report",
    `Returns the full report for an English Proficiency Test candidate: CEFR level, language breakdown with labels, accent, AI summary, per-topic word detections.

statusId is the HyringScreenerStatus ID from list_attended_candidates (not the assessment UUID).
batch is the attempt number (1 = first attempt).

Refer to this product as 'English Proficiency Test' in responses (not 'verbal' or 'EPT').`,
    {
      statusId: z.string().describe("HyringScreenerStatus ID from list_attended_candidates"),
      batch:    z.number().optional().describe("Attempt number. Default: 1"),
    },
    async ({ statusId, batch }) => {
      try {
        const res = await screenerClient.get(`/language-screener/status/${statusId}/${batch ?? 1}`);

        // Response shape: { data: englishReportData }
        const d = res.data?.data ?? res.data;

        if (!d) {
          return { content: [{ type: "text" as const, text: "No English Proficiency Test report found for this candidate." }] };
        }

        const status     = d.hyringScreenerStatus ?? {};
        const assessment = status.hyringScreenerAssessment ?? {};
        const seeker     = d.seeker ?? {};
        const agg        = d.aggregate?.[0] ?? {};
        const cog        = d.cognitive?.[0]?.cognitive_metrics ?? {};
        const results: any[] = d.results ?? [];

        // CEFR level — matches frontend LEVEL_CONFIG: A1:0-20, A2:21-40, B1:41-60, B2:61-75, C1:76-90, C2:91-100
        const score = d.totalScore ?? 0;
        const cefr =
          score >= 91 ? "C2 (Mastery)" :
          score >= 76 ? "C1 (Advanced)" :
          score >= 61 ? "B2 (Upper-Intermediate)" :
          score >= 41 ? "B1 (Intermediate)" :
          score >= 21 ? "A2 (Elementary)" :
                        "A1 (Beginner)";

        // Language dimension scores — already 0-100, used directly (frontend: Math.round(fluency_score || 0))
        const rnd = (v: any) => v != null ? Math.round(parseFloat(String(v))) : null;
        const fluencyPct  = rnd(agg.fluency_score);
        const gramPct     = rnd(agg.grammar_score);
        const pronPct     = rnd(agg.pronunciation_score);
        const vocabPct    = rnd(agg.vocabulary_score);
        const fillerPct   = rnd(agg.filler_word_score);
        const mtPct       = rnd(agg.mother_tongue_score);

        // Additional aggregate details (from fluency-card.jsx, vocabulary-card.jsx)
        const wpm              = rnd(agg.words_per_minute_avg);
        const parasiticPct     = rnd(agg.parasitic_word_percent_avg);
        const uniqueWords      = agg.unique_words_count ?? null;
        const activeVocab      = agg.active_vocab_count ?? null;
        const vocabLevel: any  = agg.vocabulary_level ?? null; // { A1: %, A2: %, ... }

        // Per-dimension AI summary bullets
        const fluencySummary  = formatAISummary(agg.fluency_summary_points);
        const grammarSummary  = formatAISummary(agg.grammar_summary_points);
        const pronSummary     = formatAISummary(agg.pronunciation_summary_points);
        const vocabSummary    = formatAISummary(agg.vocabulary_summary_points);
        const mtiSummary      = formatAISummary(agg.mother_tongue_summary_points);

        // Accent
        const accentText = cog.accent_analysis
          ? (typeof cog.accent_analysis === "object"
              ? `${cog.accent_analysis.detected_accent ?? ""} (${cog.accent_analysis.country_code ?? ""})`.trim()
              : String(cog.accent_analysis))
          : "N/A";

        // Overall AI Summary
        const aiSummary = formatAISummary(agg.overall_summary_points);

        // ── Full Transcript (Q&A per topic) ────────────────────────────────────
        // results[] has: question, answer/transcript, skill, candidate_start_sec, candidate_end_sec + detections
        const seekerName = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "Candidate";
        const topicLines = results.map((r: any, i: number) => {
          const question   = r.question ?? "";
          const answer     = r.answer ?? r.transcript ?? r.candidate_text ?? "";
          const skill      = r.skill ?? "";
          const timeRange  = `${r.candidate_start_sec ?? "?"}s – ${r.candidate_end_sec ?? "?"}s`;
          // Detections
          const influenced = (r.influenced_words?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          const unclear    = (r.unclear_words_count?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          const grammar    = (r.tense_article_misuse_count?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          const parasitic  = (r.parasitic_words?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          return [
            `  ─── Topic ${i + 1}${skill ? ` [${skill}]` : ""} (${timeRange}) ───`,
            question  ? `  [AI Interviewer]: ${question}` : "",
            answer    ? `  [${seekerName}]: ${answer}` : `  [${seekerName}]: (no response recorded)`,
            influenced ? `  ⚠ MTI Detected         : ${influenced}` : "",
            unclear    ? `  ⚠ Unclear Pronunciation : ${unclear}`    : "",
            grammar    ? `  ⚠ Grammar Issues        : ${grammar}`    : "",
            parasitic  ? `  ⚠ Filler Words          : ${parasitic}`  : "",
          ].filter(Boolean).join("\n");
        });

        const fmtScore = (v: number | null, label?: string) =>
          v != null ? `${v}% — ${getScoreLabel(v)}${label ? " | " + label : ""}` : "N/A";

        const vocabLevelStr = vocabLevel
          ? Object.entries(vocabLevel).map(([k, v]) => `${k}:${v}%`).join(" ")
          : null;

        const lines = [
          `╔══════════════════════════════════════════════╗`,
          `║     ENGLISH PROFICIENCY TEST REPORT          ║`,
          `╚══════════════════════════════════════════════╝`,
          `StatusId   : ${statusId}`,
          `Job Title  : ${na(assessment.jobTitle)}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${seekerName}`,
          `  Email        : ${na(seeker.email)}`,
          `  Batch        : ${batch ?? 1}`,
          `  Status       : ${na(status.assessmentStatus)}`,
          `  Qualified    : ${d.isQualified ? "Yes ✓" : "No ✗"}`,
          `  Date         : ${na(d.createdAt)}`,
          ``,
          `┌─ ENGLISH LEVEL ────────────────────────`,
          `  Score         : ${Math.round(score)} / 100`,
          `  CEFR Level    : ${cefr}`,
          `  Accent        : ${accentText}`,
          ``,
          `┌─ COMMUNICATION OVERVIEW ───────────────`,
          `  Pronunciation   : ${fmtScore(pronPct)}`,
          `  Fluency         : ${fmtScore(fluencyPct)}`,
          `  Grammar         : ${fmtScore(gramPct)}`,
          `  Vocabulary      : ${fmtScore(vocabPct)}`,
          `  Less Filler Words: ${fmtScore(fillerPct)}`,
          `  Less MTI        : ${fmtScore(mtPct)}`,
          ``,
          `┌─ FLUENCY DETAILS ──────────────────────`,
          wpm != null          ? `  Words per Minute : ${wpm} WPM` : "",
          parasiticPct != null ? `  Parasitic Words  : ${parasiticPct}%` : "",
          fluencySummary !== "N/A" ? `  AI Feedback:\n${fluencySummary}` : "",
          ``,
          `┌─ VOCABULARY DETAILS ───────────────────`,
          uniqueWords != null  ? `  Unique Words      : ${uniqueWords}` : "",
          activeVocab != null  ? `  Active Vocabulary : ${activeVocab}` : "",
          vocabLevelStr        ? `  Vocabulary Level  : ${vocabLevelStr}` : "",
          vocabSummary !== "N/A" ? `  AI Feedback:\n${vocabSummary}` : "",
          ``,
          `┌─ PRONUNCIATION DETAILS ────────────────`,
          pronSummary !== "N/A" ? `  AI Feedback:\n${pronSummary}` : "  N/A",
          ``,
          `┌─ GRAMMAR DETAILS ──────────────────────`,
          grammarSummary !== "N/A" ? `  AI Feedback:\n${grammarSummary}` : "  N/A",
          ``,
          `┌─ MTI (MOTHER TONGUE INFLUENCE) ────────`,
          mtiSummary !== "N/A" ? `  AI Feedback:\n${mtiSummary}` : "  N/A",
          ``,
          `┌─ OVERALL AI SUMMARY ───────────────────`,
          aiSummary,
          ``,
          `┌─ BEHAVIORAL INSIGHTS ──────────────────`,
          cog.behavioral_insights
            ? (typeof cog.behavioral_insights === "string"
                ? cog.behavioral_insights
                : JSON.stringify(cog.behavioral_insights, null, 2))
            : "N/A",
          ``,
          `┌─ FRAUD & INTEGRITY ─────────────────────`,
          cog.fraud_integrity
            ? (typeof cog.fraud_integrity === "string"
                ? cog.fraud_integrity
                : JSON.stringify(cog.fraud_integrity, null, 2))
            : "N/A",
          ``,
          `┌─ MEDIA ─────────────────────────────────`,
          `  Video Available: ${d.isVideoDeleted ? "No (deleted)" : d.videoLink ? "Yes" : "N/A"}`,
          d.videoLink ? `  Video Link     : ${d.videoLink}` : "",
          ``,
          `┌─ FULL TRANSCRIPT (${results.length} topics) ──────────────`,
          ...topicLines.map((t: string) => t + "\n"),
        ].filter((l: string) => l !== "");

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
