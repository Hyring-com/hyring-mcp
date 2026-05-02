import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError } from "../../api/screener.client";
import { authedTool } from "../../server";
import {
  getScoreLabel, na, mapStatus, formatAISummary,
} from "../helpers";

export function registerEptReportTools(server: McpServer) {

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
          `Job Title  : ${na(assessment.jobTitle)}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${seekerName}`,
          `  Email        : ${na(seeker.email)}`,
          (batch ?? 1) > 1 ? `  Attempt      : ${batch}` : "",
          `  Status       : ${mapStatus(status.assessmentStatus)}`,
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
