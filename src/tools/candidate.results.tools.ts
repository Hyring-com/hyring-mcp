import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, requireAuth, extractError } from "../api/screener.client";

// ── Score helpers ──────────────────────────────────────────────────────────────

function calcFixedFitScore(totalScore: number, commScore: number, weights: any): string {
  if (!weights) return "N/A";
  const tech = weights.technicalScore ?? 50;
  const comm = weights.communicationScore ?? 50;
  const fit = (totalScore * (tech / 100)) + (commScore * (comm / 100));
  return fit.toFixed(1);
}

function calcCodingFitScore(scores: any, weights: any): string {
  if (!weights || !scores) return "N/A";
  const fit =
    (scores.codeQuality    ?? 0) * ((weights.codeQuality    ?? 50) / 100) +
    (scores.problemSolving ?? 0) * ((weights.problemSolving ?? 30) / 100) +
    (scores.codeOptimization ?? 0) * ((weights.codeOptimization ?? 20) / 100);
  return fit.toFixed(1);
}

function avgComm(sp: any): string {
  if (!sp) return "N/A";
  const vals = [sp.grammar, sp.fluency, sp.pronunciation, sp.vocabulary, sp.filler_words]
    .filter((v) => v != null && !isNaN(v));
  if (!vals.length) return "N/A";
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function na(v: any): string {
  return v != null ? String(v) : "N/A";
}

export function registerCandidateResultsTools(server: McpServer) {

  // ── list_attended_candidates ───────────────────────────────────────────────
  server.tool(
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
        requireAuth();

        let candidates: any[] = [];

        if (interviewType === "verbal") {
          // Verbal attended list
          const res = await screenerClient.get(`/assessment/verbal/attended/seekers/${assessmentId}`);
          const raw = res.data?.data;
          candidates = Array.isArray(raw) ? raw : Array.isArray(raw?.[0]) ? raw[0] : [];
        } else {
          // Fixed / dynamic / coding attended list
          const res = await screenerClient.get(`/assessment/view/attended/seekers/${assessmentId}`);
          const raw = res.data?.data;
          candidates = Array.isArray(raw) ? raw : Array.isArray(raw?.[0]) ? raw[0] : [];
        }

        if (!candidates.length) {
          return { content: [{ type: "text" as const, text: `No attended candidates found for assessment ${assessmentId}.` }] };
        }

        const lines = candidates.map((c: any, i: number) => {
          const seeker   = c.seekerCat ?? c;
          const name     = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A";
          const email    = seeker.email ?? c.email ?? "N/A";
          const seekerId = c.seekerId ?? seeker.seekerId ?? "N/A";
          const statusId = c.id ?? c.statusId ?? "N/A"; // HyringScreenerStatus.id — needed for verbal report
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
  server.tool(
    "get_fixed_report",
    "Returns the full report for a One-Way (fixed) interview candidate: scores, per-question breakdown, communication analysis, and proctoring.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.number().describe("Candidate seekerId from list_attended_candidates"),
      batch:        z.number().optional().describe("Retake batch number. Default: 1 (first attempt)"),
    },
    async ({ assessmentId, seekerId, batch }) => {
      try {
        requireAuth();

        const res = await screenerClient.post("/assessment/result", {
          seekerId,
          assessmentId,
          batch: batch ?? null,
        });

        // Response shape: { data: [result_obj, extra, count_obj] }
        const raw: any[] = res.data?.data ?? [];
        const r = Array.isArray(raw) ? raw[0] : raw;

        if (!r) {
          return { content: [{ type: "text" as const, text: "No result found for this candidate." }] };
        }

        const assessment  = r.hyringScreenerAssessment ?? {};
        const seeker      = r.seekerCat ?? {};
        const weights     = assessment.fitScoreWeightAge?.[0] ?? {};
        const videoResult = assessment.HyringScreenerVideoAnalysisResult?.[0] ?? {};
        const speech      = videoResult.videoAnalysis?.speech_proficiency ?? {};
        const batchNum    = (batch ?? 1) - 1;
        const engScores   = seeker.HyringScreenerResult?.[batchNum] ?? {};
        const questions: any[] = assessment.hyringScreenerQuestions ?? [];
        const answeredCount = raw[2]?._count ?? "N/A";

        // Communication scores: prefer video analysis, fallback to english_score fields
        const grammar      = speech.grammar       ?? engScores.english_score        ?? "N/A";
        const fluency      = speech.fluency       ?? engScores.english_fluency      ?? "N/A";
        const pronunciation = speech.pronunciation ?? engScores.english_pronunciation ?? "N/A";
        const vocabulary   = speech.vocabulary    ?? engScores.english_vocabulary   ?? "N/A";
        const filler       = speech.filler_words  ?? engScores.english_filler_words ?? "N/A";

        const commAvg = avgComm(speech) !== "N/A" ? avgComm(speech) : "N/A";
        const fitScore = calcFixedFitScore(r.totalScore ?? 0, parseFloat(commAvg) || 0, weights);

        // Per-question breakdown
        const qLines = questions.map((q: any, i: number) => {
          const ans = q.HyringScreenerAnswers?.[batchNum] ?? q;
          return [
            `  Q${i + 1}: ${q.question ?? "N/A"}`,
            `  Type: ${q.questionType ?? "N/A"} | Answer: ${q.answerType ?? "N/A"} | Time: ${q.timeToAnswer ?? "N/A"}s`,
            `  Score: ${na(ans.score ?? q.score)} | English Score: ${na(ans.english_score ?? q.english_score)}`,
            ans.transcript ? `  Transcript: "${String(ans.transcript).slice(0, 180)}..."` : "",
          ].filter(Boolean).join("\n");
        });

        const lines = [
          `=== ONE-WAY INTERVIEW REPORT ===`,
          `Assessment: ${assessmentId}`,
          `Job Title:  ${na(assessment.jobTitle)}`,
          ``,
          `--- Candidate ---`,
          `Name:         ${[seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A"}`,
          `Email:        ${na(seeker.email)}`,
          `SeekerId:     ${na(seekerId)}`,
          `Batch:        ${batch ?? 1}`,
          `Status:       ${na(r.assessmentStatus)}`,
          `Hiring Stage: ${na(r.hiringStage)}`,
          `Date:         ${na(r.createdAt)}`,
          ``,
          `--- Scores ---`,
          `Overall Score:        ${na(r.totalScore)}`,
          `Fit Score:            ${fitScore}`,
          `  Weights → Technical: ${na(weights.technicalScore)}% | Communication: ${na(weights.communicationScore)}%`,
          `Questions Answered:   ${answeredCount} / ${questions.length}`,
          ``,
          `--- Communication Breakdown ---`,
          `Grammar:       ${na(grammar)}`,
          `Fluency:       ${na(fluency)}`,
          `Pronunciation: ${na(pronunciation)}`,
          `Vocabulary:    ${na(vocabulary)}`,
          `Filler Words:  ${na(filler)}`,
          `Average:       ${commAvg}`,
          ``,
          `--- Proctoring ---`,
          `Video Link:       ${na(videoResult.video_link)}`,
          `Video Available:  ${videoResult.isVideoDeleted ? "No (deleted)" : videoResult.video_link ? "Yes" : "N/A"}`,
          `Accent Analysis:  ${na(videoResult.videoAnalysis?.accent_analysis)}`,
          ``,
          `--- Questions (${questions.length}) ---`,
          ...qLines,
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_dynamic_report ─────────────────────────────────────────────────────
  server.tool(
    "get_dynamic_report",
    "Returns the full report for a Two-Way (dynamic AI) interview candidate: scores, per-skill conversation Q&A, communication analysis.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.string().describe("Candidate seekerId from list_attended_candidates"),
      batch:        z.number().optional().describe("Retake batch number. Default: 1"),
    },
    async ({ assessmentId, seekerId, batch }) => {
      try {
        requireAuth();

        // seekerBaseUrl = baseUrl + /seeker — same client, just /seeker prefix on path
        const res = await screenerClient.post("/seeker/dynamic-interview/context-result", {
          seekerId,
          assessmentId,
          batch: batch ?? null,
        });

        // Response shape: { data: { data: twoWayResult } }
        const r = res.data?.data?.data ?? res.data?.data ?? res.data;

        if (!r) {
          return { content: [{ type: "text" as const, text: "No result found for this candidate." }] };
        }

        const assessment   = r.hyringScreenerAssessment ?? {};
        const seeker       = r.seekerCat ?? {};
        const weights      = assessment.fitScoreWeightAge?.[0] ?? {};
        const contextResult = assessment.hyringScreenerContextResult?.[0] ?? {};
        const context0     = contextResult.context_result?.[0] ?? {};
        const speech       = contextResult.videoAnalysis?.speech_proficiency ?? context0.english_score ?? {};
        const conversation: any[] = context0.conversation ?? [];
        const skillContexts: any[] = assessment.HyringScreenerContext ?? [];

        const commAvg = avgComm(speech);
        const fitScore = calcFixedFitScore(r.totalScore ?? 0, parseFloat(commAvg) || 0, weights);

        // Group conversation by skill context
        const skillLines: string[] = [];
        if (skillContexts.length) {
          skillContexts.forEach((ctx: any, si: number) => {
            skillLines.push(`  Skill ${si + 1}: ${ctx.skill ?? "N/A"} (${ctx.level ?? "N/A"})`);
            const related = conversation.filter((c: any) => c.skill === ctx.skill || c.contextId === ctx.id);
            if (related.length) {
              related.forEach((c: any, ci: number) => {
                skillLines.push(`    Q${ci + 1}: ${c.question ?? "N/A"}`);
                skillLines.push(`    A: ${c.answer ? String(c.answer).slice(0, 200) : "N/A"}`);
                skillLines.push(`    Score: ${na(c.score ?? c.overWrittenScore)}`);
              });
            }
          });
        } else {
          // No skill context map — just dump conversation
          conversation.slice(0, 20).forEach((c: any, ci: number) => {
            skillLines.push(`  Q${ci + 1}: ${c.question ?? "N/A"}`);
            skillLines.push(`  A: ${c.answer ? String(c.answer).slice(0, 200) : "N/A"}`);
            skillLines.push(`  Score: ${na(c.score ?? c.overWrittenScore)}`);
            skillLines.push(``);
          });
        }

        const lines = [
          `=== TWO-WAY INTERVIEW REPORT ===`,
          `Assessment: ${assessmentId}`,
          `Job Title:  ${na(assessment.jobTitle)}`,
          ``,
          `--- Candidate ---`,
          `Name:         ${[seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A"}`,
          `Email:        ${na(seeker.email)}`,
          `SeekerId:     ${na(seekerId)}`,
          `Batch:        ${batch ?? 1}`,
          `Status:       ${na(r.assessmentStatus)}`,
          `Hiring Stage: ${na(r.hiringStage)}`,
          `Date:         ${na(r.createdAt)}`,
          ``,
          `--- Scores ---`,
          `Overall Score:  ${na(r.totalScore)}`,
          `Fit Score:      ${fitScore}`,
          `  Weights → Technical: ${na(weights.technicalScore)}% | Communication: ${na(weights.communicationScore)}%`,
          ``,
          `--- Communication Breakdown ---`,
          `Grammar:       ${na(speech.grammar)}`,
          `Fluency:       ${na(speech.fluency)}`,
          `Pronunciation: ${na(speech.pronunciation)}`,
          `Vocabulary:    ${na(speech.vocabulary)}`,
          `Filler Words:  ${na(speech.filler_words)}`,
          `Average:       ${commAvg}`,
          ``,
          `--- Media ---`,
          `Video Link:       ${na(contextResult.video_link)}`,
          `Screen Share:     ${na(contextResult.screen_link)}`,
          `Video Available:  ${contextResult.isVideoDeleted ? "No (deleted)" : contextResult.video_link ? "Yes" : "N/A"}`,
          `Accent Analysis:  ${na(contextResult.videoAnalysis?.accent_analysis)}`,
          ``,
          `--- Conversation (${conversation.length} exchanges) ---`,
          ...skillLines,
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_coding_report ──────────────────────────────────────────────────────
  server.tool(
    "get_coding_report",
    "Returns the full report for a Coding interview candidate: fit score breakdown (code quality, problem solving, optimization), per-question results.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.number().describe("Candidate seekerId from list_attended_candidates"),
      batch:        z.number().optional().describe("Retake batch number. Default: 1"),
    },
    async ({ assessmentId, seekerId, batch }) => {
      try {
        requireAuth();

        const res = await screenerClient.post("/assessment/result/coding", {
          seekerId,
          assessmentId,
          batch: batch ?? null,
        });

        // Response shape: { data: [result_obj, extra, count_obj] }
        const raw: any[] = res.data?.data ?? [];
        const r = Array.isArray(raw) ? raw[0] : raw;

        if (!r) {
          return { content: [{ type: "text" as const, text: "No result found for this candidate." }] };
        }

        const assessment    = r.hyringScreenerAssessment ?? {};
        const seeker        = r.seekerCat ?? {};
        const weights       = assessment.fitScoreWeightAge?.[0] ?? {};
        const videoResult   = assessment.HyringScreenerVideoAnalysisResult?.[0] ?? {};
        const codingQs: any[] = assessment.HyringScreenerCodingQuestions ?? [];
        const answeredCount = raw[2]?._count ?? "N/A";

        // Per-question scores
        const batchNum = (batch ?? 1) - 1;
        let totalCodeQuality    = 0;
        let totalProblemSolving = 0;
        let totalOptimization   = 0;
        let scoredCount         = 0;

        const qLines = codingQs.map((q: any, i: number) => {
          const ans = q.HyringScreenerCodingAnswers?.[batchNum] ?? q.answers?.[batchNum] ?? {};
          const cq  = ans.codeQuality    ?? ans.code_quality    ?? q.codeQuality    ?? null;
          const ps  = ans.problemSolving ?? ans.problem_solving ?? q.problemSolving ?? null;
          const co  = ans.codeOptimization ?? ans.code_optimization ?? q.codeOptimization ?? null;
          if (cq != null) { totalCodeQuality    += cq; scoredCount++; }
          if (ps != null)   totalProblemSolving  += ps;
          if (co != null)   totalOptimization    += co;

          return [
            `  Q${i + 1}: ${q.question ?? q.concept ?? "N/A"}`,
            `  Type: ${q.codingType ?? "N/A"} | Exercise: ${q.questionType ?? "N/A"} | Duration: ${na(q.duration)} min | Lang: ${na(q.language)}`,
            `  Code Quality: ${na(cq)} | Problem Solving: ${na(ps)} | Optimization: ${na(co)}`,
          ].join("\n");
        });

        const avgCQ = scoredCount ? (totalCodeQuality    / scoredCount).toFixed(1) : "N/A";
        const avgPS = scoredCount ? (totalProblemSolving / scoredCount).toFixed(1) : "N/A";
        const avgCO = scoredCount ? (totalOptimization   / scoredCount).toFixed(1) : "N/A";
        const fitScore = scoredCount
          ? calcCodingFitScore(
              { codeQuality: totalCodeQuality / scoredCount, problemSolving: totalProblemSolving / scoredCount, codeOptimization: totalOptimization / scoredCount },
              weights,
            )
          : "N/A";

        const lines = [
          `=== CODING INTERVIEW REPORT ===`,
          `Assessment: ${assessmentId}`,
          `Job Title:  ${na(assessment.jobTitle)}`,
          ``,
          `--- Candidate ---`,
          `Name:         ${[seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A"}`,
          `Email:        ${na(seeker.email)}`,
          `SeekerId:     ${na(seekerId)}`,
          `Batch:        ${batch ?? 1}`,
          `Status:       ${na(r.assessmentStatus)}`,
          `Hiring Stage: ${na(r.hiringStage)}`,
          `Date:         ${na(r.createdAt)}`,
          ``,
          `--- Scores ---`,
          `Overall Score:       ${na(r.totalScore)}`,
          `Fit Score:           ${fitScore}`,
          `  Weights → Code Quality: ${na(weights.codeQuality)}% | Problem Solving: ${na(weights.problemSolving)}% | Optimization: ${na(weights.codeOptimization)}%`,
          `Avg Code Quality:    ${avgCQ}`,
          `Avg Problem Solving: ${avgPS}`,
          `Avg Optimization:    ${avgCO}`,
          `Questions Answered:  ${answeredCount} / ${codingQs.length}`,
          ``,
          `--- Media ---`,
          `Video Link:      ${na(videoResult.video_link)}`,
          `Video Available: ${videoResult.isVideoDeleted ? "No (deleted)" : videoResult.video_link ? "Yes" : "N/A"}`,
          ``,
          `--- Coding Questions (${codingQs.length}) ---`,
          ...qLines,
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_verbal_report ──────────────────────────────────────────────────────
  server.tool(
    "get_verbal_report",
    `Returns the full report for a Verbal/EPT (English Proficiency Test) candidate.

statusId is the HyringScreenerStatus ID from list_attended_candidates (not the assessment UUID).
batch is the attempt number (1 = first attempt).`,
    {
      statusId: z.string().describe("HyringScreenerStatus ID from list_attended_candidates"),
      batch:    z.number().optional().describe("Attempt number. Default: 1"),
    },
    async ({ statusId, batch }) => {
      try {
        requireAuth();

        const res = await screenerClient.get(`/language-screener/status/${statusId}/${batch ?? 1}`);

        // Response shape: { data: englishReportData } — direct object, not wrapped in array
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

        // Per-topic word detections
        const topicLines = results.map((r: any, i: number) => {
          const influenced = (r.influenced_words?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          const unclear    = (r.unclear_words_count?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          const grammar    = (r.tense_article_misuse_count?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          const parasitic  = (r.parasitic_words?.detections ?? []).map((w: any) => w.detected ?? w.word).join(", ");
          return [
            `  Topic ${i + 1}: [${r.candidate_start_sec ?? "?"}s – ${r.candidate_end_sec ?? "?"}s]`,
            influenced ? `  Mother Tongue Influenced: ${influenced}` : "",
            unclear    ? `  Unclear Pronunciation:    ${unclear}`    : "",
            grammar    ? `  Grammar Issues:           ${grammar}`    : "",
            parasitic  ? `  Filler/Parasitic Words:   ${parasitic}`  : "",
          ].filter(Boolean).join("\n");
        });

        // CEFR level from totalScore
        const score = d.totalScore ?? 0;
        const cefr =
          score >= 90 ? "C2 (Mastery)" :
          score >= 80 ? "C1 (Advanced)" :
          score >= 70 ? "B2 (Upper-Intermediate)" :
          score >= 60 ? "B1 (Intermediate)" :
          score >= 50 ? "A2 (Elementary)" :
                        "A1 (Beginner)";

        const lines = [
          `=== ENGLISH PROFICIENCY TEST REPORT ===`,
          `StatusId:   ${statusId}`,
          `Job Title:  ${na(assessment.jobTitle)}`,
          ``,
          `--- Candidate ---`,
          `Name:         ${[seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || na(seeker.fullName)}`,
          `Email:        ${na(seeker.email)}`,
          `SeekerId:     ${na(d.seeker_id)}`,
          `Batch:        ${batch ?? 1}`,
          `Status:       ${na(status.assessmentStatus)}`,
          `Hiring Stage: ${na(d.hiringStage)}`,
          `Qualified:    ${d.isQualified ? "Yes ✓" : "No ✗"}`,
          `Date:         ${na(d.createdAt)}`,
          ``,
          `--- Overall Score ---`,
          `Total Score:  ${na(d.totalScore)} → ${cefr}`,
          ``,
          `--- Language Breakdown ---`,
          `Fluency:              ${na(agg.fluency_score)}`,
          `Grammar:              ${na(agg.grammar_score)}`,
          `Pronunciation:        ${na(agg.pronunciation_score)}`,
          `Vocabulary:           ${na(agg.vocabulary_score)}`,
          `Filler Words:         ${na(agg.filler_word_score)}`,
          `Mother Tongue Influence: ${na(agg.mother_tongue_score)}`,
          ``,
          `--- AI Summary ---`,
          agg.overall_summary_points
            ? (typeof agg.overall_summary_points === "string"
                ? agg.overall_summary_points
                : JSON.stringify(agg.overall_summary_points, null, 2))
            : "N/A",
          ``,
          `--- Intelligence ---`,
          `Accent Analysis:      ${na(cog.accent_analysis)}`,
          `Behavioral Insights:  ${cog.behavioral_insights ? JSON.stringify(cog.behavioral_insights) : "N/A"}`,
          `Fraud & Integrity:    ${cog.fraud_integrity ? JSON.stringify(cog.fraud_integrity) : "N/A"}`,
          ``,
          `--- Media ---`,
          `Video Link:    ${na(d.videoLink)}`,
          `Video Deleted: ${d.isVideoDeleted ? "Yes" : "No"}`,
          ``,
          `--- Topic Breakdown (${results.length} topic(s)) ---`,
          ...topicLines,
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
