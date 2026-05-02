import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError } from "../../api/screener.client";
import { authedTool } from "../../server";
import {
  getQuestionLabel, fitLine, scoreLine, na,
  mapStatus, mapStage, fmtDate, formatAISummary, normalizeEngScore,
} from "../helpers";

export function registerOneWayReportTools(server: McpServer) {

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
        // Backend filters HyringScreenerVideoAnalysisResult WHERE batch=N, so result is always at [0]
        const videoResult  = assessment.HyringScreenerVideoAnalysisResult?.[0] ?? {};
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
}
