import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError } from "../api/screener.client";
import { authedTool } from "../server";

// ── Score label helpers (match frontend communication-helper.js exactly) ──────

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
    `Lists candidates who have completed an assessment, with their scores and hiring stage.

For verbal (EPT) assessments each entry includes a statusId — pass that to get_verbal_report.
For all other types the seekerId is used with get_fixed_report / get_dynamic_report / get_coding_report.`,
    {
      assessmentId:  z.string().describe("Assessment UUID"),
      interviewType: z.enum(["fixed", "dynamic", "coding", "verbal"]).describe("Type of assessment"),
    },
    async ({ assessmentId, interviewType }) => {
      try {
        let candidates: any[] = [];

        if (interviewType === "verbal") {
          // Verbal attended — tuple: [assessmentData, topFive, filteredResponses, total_count, ...]
          const res = await screenerClient.get(`/assessment/verbal/attended/${assessmentId}`);
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
          const stage    = c.hiringStage ?? "N/A";
          const score    = c.totalScore  ?? "N/A";

          const idInfo = interviewType === "verbal"
            ? `StatusId: ${statusId}`
            : `SeekerId: ${seekerId}`;

          return `${i + 1}. [${idInfo} | Batch: ${batch}] ${name} <${email}>\n   Score: ${score} | Stage: ${stage}`;
        });

        const idHint = interviewType === "verbal"
          ? `\nUse the StatusId + Batch with get_verbal_report.`
          : `\nUse SeekerId + Batch with get_${interviewType === "fixed" ? "fixed" : interviewType === "dynamic" ? "dynamic" : "coding"}_report.`;

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
    "Returns the full report for a One-Way (fixed) interview candidate: fit score, technical & communication scores with labels, per-question breakdown with transcripts, AI summary, and candidate info.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.number().describe("Candidate seekerId from list_attended_candidates"),
      batch:        z.number().optional().describe("Retake batch number. Default: 1 (first attempt)"),
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
        const videoResult  = assessment.HyringScreenerVideoAnalysisResult?.[0] ?? {};
        const speech       = videoResult.videoAnalysis?.speech_proficiency ?? {};
        const batchNum     = (batch ?? 1) - 1;
        const questions: any[] = assessment.hyringScreenerQuestions ?? [];
        const answeredCount = resultStats?._count ?? questions.length;

        // ── Communication scores ─────────────────────────────────────────────
        // raw[3] has aggregate raw sums (english_pronunciation etc.) from per-question scoring
        // Normalize: (rawSum / (answeredCount × 10)) × 100
        const hasEngAgg = engScoreAgg && (
          engScoreAgg.english_pronunciation != null ||
          engScoreAgg.english_score != null ||
          engScoreAgg.english_fluency != null
        );

        let pronPct: number, gramPct: number, vocabPct: number, fillerPct: number, fluencyPct: number;

        if (hasEngAgg && answeredCount > 0) {
          pronPct   = normalizeEngScore(engScoreAgg.english_pronunciation ?? 0, answeredCount);
          gramPct   = normalizeEngScore(engScoreAgg.english_score         ?? 0, answeredCount);
          vocabPct  = normalizeEngScore(engScoreAgg.english_vocabulary    ?? 0, answeredCount);
          fillerPct = normalizeEngScore(engScoreAgg.english_filler_words  ?? 0, answeredCount);
          fluencyPct = normalizeEngScore(engScoreAgg.english_fluency      ?? 0, answeredCount);
        } else {
          // Fallback: speech_proficiency from video analysis (already normalized 0-100)
          const s2p = (v: any) => v != null ? Math.round(parseFloat(String(v))) : 0;
          pronPct    = s2p(speech.pronunciation);
          gramPct    = s2p(speech.grammar);
          vocabPct   = s2p(speech.vocabulary);
          fillerPct  = s2p(speech.filler_words);
          fluencyPct = s2p(speech.fluency);
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
        const qLines = questions.map((q: any, i: number) => {
          const ans = q.HyringScreenerAnswers?.[batchNum] ?? {};
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
            transcript ? `  Transcript: "${String(transcript).slice(0, 300)}${String(transcript).length > 300 ? "…" : ""}"` : "",
          ].filter(Boolean).join("\n");
        });

        const lines = [
          `╔══════════════════════════════════════╗`,
          `║      ONE-WAY INTERVIEW REPORT        ║`,
          `╚══════════════════════════════════════╝`,
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
          `  Technical Score   : ${scoreLine(techPct)}`,
          `  Fit Score         : ${fitLine(fitPct)}`,
          `    └ Weights → Technical: ${wTech}% | Communication: ${wComm}%`,
          `  Questions Answered: ${answeredCount} / ${questions.length}`,
          ``,
          `┌─ COMMUNICATION BREAKDOWN ──────────────`,
          `  Pronunciation      : ${pronPct}%  — ${getScoreLabel(pronPct)}`,
          `  Grammar            : ${gramPct}%  — ${getScoreLabel(gramPct)}`,
          `  Vocabulary         : ${vocabPct}%  — ${getScoreLabel(vocabPct)}`,
          `  Fluency            : ${fluencyPct}%  — ${getScoreLabel(fluencyPct)}`,
          `  Minimal Filler Words: ${fillerPct}% — ${getScoreLabel(fillerPct)}`,
          `  Overall Comm Avg   : ${commAvgPct}% — ${getScoreLabel(commAvgPct)}`,
          `  Accent             : ${accentText}`,
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
    "Returns the full report for a Two-Way (dynamic AI) interview candidate: fit score, technical & communication scores with labels, per-skill conversation Q&A with transcripts, AI summary.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.string().describe("Candidate seekerId from list_attended_candidates"),
      batch:        z.number().optional().describe("Retake batch number. Default: 1"),
    },
    async ({ assessmentId, seekerId, batch }) => {
      try {
        const res = await screenerClient.post("/seeker/dynamic-interview/context-result", {
          seekerId,
          assessmentId,
          batch: batch ?? 1,
        });

        // Backend returns: { status: true, message: "ok", data: result }
        const r = res.data?.data ?? res.data;

        if (!r) {
          return { content: [{ type: "text" as const, text: "No result found for this candidate." }] };
        }

        const assessment     = r.hyringScreenerAssessment ?? {};
        const seeker         = r.seekerCat ?? {};
        const weights        = assessment.fitScoreWeightAge?.[0] ?? {};
        const contextResult  = assessment.hyringScreenerContextResult?.[0] ?? {};
        const context0       = contextResult.context_result?.[0] ?? {};
        const batchNum       = (batch ?? 1) - 1;

        // ── Communication scores ─────────────────────────────────────────────
        // Two-way: english_score in context_result has pronunciation_score, grammar_score etc. (0-10)
        // Percentage = value × 10  (same as transformDataVapiIntelligence)
        const langScore = context0.english_score ?? contextResult.videoAnalysis?.speech_proficiency ?? {};

        const toCommPct = (v: any) => v != null ? Math.round(parseFloat(String(v)) * 10) : 0;
        const pronPct    = toCommPct(langScore.pronunciation_score ?? langScore.pronunciation);
        const gramPct    = toCommPct(langScore.grammar_score       ?? langScore.grammar);
        const vocabPct   = toCommPct(langScore.vocabulary_score    ?? langScore.vocabulary);
        const fillerPct  = toCommPct(langScore.filler_score        ?? langScore.filler_words);
        const fluencyPct = toCommPct(langScore.fluency_score       ?? langScore.fluency);
        const commAvgPct = Math.round((pronPct + gramPct + vocabPct + fillerPct + fluencyPct) / 5);

        // ── Fit Score ────────────────────────────────────────────────────────
        const techPct = r.totalScore ?? 0;
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
        const conversation: any[] = context0.conversation ?? [];
        const skillContexts: any[] = assessment.HyringScreenerContext ?? [];

        const convLines: string[] = [];
        if (skillContexts.length && conversation.length) {
          skillContexts.forEach((ctx: any, si: number) => {
            convLines.push(`  ▸ Skill ${si + 1}: ${ctx.skill ?? "N/A"} (${ctx.level ?? "N/A"})`);
            const related = conversation.filter(
              (c: any) => c.skill === ctx.skill || c.contextId === ctx.id
            );
            if (related.length) {
              related.forEach((c: any, ci: number) => {
                const score = c.isOverwritten && c.overWrittenScore != null
                  ? c.overWrittenScore
                  : c.score;
                const isApplicable = c.score_applicable !== false;
                const label = !isApplicable ? "Score Not Applicable" : getQuestionLabel(score);
                convLines.push(`    Q${ci + 1}: ${c.question ?? "N/A"}`);
                convLines.push(`    Score: ${score != null ? score + "/10" : "N/A"} — ${label}`);
                if (c.answer) {
                  const ans = String(c.answer);
                  convLines.push(`    Answer: "${ans.slice(0, 300)}${ans.length > 300 ? "…" : ""}"`);
                }
                convLines.push("");
              });
            } else {
              convLines.push("    (no questions recorded for this skill)");
              convLines.push("");
            }
          });
        } else {
          conversation.slice(0, 30).forEach((c: any, ci: number) => {
            const score = c.isOverwritten && c.overWrittenScore != null ? c.overWrittenScore : c.score;
            const isApplicable = c.score_applicable !== false;
            const label = !isApplicable ? "Score Not Applicable" : getQuestionLabel(score);
            convLines.push(`  Q${ci + 1}: ${c.question ?? "N/A"}`);
            convLines.push(`  Score: ${score != null ? score + "/10" : "N/A"} — ${label}`);
            if (c.answer) {
              const ans = String(c.answer);
              convLines.push(`  Answer: "${ans.slice(0, 300)}${ans.length > 300 ? "…" : ""}"`);
            }
            convLines.push("");
          });
        }

        const lines = [
          `╔══════════════════════════════════════╗`,
          `║      TWO-WAY INTERVIEW REPORT        ║`,
          `╚══════════════════════════════════════╝`,
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
          `  Technical Score : ${scoreLine(techPct)}`,
          `  Fit Score       : ${fitLine(fitPct)}`,
          `    └ Weights → Technical: ${wTech}% | Communication: ${wComm}%`,
          ``,
          `┌─ COMMUNICATION BREAKDOWN ──────────────`,
          `  Pronunciation      : ${pronPct}%  — ${getScoreLabel(pronPct)}`,
          `  Grammar            : ${gramPct}%  — ${getScoreLabel(gramPct)}`,
          `  Vocabulary         : ${vocabPct}%  — ${getScoreLabel(vocabPct)}`,
          `  Fluency            : ${fluencyPct}%  — ${getScoreLabel(fluencyPct)}`,
          `  Minimal Filler Words: ${fillerPct}% — ${getScoreLabel(fillerPct)}`,
          `  Overall Comm Avg   : ${commAvgPct}% — ${getScoreLabel(commAvgPct)}`,
          `  Accent             : ${accentText}`,
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
    "Returns the full report for a Coding interview candidate: fit score with label, code quality / problem solving / optimization breakdown, per-question results with labels.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.number().describe("Candidate seekerId from list_attended_candidates"),
      batch:        z.number().optional().describe("Retake batch number. Default: 1"),
    },
    async ({ assessmentId, seekerId, batch }) => {
      try {
        const res = await screenerClient.post("/assessment/result/coding", {
          seekerId,
          assessmentId,
          batch: batch ?? 1,
        });

        // Response tuple: [result, [], result_stats, sums, final_score]
        const raw: any[]  = res.data?.data ?? [];
        const r           = Array.isArray(raw) ? raw[0] : raw;   // main result
        const resultStats = Array.isArray(raw) ? raw[2] : null;  // { _count }
        const sums        = Array.isArray(raw) ? raw[3] : null;  // { codeQuality, problemSolving, codeOptimization, score }
        const finalScore  = Array.isArray(raw) ? raw[4] : null;  // final score breakdown

        if (!r) {
          return { content: [{ type: "text" as const, text: "No result found for this candidate." }] };
        }

        const assessment   = r.hyringScreenerAssessment ?? {};
        const seeker       = r.seekerCat ?? {};
        const weights      = assessment.fitScoreWeightAge?.[0] ?? {};
        const videoResult  = assessment.HyringScreenerVideoAnalysisResult?.[0] ?? {};
        const codingQs: any[] = assessment.HyringScreenerCodingQuestions ?? [];
        const batchNum     = (batch ?? 1) - 1;
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
        const qLines = codingQs.map((q: any, i: number) => {
          const ans = q.HyringScreenerCodingAnswers?.[batchNum] ?? q.answers?.[batchNum] ?? {};
          const cq  = ans.codeQuality      ?? q.codeQuality      ?? null;
          const ps  = ans.problemSolving   ?? q.problemSolving   ?? null;
          const co  = ans.codeOptimization ?? q.codeOptimization ?? null;
          const labelFor = (v: number | null) => v != null ? `${v}% — ${getScoreLabel(v)}` : "N/A";
          const code = ans.code ?? ans.solution ?? "";
          return [
            `  Q${i + 1}: ${q.question ?? q.concept ?? "N/A"}`,
            `  Type: ${q.codingType ?? "N/A"} | Exercise: ${q.questionType ?? "N/A"} | Duration: ${na(q.duration)} min | Lang: ${na(q.language)}`,
            `  Code Quality     : ${labelFor(cq)}`,
            `  Problem Solving  : ${labelFor(ps)}`,
            `  Optimization     : ${labelFor(co)}`,
            code ? `  Submitted Code   :\n${"    " + String(code).split("\n").slice(0, 20).join("\n    ")}` : "",
          ].filter(Boolean).join("\n");
        });

        const lines = [
          `╔══════════════════════════════════════╗`,
          `║       CODING INTERVIEW REPORT        ║`,
          `╚══════════════════════════════════════╝`,
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
          `  Overall Score        : ${na(r.totalScore)}`,
          fitPct != null
            ? `  Fit Score            : ${fitLine(fitPct)}`
            : `  Fit Score            : N/A`,
          `    └ Weights → Code Quality: ${wCQ}% | Problem Solving: ${wPS}% | Optimization: ${wCO}%`,
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
    `Returns the full report for a Verbal/EPT (English Proficiency Test) candidate: CEFR level, language breakdown with labels, accent, AI summary, per-topic word detections.

statusId is the HyringScreenerStatus ID from list_attended_candidates (not the assessment UUID).
batch is the attempt number (1 = first attempt).`,
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
          return { content: [{ type: "text" as const, text: "No verbal report found for this candidate." }] };
        }

        const status     = d.hyringScreenerStatus ?? {};
        const assessment = status.hyringScreenerAssessment ?? {};
        const seeker     = d.seeker ?? {};
        const agg        = d.aggregate?.[0] ?? {};
        const cog        = d.cognitive?.[0]?.cognitive_metrics ?? {};
        const results: any[] = d.results ?? [];

        // CEFR level from totalScore
        const score = d.totalScore ?? 0;
        const cefr =
          score >= 90 ? "C2 (Mastery)" :
          score >= 80 ? "C1 (Advanced)" :
          score >= 70 ? "B2 (Upper-Intermediate)" :
          score >= 60 ? "B1 (Intermediate)" :
          score >= 50 ? "A2 (Elementary)" :
                        "A1 (Beginner)";

        // Language dimension scores (0-10 scale → × 10 for %)
        const toCommPct = (v: any) => v != null ? Math.round(parseFloat(String(v)) * 10) : 0;
        const fluencyPct  = toCommPct(agg.fluency_score);
        const gramPct     = toCommPct(agg.grammar_score);
        const pronPct     = toCommPct(agg.pronunciation_score);
        const vocabPct    = toCommPct(agg.vocabulary_score);
        const fillerPct   = toCommPct(agg.filler_word_score);
        const mtPct       = toCommPct(agg.mother_tongue_score);

        // Accent
        const accentText = cog.accent_analysis
          ? (typeof cog.accent_analysis === "object"
              ? `${cog.accent_analysis.detected_accent ?? ""} (${cog.accent_analysis.country_code ?? ""})`.trim()
              : String(cog.accent_analysis))
          : "N/A";

        // AI Summary
        const aiSummary = formatAISummary(agg.overall_summary_points);

        // Per-topic word detections
        const topicLines = results.map((r: any, i: number) => {
          const influenced = (r.influenced_words?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          const unclear    = (r.unclear_words_count?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          const grammar    = (r.tense_article_misuse_count?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          const parasitic  = (r.parasitic_words?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          return [
            `  Topic ${i + 1}: [${r.candidate_start_sec ?? "?"}s – ${r.candidate_end_sec ?? "?"}s]`,
            influenced ? `  Mother Tongue Influenced : ${influenced}` : "",
            unclear    ? `  Unclear Pronunciation    : ${unclear}`    : "",
            grammar    ? `  Grammar Issues           : ${grammar}`    : "",
            parasitic  ? `  Filler/Parasitic Words   : ${parasitic}`  : "",
          ].filter(Boolean).join("\n");
        });

        const lines = [
          `╔══════════════════════════════════════╗`,
          `║   ENGLISH PROFICIENCY TEST REPORT    ║`,
          `╚══════════════════════════════════════╝`,
          `StatusId   : ${statusId}`,
          `Job Title  : ${na(assessment.jobTitle)}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${[seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || na(seeker.fullName)}`,
          `  Email        : ${na(seeker.email)}`,
          `  SeekerId     : ${na(d.seeker_id)}`,
          `  Batch        : ${batch ?? 1}`,
          `  Status       : ${na(status.assessmentStatus)}`,
          `  Hiring Stage : ${na(d.hiringStage)}`,
          `  Qualified    : ${d.isQualified ? "Yes ✓" : "No ✗"}`,
          `  Date         : ${na(d.createdAt)}`,
          ``,
          `┌─ OVERALL SCORE ─────────────────────────`,
          `  Total Score : ${na(score)}% → ${cefr}`,
          ``,
          `┌─ LANGUAGE BREAKDOWN ───────────────────`,
          `  Fluency            : ${fluencyPct}%  — ${getScoreLabel(fluencyPct)}`,
          `  Grammar            : ${gramPct}%  — ${getScoreLabel(gramPct)}`,
          `  Pronunciation      : ${pronPct}%  — ${getScoreLabel(pronPct)}`,
          `  Vocabulary         : ${vocabPct}%  — ${getScoreLabel(vocabPct)}`,
          `  Minimal Filler Words: ${fillerPct}% — ${getScoreLabel(fillerPct)}`,
          `  Mother Tongue Influence: ${mtPct}% — ${getScoreLabel(mtPct)}`,
          `  Accent             : ${accentText}`,
          ``,
          `┌─ AI SUMMARY ───────────────────────────`,
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
          `┌─ TOPIC BREAKDOWN (${results.length} topics) ──────────────`,
          ...topicLines.map((t: string) => t + "\n"),
        ].filter((l: string) => l !== "");

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
