import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { vipClient, extractVipError } from "../../api/vip.client";
import { getEmployerIdFromToken } from "../../auth/credentials";
import { authedTool } from "../../server";
import {
  fitLine, scoreLine, formatAISummary, na,
  getQuestionScoreLabel, getUnderstandLabel, stars, ASSESSMENT_STATUS,
} from "../helpers";

export function registerVipTools(server: McpServer) {

  // ── list_vip_assessments ────────────────────────────────────────────────────
  authedTool(
    server,
    "list_vip_assessments",
    "Lists Virtual Interview Platform job roles for the authenticated employer. Refer to this product as 'Virtual Interview Platform' in responses (not 'VIP').",
    {
      status: z.enum(["active", "inactive", "drafts", "archived"]).optional()
        .describe("Filter by status. Default: active"),
      page:   z.number().optional().describe("Page number (1-based). Default: 1"),
      take:   z.number().optional().describe("Results per page. Default: 50"),
    },
    async ({ status = "active", page = 1, take = 50 }) => {
      try {
        const employerId = getEmployerIdFromToken();
        const res = await vipClient.get(`/vip/interview/assessments/${status}/${employerId}`, {
          params: { skip: page - 1, take },
        });

        const raw = res.data?.data;
        const assessments: any[] = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : (Array.isArray(raw) ? raw : []);
        const totalCount: number  = Array.isArray(res.data?.data) && typeof res.data.data[1] === "number"
          ? res.data.data[1]
          : assessments.length;

        if (!assessments.length) {
          return { content: [{ type: "text" as const, text: `No ${status} Virtual Interview Platform job roles found.` }] };
        }

        const lines = assessments.map((a: any, i: number) => {
          const num      = (page - 1) * take + i + 1;
          const location = [a.jobLocationCity, a.jobLocationCountry].filter(Boolean).join(", ") || "N/A";
          const statusLabel = ASSESSMENT_STATUS[a.status] ?? a.status ?? "N/A";
          const responses  = a._count?.HyringVIPStatus ?? a._count?.HyringScreenerStatus ?? 0;
          const respWord   = responses === 1 ? "response" : "responses";
          return `${num}. ${a.jobTitle ?? "Untitled"}\n   Virtual Interview Platform | ${responses} ${respWord} | ${location} | Status: ${statusLabel}`;
        });

        const header    = `${totalCount} ${status} Virtual Interview Platform job role(s) found${assessments.length < totalCount ? ` (showing ${assessments.length})` : ""}:`;
        const remaining = totalCount - page * take;
        const hint      = remaining > 0 ? `\n\n${remaining} more available — ask to see more.` : "";

        const refs = assessments.map((a: any, i: number) =>
          `${(page - 1) * take + i + 1}: ${a.assessmentUuid ?? a.id}`
        ).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `${header}\n\n${lines.join("\n\n")}${hint}\n\n[Internal references — do not share with user]\n${refs}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractVipError(err)}` }] };
      }
    }
  );

  // ── get_vip_assessment_stats ────────────────────────────────────────────────
  authedTool(
    server,
    "get_vip_assessment_stats",
    "Returns interview counts for a Virtual Interview Platform job role by status: completed, scheduled, cancelled.",
    { assessmentId: z.string().describe("Assessment UUID from list_vip_assessments") },
    async ({ assessmentId }) => {
      try {
        const employerId = getEmployerIdFromToken();
        const res = await vipClient.get(`/details/interview/stats/${employerId}`, {
          params: { assessmentId },
        });
        const raw = res.data?.data ?? res.data;

        if (!raw) {
          return { content: [{ type: "text" as const, text: "No stats found for this job role." }] };
        }

        const completed  = raw.completed  ?? raw[0] ?? "N/A";
        const scheduled  = raw.scheduled  ?? raw[1] ?? "N/A";
        const cancelled  = raw.cancelled  ?? raw[2] ?? "N/A";

        const text = [
          `Candidate Summary:`,
          `  Completed  : ${completed}`,
          `  Scheduled  : ${scheduled}`,
          `  Cancelled  : ${cancelled}`,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractVipError(err)}` }] };
      }
    }
  );

  // ── list_vip_interviews ─────────────────────────────────────────────────────
  authedTool(
    server,
    "list_vip_interviews",
    "Lists Virtual Interview Platform interviews for a job role by status. Use statusId from completed interviews with get_vip_report.",
    {
      assessmentId: z.string().describe("Assessment UUID from list_vip_assessments"),
      status: z.enum(["completed", "scheduled", "cancelled"])
        .optional()
        .describe("Interview status filter. Default: completed"),
      page: z.number().optional().describe("Page number (1-based). Default: 1"),
      take: z.number().optional().describe("Results per page. Default: 10"),
    },
    async ({ assessmentId, status = "completed", page = 1, take = 10 }) => {
      try {
        const employerId = getEmployerIdFromToken();
        const res = await vipClient.get(`/details/interview/${status}/${employerId}`, {
          params: { assessmentId, skip: page - 1, take },
        });
        const raw = res.data?.data ?? res.data;
        // Backend returns tuple: [interviewsList, totalCount, assessmentData]
        const interviews: any[] = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : (Array.isArray(raw) ? raw : []);
        const totalCount: number = Array.isArray(raw) && typeof raw[1] === "number" ? raw[1] : interviews.length;

        if (!interviews.length) {
          return { content: [{ type: "text" as const, text: `No ${status} interviews found for job role ${assessmentId}.` }] };
        }

        const lines = interviews.map((iv: any, i: number) => {
          const seeker   = iv.seekerCat ?? iv.seeker ?? iv;
          const name     = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || seeker.fullName || "N/A";
          const email    = seeker.email ?? iv.email ?? "N/A";
          const stage    = iv.hiringStage ?? "N/A";
          const date     = iv.interviewDate ?? iv.scheduledAt ?? iv.createdAt ?? "N/A";
          return `${(page - 1) * take + i + 1}. ${name} <${email}>\n   Stage: ${stage} | Date: ${date}`;
        });

        // Internal refs for follow-up calls — never show to user
        const refs = interviews.map((iv: any, i: number) => {
          const statusId = iv.id ?? iv.statusId ?? "N/A";
          return `${(page - 1) * take + i + 1}: StatusId ${statusId}`;
        }).join("\n");

        const remaining = totalCount - page * take;
        const hint      = remaining > 0 ? `\n\n${remaining} more available — ask to see more.` : "";

        return {
          content: [{
            type: "text" as const,
            text: `${interviews.length} of ${totalCount} ${status} interview(s) shown:\n\n${lines.join("\n\n")}${hint}\n\n[Internal references — do not share with user]\n${refs}${status === "completed" ? "\nUse StatusId with get_vip_report to view the interview report." : ""}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractVipError(err)}` }] };
      }
    }
  );

  // ── get_vip_report ──────────────────────────────────────────────────────────
  authedTool(
    server,
    "get_vip_report",
    `Returns the full Virtual Interview Platform report for a completed interview.

Shows both the AI Analysis (technical score, communication breakdown, per-skill Q&A, accent, AI summary) and the Interviewer Evaluation (rating, hiring decision, skill ratings, comments).

statusId is the interview StatusId from list_vip_interviews.

Refer to this product as 'Virtual Interview Platform' in responses (not 'VIP' or 'VIP Live Interview').`,
    {
      statusId: z.string().describe("Interview status ID from list_vip_interviews"),
    },
    async ({ statusId }) => {
      try {
        const res = await vipClient.get(`/vip/interview/report/${statusId}`);
        const raw = res.data?.data ?? res.data;

        if (!raw) {
          return { content: [{ type: "text" as const, text: "No report found for this interview." }] };
        }

        const r          = Array.isArray(raw) ? raw[0] : raw;
        const vipStatus  = r?.vipStatus ?? {};
        const seeker     = vipStatus.seekerCat ?? r?.seeker ?? {};
        const evaluation = vipStatus.candidateEvaluation ?? null;

        // ── Candidate info ────────────────────────────────────────────────────
        const name = (seeker.fullName
          ?? [seeker.firstName, seeker.lastName].filter(Boolean).join(" "))
          || "N/A";

        // ── AI Scores ────────────────────────────────────────────────────────
        // totalScore: AI-computed technical score (0-100)
        const aiTechScore   = r?.totalScore != null ? parseFloat(String(r.totalScore)) : null;

        // Communication from videoAnalysis.speech_proficiency (each 0-10 → * 10 = 0-100)
        const speechProf    = r?.videoAnalysis?.speech_proficiency ?? {};

        // Fallback: direct score fields on result (also 0-10)
        const pronRaw    = speechProf.pronunciation    ?? r?.pronounciation_score ?? null;
        const gramRaw    = speechProf.grammar          ?? r?.grammar_score        ?? null;
        const vocabRaw   = speechProf.vocabulary       ?? r?.vocabulary_score     ?? null;
        const fillerRaw  = speechProf.filler_words     ?? r?.filler_score         ?? null;
        const fluencyRaw = speechProf.fluency          ?? r?.fluency_score        ?? null;

        const toCommPct = (v: any) => v != null ? Math.round(parseFloat(String(v)) * 10) : null;
        const pronPct    = toCommPct(pronRaw);
        const gramPct    = toCommPct(gramRaw);
        const vocabPct   = toCommPct(vocabRaw);
        const fillerPct  = toCommPct(fillerRaw);
        const fluencyPct = toCommPct(fluencyRaw);

        const commScores = [pronPct, gramPct, vocabPct, fillerPct, fluencyPct].filter((v): v is number => v != null);
        const commAvgPct = commScores.length
          ? Math.round(commScores.reduce((a, b) => a + b, 0) / commScores.length)
          : null;

        // ── Fit Score (50% tech + 50% comm, default weights) ────────────────
        const fitPct = aiTechScore != null && commAvgPct != null
          ? Math.round(aiTechScore * 0.5 + commAvgPct * 0.5)
          : aiTechScore ?? null;

        // ── Accent ───────────────────────────────────────────────────────────
        const accent = r?.videoAnalysis?.accent_analysis;
        const accentText = accent
          ? `${accent.detected_accent ?? ""} (${accent.country_code ?? ""})`.trim()
          : "N/A";

        // ── AI Summary ───────────────────────────────────────────────────────
        const aiSummary = formatAISummary(r?.ai_summary);

        // ── Per-skill Q&A breakdown from questionResults ──────────────────────
        // VIP uses questionResults[] with no speaker field — all entries are Q&A pairs
        const questionResults: any[] = r?.questionResults ?? [];

        // Group by skill
        const skillMap: Record<string, any[]> = {};
        questionResults.forEach((q: any) => {
          const skill = q.skill ?? "General";
          if (!skillMap[skill]) skillMap[skill] = [];
          skillMap[skill].push(q);
        });

        const skillLines: string[] = [];
        Object.entries(skillMap).forEach(([skill, qs]) => {
          // Skill average score (0-4 scale): only score_applicable questions count
          const applicableQs = qs.filter((q: any) => q.scoreApplicable === true || q.score_applicable === true);
          const avgScore = applicableQs.length
            ? Math.min(applicableQs.reduce((sum: number, q: any) => sum + (q.score ?? 0), 0) / Math.max(applicableQs.length, 3), 4)
            : null;
          const avgLabel = avgScore != null ? getQuestionScoreLabel(avgScore) : "N/A";

          skillLines.push(`  ▸ ${skill} [${qs.length} question(s)] — Avg Score: ${avgScore != null ? avgScore.toFixed(1) + "/4" : "N/A"} (${avgLabel})`);

          qs.forEach((q: any, i: number) => {
            const score = q.score ?? null;
            const understandScore = q.understand_score ?? null;
            // VIP: answer field first, fallback to transcript (matches addUUid in vip-report-helper)
            const transcript = q.answer ?? q.transcript ?? "";
            skillLines.push(`    Q${i + 1}: ${q.question ?? "N/A"}`);
            skillLines.push(`    Score: ${score != null ? score + "/4" : "N/A"} — ${getQuestionScoreLabel(score)}${understandScore != null ? ` | Understanding: ${understandScore}/10 — ${getUnderstandLabel(understandScore)}` : ""}`);
            if (transcript) {
              skillLines.push(`    Transcript: "${String(transcript)}"`);
            }
            if (q.highlights?.length) {
              skillLines.push(`    Highlights: ${q.highlights.join(", ")}`);
            }
            skillLines.push("");
          });
        });

        // ── Integrity/behavioral signals ──────────────────────────────────────
        const integritySignals  = r?.videoAnalysis?.integrity_signals;
        const engagementVibes   = r?.videoAnalysis?.engagement_vibes;
        const cognitiveInsights = r?.videoAnalysis?.cognitive_insights;
        const behavioralInsights = r?.videoAnalysis?.behavioral_insights;
        const fraudIntegrity    = r?.videoAnalysis?.fraud_integrity;

        function fmtObj(obj: any): string {
          if (!obj) return "N/A";
          if (typeof obj === "string") return obj;
          return JSON.stringify(obj, null, 2);
        }

        // ── Interviewer evaluation ────────────────────────────────────────────
        const evalTech  = evaluation?.technicalScore    ?? null;
        const evalComm  = evaluation?.communicationScore ?? null;
        const decision  = evaluation?.hiringDecision    ?? null;
        const rejectReason = evaluation?.rejectionReason ?? null;
        const comments  = evaluation?.comments          ?? null;
        const skillRatings: any[] = evaluation?.skillsRatings ?? r?.skillRatings ?? [];

        // ── Media ─────────────────────────────────────────────────────────────
        const videoLink   = r?.video_link   ?? null;
        const screenLink  = r?.screen_link  ?? null;
        const isDeleted   = r?.isVideoDeleted ?? false;

        // ── Build report ──────────────────────────────────────────────────────
        const lines = [
          `╔══════════════════════════════════════════════╗`,
          `║     VIRTUAL INTERVIEW PLATFORM REPORT        ║`,
          `╚══════════════════════════════════════════════╝`,
          `Job Role   : ${na(vipStatus.title ?? r?.vipAssessment?.jobTitle)}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${name}`,
          `  Email        : ${na(seeker.email ?? vipStatus.candidateEmail)}`,
          `  Status       : ${na(vipStatus.interviewStatus)}`,
          `  Hiring Stage : ${na(r?.hiringStage ?? vipStatus.hiringStage)}`,
          `  Date         : ${na(vipStatus.startDate)}`,
          ``,
          `┌─ AI ANALYSIS ──────────────────────────`,
          `  Fit Score         : ${fitLine(fitPct)}`,
          `  Technical Score   : ${aiTechScore != null ? scoreLine(aiTechScore) : "N/A"}`,
          `  Communication     : ${commAvgPct != null ? scoreLine(commAvgPct) : "N/A"}`,
          `  Accent            : ${accentText}`,
          ``,
          `┌─ AI SUMMARY ───────────────────────────`,
          aiSummary,
          ``,
          `┌─ INTERVIEW INTELLIGENCE ───────────────`,
          integritySignals  ? `  Integrity Signals  : ${fmtObj(integritySignals)}`  : "",
          engagementVibes   ? `  Engagement Vibes   : ${fmtObj(engagementVibes)}`   : "",
          cognitiveInsights ? `  Cognitive Insights : ${fmtObj(cognitiveInsights)}` : "",
          behavioralInsights? `  Behavioral         : ${fmtObj(behavioralInsights)}`: "",
          fraudIntegrity    ? `  Fraud/Integrity    : ${fmtObj(fraudIntegrity)}`    : "",
          (!integritySignals && !engagementVibes && !cognitiveInsights) ? "  N/A" : "",
          ``,
          `┌─ SKILL BREAKDOWN (${Object.keys(skillMap).length} skill(s), ${questionResults.length} responses) ──`,
          ...(skillLines.length ? skillLines : ["  No question results available"]),
          `┌─ MEDIA ─────────────────────────────────`,
          `  Video     : ${isDeleted ? "Deleted" : videoLink ? videoLink : "N/A"}`,
          screenLink  ? `  Screen    : ${screenLink}` : "",
          ``,
          `┌─ INTERVIEWER EVALUATION ───────────────`,
          evaluation
            ? [
                evalTech  != null ? `  Technical Score   : ${evalTech}/10` : "",
                evalComm  != null ? `  Communication     : ${evalComm}/10` : "",
                decision           ? `  Hiring Decision   : ${decision}`  : "",
                rejectReason       ? `  Rejection Reason  : ${rejectReason}` : "",
                comments           ? `  Comments          : "${comments}"` : "",
                skillRatings.length
                  ? [`  Skill Ratings:`, ...skillRatings.map((s: any) => `    ${na(s.skill)}: ${stars(s.rating)}`)]
                  : "",
              ].flat().filter(Boolean).join("\n")
            : "  No interviewer evaluation submitted yet",
        ].filter((l: string) => l !== "");

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractVipError(err)}` }] };
      }
    }
  );

  // ── update_vip_hiring_stage ─────────────────────────────────────────────────
  authedTool(
    server,
    "update_vip_hiring_stage",
    "Updates the hiring stage for a Virtual Interview Platform candidate. Use the StatusId from list_vip_interviews.",
    {
      statusId:         z.string().describe("Interview StatusId from list_vip_interviews"),
      stage:            z.enum(["SHORTLIST", "REJECT", "HOLD"]).describe("Hiring stage to set: SHORTLIST, REJECT, or HOLD"),
      reason:           z.string().optional().describe("Reason for rejection — recommended when stage is REJECT"),
      hideRejectReason: z.boolean().optional().describe("Hide rejection reason from the candidate. Default: false"),
    },
    async ({ statusId, stage, reason, hideRejectReason }) => {
      try {
        const employerId = getEmployerIdFromToken();
        const payload: any = { statusId, stage };
        if (reason)                        payload.reason           = reason;
        if (hideRejectReason !== undefined) payload.hideRejectReason = hideRejectReason;

        await vipClient.post(`/details/change/hyring-stage/${employerId}`, payload);
        return { content: [{ type: "text" as const, text: `Candidate stage updated to ${stage}.${reason ? `\nReason: "${reason}"` : ""}` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractVipError(err)}` }] };
      }
    }
  );
}
