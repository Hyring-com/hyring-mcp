import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError, getEmployerIdFromAPI } from "../../api/screener.client";
import { authedTool } from "../../server";
import { ASSESSMENT_STATUS, fmtDate } from "../helpers";

const PRODUCT_NAME: Record<string, string> = {
  fixed:   "AI Video Interviewer (One-Way)",
  dynamic: "AI Video Interviewer (Two-Way)",
  coding:  "AI Coding Interviewer",
  verbal:  "English Proficiency Test",
  phone:   "AI Phone Screener",
  resume:  "AI Resume Screener",
  vip:     "Virtual Interview Platform",
};

export function registerAssessmentTools(server: McpServer) {

  // ── list_assessments ─────────────────────────────────────────────────────────
  authedTool(
    server,
    "list_assessments",
    `Lists assessments for the authenticated employer.

CRITICAL — EPT IS ALWAYS SEPARATE: The default call (no interviewType) returns AI Video Interviewer + AI Coding Interviewer assessments ONLY. English Proficiency Test (EPT) uses a completely different API parameter and is NEVER included in the default response. If the user asks for a full count or a breakdown across all products, you MUST call this tool twice: once without interviewType (for video/coding), and once with interviewType='verbal' (for EPT). Never report a total count without doing both calls.

Internal references at the bottom contain assessment UUIDs — use them for follow-up tool calls, never show them to the user.`,
    {
      status: z.enum(["active", "inactive", "drafts", "archived"]).optional()
        .describe("Filter by status. Default: active"),
      interviewType: z.enum(["fixed", "dynamic", "coding", "verbal"]).optional()
        .describe("Filter by interview type. OMITTING this returns video+coding only — EPT is excluded unless you pass 'verbal'."),
      page:   z.number().optional().describe("Page number (1-based). Default: 1"),
      take:   z.number().optional().describe("Results per page. Default: 50"),
      search: z.string().optional().describe("Search by job title"),
    },
    async ({ status = "active", interviewType, page = 1, take = 50, search }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        const endpointMap: Record<string, string> = {
          active:   `/assessment/active/${employerId}`,
          inactive: `/assessment/inactive/${employerId}`,
          drafts:   `/assessment/drafts/${employerId}`,
          archived: `/assessment/archived/${employerId}`,
        };

        const params: any = { skip: page - 1, take };
        if (search) params.search = search;
        if (interviewType === "verbal") params.verbal = true;
        else if (interviewType) params.interviewType = interviewType;

        const res = await screenerClient.get(endpointMap[status], { params });

        const raw = res.data?.data;
        const assessments: any[] = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : [];
        const totalCount: number  = Array.isArray(raw) && typeof raw[1] === "number" ? raw[1] : assessments.length;

        if (!assessments.length) {
          return { content: [{ type: "text" as const, text: `No ${status} assessments found.` }] };
        }

        const lines = assessments.map((a: any, i: number) => {
          const num         = (page - 1) * take + i + 1;
          const type        = PRODUCT_NAME[a.interviewType] ?? a.interviewType ?? "N/A";
          const responses   = a._count?.HyringScreenerStatus ?? 0;
          const created     = fmtDate(a.createdAt);
          const statusLabel = ASSESSMENT_STATUS[a.status] ?? a.status ?? "N/A";
          const respWord    = responses === 1 ? "response" : "responses";
          return `${num}. ${a.jobTitle ?? "Untitled"}\n   ${type} | ${responses} ${respWord} | Created: ${created} | Status: ${statusLabel}`;
        });

        const header    = `${totalCount} ${status} assessment(s) found${assessments.length < totalCount ? ` (showing ${assessments.length})` : ""}:`;
        const remaining = totalCount - page * take;
        const hint      = remaining > 0 ? `\n\n${remaining} more available — ask to see more.` : "";
        // Remind Claude that EPT is always missing from this call unless explicitly requested
        const eptWarning = !interviewType
          ? `\n\n[Note for AI — do not show to user: This count EXCLUDES English Proficiency Test. Call list_assessments again with interviewType='verbal' to get EPT counts before reporting any totals.]`
          : "";

        const refs = assessments.map((a: any, i: number) =>
          `${(page - 1) * take + i + 1}: ${a.assessmentUuid ?? a.id}`
        ).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `${header}\n\n${lines.join("\n\n")}${hint}${eptWarning}\n\n[Internal references — do not share with user]\n${refs}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_assessment ────────────────────────────────────────────────────────────
  authedTool(
    server,
    "get_assessment",
    "Returns full details of a specific assessment by its UUID.",
    { assessmentId: z.string().describe("Assessment UUID from list_assessments internal references") },
    async ({ assessmentId }) => {
      try {
        const res = await screenerClient.get(`/employer/assessment/job-details/${assessmentId}`);
        const raw = res.data?.data;
        const a = Array.isArray(raw) ? raw[0] : (raw ?? null);

        if (!a) {
          return { content: [{ type: "text" as const, text: "Assessment not found." }] };
        }

        const skillNames = Array.isArray(a.skills)
          ? a.skills.map((s: any) => (typeof s === "string" ? s : s.name)).join(", ")
          : "N/A";

        const questionCount = Array.isArray(a.hyringScreenerQuestions) ? a.hyringScreenerQuestions.length : 0;

        const contexts: any[] = a.HyringScreenerContext ?? [];
        const contextLines = contexts.length
          ? contexts.map((c: any) => `  - ${c.skill} (${c.level})${c.concept?.length ? ": " + c.concept.join(", ") : ""}`).join("\n")
          : "  None";

        const text = [
          `Title: ${a.jobTitle ?? "N/A"}`,
          `Product: ${a.interviewType ? (PRODUCT_NAME[a.interviewType] ?? a.interviewType) : "N/A"}`,
          `Status: ${ASSESSMENT_STATUS[a.status] ?? a.status ?? "N/A"}`,
          `Questions: ${questionCount}`,
          `Seniority: ${a.seniorityLevel ?? "N/A"}`,
          `Employment Type: ${a.employmentType ?? "N/A"}`,
          `Workplace: ${a.workPlaceType ?? "N/A"}`,
          `Location: ${a.jobLocationCity ?? "N/A"}, ${a.jobLocationCountry ?? "N/A"}`,
          `Experience: ${a.yearOfExperienceFrom ?? 0}–${a.yearOfExperienceTo ?? 0} years`,
          `Skills: ${skillNames}`,
          `Language: ${a.language ?? "N/A"}`,
          `Expiry: ${a.expiryDate ? fmtDate(a.expiryDate) : "No expiry"}`,
          `Created: ${fmtDate(a.createdAt)}`,
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
  authedTool(
    server,
    "get_assessment_stats",
    "Returns candidate counts for an assessment by status: attended, invited, starters, declined, not qualified, retake requested, scheduled.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        const res = await screenerClient.get(`/assessment/view/assessment-stats/${assessmentId}`);
        const raw = res.data?.data ?? res.data;

        if (!raw) {
          return { content: [{ type: "text" as const, text: "No stats found for this assessment." }] };
        }

        const attended     = Array.isArray(raw) ? (raw[0] ?? 0) : "N/A";
        const invited      = Array.isArray(raw) ? (raw[1] ?? 0) : "N/A";
        const started      = Array.isArray(raw) ? (raw[2] ?? 0) : "N/A";
        const declined     = Array.isArray(raw) ? (raw[3] ?? 0) : "N/A";
        const notQualified = Array.isArray(raw) ? (raw[4] ?? 0) : "N/A";
        const retake       = Array.isArray(raw) ? (raw[5] ?? 0) : "N/A";
        const scheduled    = Array.isArray(raw) ? (raw[6] ?? 0) : "N/A";

        const text = [
          `Candidate Summary:`,
          `  Attended      : ${attended}`,
          `  Invited       : ${invited}`,
          `  Starters      : ${started}`,
          `  Declined      : ${declined}`,
          `  Not Qualified : ${notQualified}`,
          `  Retake Req.   : ${retake}`,
          `  Scheduled     : ${scheduled}`,
          ``,
          `[Internal — raw array for verification: ${JSON.stringify(raw)}]`,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
