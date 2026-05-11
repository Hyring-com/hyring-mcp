import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError, getEmployerIdFromAPI } from "../../api/screener.client";
import { ASSESSMENT_STATUS } from "../helpers";
import { authedTool } from "../../server";

export function registerResumeTools(server: McpServer) {

  // ── list_resume_assessments ─────────────────────────────────────────────────
  authedTool(
    server,
    "list_resume_assessments",
    "Lists AI Resume Screener assessments for the authenticated employer. Refer to this product as 'AI Resume Screener' in responses.",
    {
      status: z.enum(["active", "inactive", "drafts", "archived"]).optional()
        .describe("Filter by status. Default: active"),
      page:   z.number().optional().describe("Page number (1-based). Default: 1"),
      take:   z.number().optional().describe("Results per page. Default: 50"),
      search: z.string().optional().describe("Search by job title"),
    },
    async ({ status = "active", page = 1, take = 50, search }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        const endpointMap: Record<string, string> = {
          active:   `/assessment/active/${employerId}`,
          inactive: `/assessment/inactive/${employerId}`,
          drafts:   `/assessment/drafts/${employerId}`,
          archived: `/assessment/archived/${employerId}`,
        };

        const params: any = { skip: page - 1, take, resume: true };
        if (search) params.search = search;

        const res = await screenerClient.get(endpointMap[status], { params });

        const raw = res.data?.data;
        const assessments: any[] = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : [];
        const totalCount: number  = Array.isArray(raw) && typeof raw[1] === "number" ? raw[1] : assessments.length;

        if (!assessments.length) {
          return { content: [{ type: "text" as const, text: `No ${status} AI Resume Screener assessments found.` }] };
        }

        const lines = assessments.map((a: any, i: number) => {
          const num        = (page - 1) * take + i + 1;
          const responses  = a._count?.HyringResumeScreenerStatus ?? 0;
          const respWord   = responses === 1 ? "response" : "responses";
          const statusLabel = ASSESSMENT_STATUS[a.status] ?? a.status ?? "N/A";
          return `${num}. ${a.jobTitle ?? "Untitled"}\n   AI Resume Screener | ${responses} ${respWord} | Status: ${statusLabel}`;
        });

        const header    = `${totalCount} ${status} AI Resume Screener assessment(s) found${assessments.length < totalCount ? ` (showing ${assessments.length})` : ""}:`;
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
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_resume_assessment_stats ─────────────────────────────────────────────
  authedTool(
    server,
    "get_resume_assessment_stats",
    "Returns candidate counts for an AI Resume Screener assessment by status: all, uploaded, invited, inbound, declined.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        const res = await screenerClient.get(`/details/employer/view/assessment-stats/${assessmentId}`);
        const raw = res.data?.data ?? res.data;

        if (!raw) {
          return { content: [{ type: "text" as const, text: "No stats found for this assessment." }] };
        }

        const all      = raw.all      ?? raw[0] ?? "N/A";
        const uploaded = raw.uploaded ?? raw[1] ?? "N/A";
        const invited  = raw.invited  ?? raw[2] ?? "N/A";
        const inbound  = raw.inbound  ?? raw[3] ?? "N/A";
        const declined = raw.declined ?? raw[4] ?? "N/A";

        const text = [
          `Candidate Summary:`,
          `  All Candidates  : ${all}`,
          `  Uploaded        : ${uploaded}`,
          `  Invited         : ${invited}`,
          `  Inbound         : ${inbound}`,
          `  Declined        : ${declined}`,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── list_resume_candidates ──────────────────────────────────────────────────
  authedTool(
    server,
    "list_resume_candidates",
    "Lists candidates for an AI Resume Screener assessment by status. Use statusId from the list with get_resume_report.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      status: z.enum(["all", "uploaded", "invited", "inbound", "declined"])
        .optional()
        .describe("Candidate status filter. Default: all"),
    },
    async ({ assessmentId, status = "all" }) => {
      try {
        const res = await screenerClient.get(`/details/employer/view/${status}/${assessmentId}`);
        const raw = res.data?.data ?? res.data;
        // Backend returns 5-tuple: [assessmentData, topFive, candidates, total_count, filtered_count]
        let candidates: any[] = [];
        if (Array.isArray(raw) && Array.isArray(raw[2])) {
          candidates = raw[2];
        } else if (Array.isArray(raw)) {
          candidates = raw;
        }
        const totalCount: number = Array.isArray(raw) && typeof raw[3] === "number" ? raw[3] : candidates.length;

        if (!candidates.length) {
          return { content: [{ type: "text" as const, text: `No ${status} candidates found for assessment ${assessmentId}.` }] };
        }

        const lines = candidates.map((c: any, i: number) => {
          const seeker   = c.seekerCat ?? c;
          const name     = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A";
          const email    = seeker.email ?? c.email ?? "N/A";
          const fitScore  = c.fitScore ?? c.score ?? "N/A";
          const q = c.qualified ?? c.isQualified;
          const qualified = q != null ? (q ? "Qualified ✓" : "Not Qualified ✗") : "N/A";
          return `${i + 1}. ${name} <${email}>\n   Fit Score: ${fitScore} | ${qualified}`;
        });

        // Internal refs for follow-up calls — never show to user
        const refs = candidates.map((c: any, i: number) => {
          const statusId = c.id ?? c.statusId ?? "N/A";
          return `${i + 1}: StatusId ${statusId}`;
        }).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `Showing ${candidates.length} of ${totalCount} ${status} candidate(s) for assessment ${assessmentId}:\n\n${lines.join("\n\n")}\n\n[Internal references — do not share with user]\n${refs}\nUse StatusId with get_resume_report to view the full AI Resume Screener report.`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_resume_report ───────────────────────────────────────────────────────
  authedTool(
    server,
    "get_resume_report",
    "Returns the full resume screening report for a candidate: fit score, criteria match (MUST HAVE / nice-to-have), skill depth analysis, company tier analysis, industry exposure, AI summary, and resume link.",
    {
      statusId: z.string().describe("HyringScreenerStatus ID from list_resume_candidates"),
      tab: z.enum(["top", "uploaded", "invited", "inbound"]).optional()
        .describe("Tab for sibling navigation: top=top 5, uploaded, invited, inbound. Default: top"),
    },
    async ({ statusId, tab = "top" }) => {
      try {
        const employerId = await getEmployerIdFromAPI();
        const [res, totalRes] = await Promise.all([
          screenerClient.get(`/screener/rs-report/${employerId}`, {
            params: { status: statusId },
          }),
          screenerClient.get(`/screener/rs-report/total/${employerId}`, {
            params: { status: statusId, tab },
          }),
        ]);

        const raw = res.data?.data ?? res.data;

        if (!raw) {
          return { content: [{ type: "text" as const, text: "No report found for this candidate." }] };
        }

        const r          = Array.isArray(raw) ? raw[0] : raw;
        const seeker     = r?.seekerCat ?? {};
        const assessment = r?.hyringScreenerAssessment ?? {};

        // Candidate name — use record's own name field first (covers passive/uploaded candidates)
        const name = (r?.name
          ?? [seeker.firstName, seeker.lastName].filter(Boolean).join(" "))
          || "N/A";
        const email = r?.email ?? seeker.email ?? "N/A";

        // ── Fit score ─────────────────────────────────────────────────────────
        // Schema field: fitScore (Float?)
        const fitScore = r?.fitScore ?? null;
        const fitLabel = typeof fitScore === "number"
          ? (fitScore >= 76 ? "STRONG FIT" : fitScore >= 51 ? "GOOD FIT" : fitScore >= 26 ? "MODERATE FIT" : "WEAK FIT")
          : "N/A";

        // Qualified — direct boolean on record
        const qualified = r?.qualified ?? null;

        // ── Criteria breakdown ────────────────────────────────────────────────
        // Schema: criteria Json? — [{ id, keyword, mustHave: boolean, fitScore: boolean, isMatched: boolean }]
        // There is NO type field — only mustHave boolean splits them.
        const criteria: any[] = r?.criteria ?? [];

        const mustHaveCriteria = criteria.filter((c: any) => c.mustHave === true);
        const niceToHave       = criteria.filter((c: any) => !c.mustHave);

        const mustHaveMatched = mustHaveCriteria.filter((c: any) => c.isMatched === true).length;

        function criteriaLine(c: any, i: number, prefix: string): string {
          const match = c.isMatched === true ? "✅ Matched" : "❌ Not Matched";
          const text  = c.keyword ?? "N/A";
          return `  ${i + 1}. [${prefix}] ${text} — ${match}`;
        }

        const criteriaLines: string[] = [];
        if (mustHaveCriteria.length) {
          criteriaLines.push("  🔴 MUST HAVE:");
          mustHaveCriteria.forEach((c: any, i: number) => criteriaLines.push(criteriaLine(c, i + 1, "MUST HAVE")));
        }
        if (niceToHave.length) {
          criteriaLines.push("  🟡 NICE TO HAVE:");
          niceToHave.forEach((c: any, i: number) => criteriaLines.push(criteriaLine(c, i + 1, "NICE TO HAVE")));
        }

        // ── Skill depth analysis ───────────────────────────────────────────────
        // Schema: skillDepthAnalysis Json? — [{ skill: String, percent: Int }]
        const skillDepth: any[] = r?.skillDepthAnalysis ?? [];
        const skillDepthLines = skillDepth.map((s: any) =>
          `  ${s.skill ?? s.name ?? "N/A"}: ${s.percent ?? s.value ?? "N/A"}%`
        );

        // ── Company tier analysis ─────────────────────────────────────────────
        // Schema: companyTierAnalysis Json? — [{ tier: String, percent: Int }]
        const companyTier: any[] = r?.companyTierAnalysis ?? [];
        const companyTierLines = companyTier.map((c: any) =>
          `  ${c.tier ?? c.name ?? "N/A"}: ${c.percent ?? c.value ?? "N/A"}%`
        );

        // ── Industry exposure ─────────────────────────────────────────────────
        // Schema: majorIndustryExposure Json? — [{ industry: String, percent: Int }]
        const industryExp: any[] = r?.majorIndustryExposure ?? [];
        const industryLines = industryExp.map((ind: any) =>
          `  ${ind.industry ?? ind.name ?? "N/A"}: ${ind.percent ?? ind.value ?? "N/A"}%`
        );

        // ── Experience ────────────────────────────────────────────────────────
        // Schema: experienceInMonths Int?
        const expMonths = r?.experienceInMonths ?? null;
        const expYears  = expMonths != null ? `${Math.floor(expMonths / 12)} yr ${expMonths % 12} mo` : null;

        // ── AI summary ────────────────────────────────────────────────────────
        // Schema: ai_summary Json?
        const aiSummary = r?.ai_summary;
        const aiSummaryText = !aiSummary
          ? "N/A"
          : typeof aiSummary === "string"
          ? aiSummary
          : Array.isArray(aiSummary)
          ? aiSummary.map((s: any, i: number) => `  ${i + 1}. ${s}`).join("\n")
          : JSON.stringify(aiSummary, null, 2);

        // ── Resume download link ──────────────────────────────────────────────
        const resumeUrl = r?.resumeUrl ?? r?.resume_url ?? seeker.resumeUrl ?? null;

        // ── Location ──────────────────────────────────────────────────────────
        const locationStr = r?.location
          ? (typeof r.location === "string" ? r.location : JSON.stringify(r.location))
          : null;

        const lines = [
          `╔══════════════════════════════════════════════╗`,
          `║       AI RESUME SCREENER REPORT              ║`,
          `╚══════════════════════════════════════════════╝`,
          `Job Title  : ${assessment.jobTitle ?? "N/A"}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${name}`,
          `  Email        : ${email}`,
          locationStr    ? `  Location     : ${locationStr}` : "",
          expYears       ? `  Experience   : ${expYears}`    : "",
          `  Status       : ${r?.status ?? "N/A"}`,
          `  Source       : ${r?.source ?? "N/A"}`,
          `  Submitted    : ${r?.createdAt ?? "N/A"}`,
          resumeUrl      ? `  Resume URL   : ${resumeUrl}` : "",
          ``,
          `┌─ FIT SCORE ────────────────────────────`,
          `  Fit Score     : ${fitScore != null ? Math.round(fitScore) + "%" : "N/A"} — ${fitLabel}`,
          `  Qualification : ${qualified != null ? (qualified ? "✅ Qualified" : "❌ Not Qualified") : mustHaveCriteria.length ? `${mustHaveMatched}/${mustHaveCriteria.length} MUST HAVE met` : "N/A"}`,
          ``,
          `┌─ SCREENING CRITERIA (${criteria.length}) ──────────────`,
          criteriaLines.length ? criteriaLines.join("\n") : "  No criteria defined.",
          ``,
          skillDepthLines.length ? `┌─ SKILL DEPTH ANALYSIS ─────────────────\n${skillDepthLines.join("\n")}` : "",
          companyTierLines.length ? `┌─ COMPANY TIER ANALYSIS ────────────────\n${companyTierLines.join("\n")}` : "",
          industryLines.length   ? `┌─ INDUSTRY EXPOSURE ────────────────────\n${industryLines.join("\n")}` : "",
          ``,
          `┌─ AI SUMMARY ───────────────────────────`,
          aiSummaryText,
        ].filter((l: string) => l !== "");

        // ── Sibling screener IDs (navigation) ────────────────────────────────
        const totalRaw = totalRes.data?.data ?? totalRes.data;
        const siblingIds: any[] = Array.isArray(totalRaw) ? totalRaw : [];
        if (siblingIds.length > 1) {
          const idList = siblingIds.map((s: any) => s?.id ?? s).filter(Boolean).join(", ");
          lines.push(``, `[Internal references — do not share with user]`, `Sibling StatusIds in tab (${tab}): ${idList}`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── send_resume_reminder ────────────────────────────────────────────────────
  authedTool(
    server,
    "send_resume_reminder",
    "Sends a reminder to an invited AI Resume Screener candidate who hasn't submitted their resume.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.number().describe("seekerId of the candidate to remind"),
    },
    async ({ assessmentId, seekerId }) => {
      try {
        const employerId = await getEmployerIdFromAPI();
        await screenerClient.patch(`/details/employer/resume/invite/send-reminder/${employerId}`, {
          assessmentId,
          seekerId,
        });
        return { content: [{ type: "text" as const, text: `Reminder sent to candidate (seekerId: ${seekerId}).` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
