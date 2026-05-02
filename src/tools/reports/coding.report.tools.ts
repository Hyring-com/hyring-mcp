import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError } from "../../api/screener.client";
import { authedTool } from "../../server";
import {
  getQuestionLabel, getScoreLabel, fitLine, na,
  mapStatus, mapStage, fmtDate, formatAISummary,
} from "../helpers";

export function registerCodingReportTools(server: McpServer) {

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
        // Backend filters HyringScreenerVideoAnalysisResult WHERE batch=N, so result is always at [0]
        const videoResult  = assessment.HyringScreenerVideoAnalysisResult?.[0] ?? {};
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
}
