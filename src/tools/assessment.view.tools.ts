import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, requireAuth, extractError, getEmployerIdFromAPI } from "../api/screener.client";

export function registerAssessmentViewTools(server: McpServer) {

  // ── list_assessments ─────────────────────────────────────────────────────────
  server.tool(
    "list_assessments",
    "Lists all assessments for the authenticated employer. Returns assessment IDs needed for all other tools.",
    {
      status: z.enum(["active", "inactive", "drafts", "archived"]).optional()
        .describe("Filter by status. Default: active"),
      page:   z.number().optional().describe("Page number (1-based). Default: 1"),
      take:   z.number().optional().describe("Results per page. Default: 50"),
      search: z.string().optional().describe("Search by job title"),
    },
    async ({ status = "active", page = 1, take = 50, search }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        const endpointMap: Record<string, string> = {
          active:   `/assessment/active/${employerId}`,
          inactive: `/assessment/inactive/${employerId}`,
          drafts:   `/assessment/drafts/${employerId}`,
          archived: `/assessment/archived/${employerId}`,
        };

        const params: any = { skip: page - 1, take };
        if (search) params.search = search;

        const res = await screenerClient.get(endpointMap[status], { params });

        // Response shape: { data: [assessmentsArray, totalCount] }
        const raw = res.data?.data;
        const assessments: any[] = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : [];
        const totalCount: number  = Array.isArray(raw) && typeof raw[1] === "number" ? raw[1] : assessments.length;

        if (!assessments.length) {
          return { content: [{ type: "text" as const, text: `No ${status} assessments found.` }] };
        }

        const typeLabel: Record<string, string> = {
          fixed:   "One-way Interview",
          dynamic: "Two-way Interview",
          coding:  "Coding Interview",
          verbal:  "English Proficiency Test",
          phone:   "Phone Screener",
          resume:  "Resume Screener",
        };

        const lines = assessments.map((a: any, i: number) => {
          const type       = a.interviewType ? (typeLabel[a.interviewType] ?? a.interviewType) : "N/A";
          const candidates = a._count?.HyringScreenerStatus ?? "N/A";
          const questions  = a._count?.hyringScreenerQuestions ?? a._count?.HyringScreenerContext ?? "N/A";
          const id         = a.assessmentUuid ?? a.id;
          return `${(page - 1) * take + i + 1}. [ID: ${id}] ${a.jobTitle ?? "Untitled"} — Type: ${type} | Status: ${a.status ?? "N/A"} | Candidates: ${candidates} | Questions: ${questions}`;
        });

        const showing = `Showing ${assessments.length} of ${totalCount} ${status} assessment(s) (page ${page}):`;
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

  // ── get_assessment ────────────────────────────────────────────────────────────
  server.tool(
    "get_assessment",
    "Returns full details of a specific assessment by its UUID.",
    { assessmentId: z.string().describe("Assessment UUID from list_assessments") },
    async ({ assessmentId }) => {
      try {
        requireAuth();
        const res = await screenerClient.get(`/employer/assessment/job-details/${assessmentId}`);
        // Response: { data: [assessmentObj, planStatus, teamEmails, slack, hrVideos, oauth] }
        const raw = res.data?.data;
        const a = Array.isArray(raw) ? raw[0] : (raw ?? null);

        if (!a) {
          return { content: [{ type: "text" as const, text: "Assessment not found." }] };
        }

        const skillNames = Array.isArray(a.skills)
          ? a.skills.map((s: any) => (typeof s === "string" ? s : s.name)).join(", ")
          : "N/A";

        const contexts: any[] = a.HyringScreenerContext ?? [];
        const contextLines = contexts.length
          ? contexts.map((c: any) => `  - ${c.skill} (${c.level})${c.concept?.length ? ": " + c.concept.join(", ") : ""}`).join("\n")
          : "  None";

        const text = [
          `ID: ${assessmentId}`,
          `Title: ${a.jobTitle ?? "N/A"}`,
          `Interview Type: ${a.interviewType ?? "N/A"}`,
          `Seniority: ${a.seniorityLevel ?? "N/A"}`,
          `Employment Type: ${a.employmentType ?? "N/A"}`,
          `Workplace: ${a.workPlaceType ?? "N/A"}`,
          `Location: ${a.jobLocationCity ?? "N/A"}, ${a.jobLocationCountry ?? "N/A"}`,
          `Experience: ${a.yearOfExperienceFrom ?? 0}–${a.yearOfExperienceTo ?? 0} years`,
          `Skills: ${skillNames}`,
          `Status: ${a.status ?? "N/A"}`,
          `Language: ${a.language ?? "N/A"}`,
          `Avatar Type: ${a.avatarType ?? "N/A"}`,
          `AI Voice: ${a.aiVoice ?? "N/A"}`,
          `Expiry: ${a.expiryDate ?? "No expiry"}`,
          `Screen Share: ${a.enableScreenShare ?? "N/A"}`,
          `Candidate Video: ${a.candidateVideo ?? "N/A"}`,
          `Retake: ${a.retakeAssessment ?? "N/A"}`,
          `Interview Time: ${a.interviewTime ?? "N/A"}s`,
          `Candidates: ${a.HyringScreenerStatus?.length ?? 0}`,
          `Created: ${a.createdAt ?? "N/A"}`,
          `Interview Context:\n${contextLines}`,
          `Description:\n${a.jobDescription ?? "N/A"}`,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_assessment_stats ──────────────────────────────────────────────────────
  server.tool(
    "get_assessment_stats",
    "Returns candidate counts for an assessment by status: attended, invited, started, declined, not qualified, retake, scheduled.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        requireAuth();
        // Confirmed from backend source:
        // /assessment/assessment-stats/:id  → returns [active, inactive, archived, draft] — assessment status counts, NOT candidate counts
        // /assessment/view/assessment-stats/:id → returns [attended, invited, started, declined, not_qualified, retake, scheduled]
        const res = await screenerClient.get(`/assessment/view/assessment-stats/${assessmentId}`);
        const raw = res.data?.data ?? res.data;

        if (!raw) {
          return { content: [{ type: "text" as const, text: "No stats found for this assessment." }] };
        }

        // Positional array: [attended, invited, started, declined, not_qualified, retake, scheduled]
        const attended     = Array.isArray(raw) ? (raw[0] ?? 0) : "N/A";
        const invited      = Array.isArray(raw) ? (raw[1] ?? 0) : "N/A";
        const started      = Array.isArray(raw) ? (raw[2] ?? 0) : "N/A";
        const declined     = Array.isArray(raw) ? (raw[3] ?? 0) : "N/A";
        const notQualified = Array.isArray(raw) ? (raw[4] ?? 0) : "N/A";
        const retake       = Array.isArray(raw) ? (raw[5] ?? 0) : "N/A";
        const scheduled    = Array.isArray(raw) ? (raw[6] ?? 0) : "N/A";

        const text = [
          `=== Candidate Stats: ${assessmentId} ===`,
          `Attended (Completed): ${attended}`,
          `Invited:              ${invited}`,
          `Started:              ${started}`,
          `Declined:             ${declined}`,
          `Not Qualified:        ${notQualified}`,
          `Retake Requests:      ${retake}`,
          `Scheduled:            ${scheduled}`,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
