import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError, getEmployerIdFromAPI } from "../api/screener.client";
import { authedTool } from "../server";

export function registerResumeViewTools(server: McpServer) {

  // ── list_resume_assessments ─────────────────────────────────────────────────
  authedTool(
    server,
    "list_resume_assessments",
    "Lists Resume Screener assessments for the authenticated employer.",
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
          return { content: [{ type: "text" as const, text: `No ${status} resume assessments found.` }] };
        }

        const lines = assessments.map((a: any, i: number) => {
          const candidates = a._count?.HyringScreenerStatus ?? "N/A";
          const id         = a.assessmentUuid ?? a.id;
          return `${(page - 1) * take + i + 1}. [ID: ${id}] ${a.jobTitle ?? "Untitled"} — Status: ${a.status ?? "N/A"} | Candidates: ${candidates}`;
        });

        const showing = `Showing ${assessments.length} of ${totalCount} ${status} resume assessment(s) (page ${page}):`;
        const hint    = totalCount > page * take ? `\n\nUse page: ${page + 1} to see more.` : "";

        return {
          content: [{
            type: "text" as const,
            text: `${showing}\n\n${lines.join("\n")}${hint}`,
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
    "Returns candidate counts for a Resume Screener assessment by status: all, uploaded, invited, inbound, declined.",
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
          `=== Resume Screener Stats: ${assessmentId} ===`,
          `All Candidates: ${all}`,
          `Uploaded:       ${uploaded}`,
          `Invited:        ${invited}`,
          `Inbound:        ${inbound}`,
          `Declined:       ${declined}`,
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
    "Lists candidates for a Resume Screener assessment by status. Use statusId from the list with get_resume_report.",
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
        const candidates: any[] = Array.isArray(raw) ? raw : [];

        if (!candidates.length) {
          return { content: [{ type: "text" as const, text: `No ${status} candidates found for assessment ${assessmentId}.` }] };
        }

        const lines = candidates.map((c: any, i: number) => {
          const seeker   = c.seekerCat ?? c;
          const name     = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A";
          const email    = seeker.email ?? c.email ?? "N/A";
          const statusId = c.id ?? c.statusId ?? "N/A";
          const stage    = c.hiringStage ?? "N/A";
          const fitScore = c.fitScore ?? c.score ?? "N/A";
          return `${i + 1}. [StatusId: ${statusId}] ${name} <${email}>\n   Fit Score: ${fitScore} | Stage: ${stage}`;
        });

        const hint = `\nUse StatusId with get_resume_report to view the full resume screening report.`;

        return {
          content: [{
            type: "text" as const,
            text: `${candidates.length} ${status} candidate(s) for assessment ${assessmentId}:\n\n${lines.join("\n\n")}${hint}`,
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
    "Returns the full resume screening report for a candidate: fit score, criteria match, must-have checks.",
    {
      statusId: z.string().describe("HyringScreenerStatus ID from list_resume_candidates"),
    },
    async ({ statusId }) => {
      try {
        const employerId = await getEmployerIdFromAPI();
        const res = await screenerClient.get(`/screener/rs-report/${employerId}`, {
          params: { status: statusId },
        });

        const raw = res.data?.data ?? res.data;

        if (!raw) {
          return { content: [{ type: "text" as const, text: "No report found for this candidate." }] };
        }

        const r          = Array.isArray(raw) ? raw[0] : raw;
        const seeker     = r?.seekerCat ?? r?.seeker ?? {};
        const assessment = r?.hyringScreenerAssessment ?? {};
        const criteria: any[] = r?.criteria ?? r?.screeningCriteria ?? [];

        const name = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A";

        // ── Criteria breakdown ──────────────────────────────────────────────
        const criteriaLines = criteria.map((c: any, i: number) => {
          const mustHave = c.mustHave ? "✓ MUST HAVE" : "Optional";
          const matched  = c.isMatched ?? c.matched;
          const match    = matched === true ? "Matched ✓" : matched === false ? "Not Matched ✗" : "N/A";
          return `  ${i + 1}. ${c.keyword ?? c.criteria ?? "N/A"} [${mustHave}] — ${match}`;
        });

        const fitScore  = r?.fitScore ?? r?.totalScore ?? "N/A";
        const fitLabel  = typeof fitScore === "number"
          ? (fitScore >= 76 ? "STRONG FIT" : fitScore >= 51 ? "GOOD FIT" : fitScore >= 26 ? "MODERATE FIT" : "WEAK FIT")
          : "N/A";

        const lines = [
          `╔══════════════════════════════════════╗`,
          `║      RESUME SCREENER REPORT          ║`,
          `╚══════════════════════════════════════╝`,
          `Assessment : ${assessment.assessmentUuid ?? assessment.id ?? "N/A"}`,
          `Job Title  : ${assessment.jobTitle ?? "N/A"}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${name}`,
          `  Email        : ${seeker.email ?? "N/A"}`,
          `  StatusId     : ${statusId}`,
          `  Status       : ${r?.assessmentStatus ?? "N/A"}`,
          `  Hiring Stage : ${r?.hiringStage ?? "N/A"}`,
          `  Date         : ${r?.createdAt ?? "N/A"}`,
          ``,
          `┌─ FIT SCORE ────────────────────────────`,
          `  Fit Score : ${fitScore}% — ${fitLabel}`,
          ``,
          `┌─ SCREENING CRITERIA (${criteria.length}) ──────────────`,
          ...criteriaLines,
        ].filter((l: string) => l !== "");

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── update_resume_hiring_stage ──────────────────────────────────────────────
  authedTool(
    server,
    "update_resume_hiring_stage",
    "Updates the hiring stage for a resume screener candidate.",
    {
      statusId:    z.string().describe("HyringScreenerStatus ID from list_resume_candidates"),
      hiringStage: z.string().describe("New hiring stage value, e.g. 'shortlisted', 'rejected', 'hired'"),
    },
    async ({ statusId, hiringStage }) => {
      try {
        const employerId = await getEmployerIdFromAPI();
        await screenerClient.patch(`/details/employer/resume/status-change/${employerId}`, {
          statusId,
          hiringStage,
        });
        return { content: [{ type: "text" as const, text: `Hiring stage updated to "${hiringStage}" for status ${statusId}.` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── send_resume_reminder ────────────────────────────────────────────────────
  authedTool(
    server,
    "send_resume_reminder",
    "Sends a reminder to invited resume screener candidates who haven't submitted their resume.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerIds:    z.array(z.number()).describe("Array of seekerIds to send reminders to"),
    },
    async ({ assessmentId, seekerIds }) => {
      try {
        const employerId = await getEmployerIdFromAPI();
        await screenerClient.patch(`/details/employer/resume/invite/send-reminder/${employerId}`, {
          assessmentId,
          seekerIds,
        });
        return { content: [{ type: "text" as const, text: `Reminder sent to ${seekerIds.length} candidate(s).` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
