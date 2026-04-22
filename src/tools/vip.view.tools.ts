import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { vipClient, extractVipError } from "../api/vip.client";
import { getEmployerIdFromToken } from "../auth/credentials";
import { authedTool } from "../server";

export function registerVipViewTools(server: McpServer) {

  // ── list_vip_assessments ────────────────────────────────────────────────────
  authedTool(
    server,
    "list_vip_assessments",
    "Lists VIP Live Interview job roles for the authenticated employer.",
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
          return { content: [{ type: "text" as const, text: `No ${status} VIP job roles found.` }] };
        }

        const lines = assessments.map((a: any, i: number) => {
          const id = a.assessmentUuid ?? a.id;
          return `${(page - 1) * take + i + 1}. [ID: ${id}] ${a.jobTitle ?? "Untitled"} — Status: ${a.status ?? "N/A"} | ${a.jobLocationCity ?? ""}, ${a.jobLocationCountry ?? ""}`;
        });

        const showing = `Showing ${assessments.length} of ${totalCount} ${status} VIP job role(s) (page ${page}):`;
        const hint    = totalCount > page * take ? `\n\nUse page: ${page + 1} to see more.` : "";

        return {
          content: [{
            type: "text" as const,
            text: `${showing}\n\n${lines.join("\n")}${hint}`,
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
    "Returns interview counts for a VIP job role by status: completed, scheduled, cancelled.",
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
          `=== VIP Live Interview Stats: ${assessmentId} ===`,
          `Completed:  ${completed}`,
          `Scheduled:  ${scheduled}`,
          `Cancelled:  ${cancelled}`,
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
    "Lists VIP Live Interviews for a job role by status. Use statusId from completed interviews with get_vip_report.",
    {
      assessmentId: z.string().describe("Assessment UUID from list_vip_assessments"),
      status: z.enum(["completed", "scheduled", "cancelled"])
        .optional()
        .describe("Interview status filter. Default: completed"),
    },
    async ({ assessmentId, status = "completed" }) => {
      try {
        const employerId = getEmployerIdFromToken();
        const res = await vipClient.get(`/details/interview/${status}/${employerId}`, {
          params: { assessmentId },
        });
        const raw = res.data?.data ?? res.data;
        const interviews: any[] = Array.isArray(raw) ? raw : [];

        if (!interviews.length) {
          return { content: [{ type: "text" as const, text: `No ${status} interviews found for job role ${assessmentId}.` }] };
        }

        const lines = interviews.map((iv: any, i: number) => {
          const seeker   = iv.seekerCat ?? iv.seeker ?? iv;
          const name     = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A";
          const email    = seeker.email ?? iv.email ?? "N/A";
          const statusId = iv.id ?? iv.statusId ?? "N/A";
          const stage    = iv.hiringStage ?? "N/A";
          const date     = iv.interviewDate ?? iv.scheduledAt ?? iv.createdAt ?? "N/A";
          return `${i + 1}. [StatusId: ${statusId}] ${name} <${email}>\n   Stage: ${stage} | Date: ${date}`;
        });

        const hint = status === "completed"
          ? `\nUse StatusId with get_vip_report to view the interview report.`
          : "";

        return {
          content: [{
            type: "text" as const,
            text: `${interviews.length} ${status} interview(s) for job role ${assessmentId}:\n\n${lines.join("\n\n")}${hint}`,
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
    "Returns the full VIP Live Interview report for a completed interview: candidate info, feedback, hiring stage.",
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
        const seeker     = r?.seekerCat ?? r?.seeker ?? {};
        const assessment = r?.vipAssessment ?? r?.hyringScreenerAssessment ?? {};

        const name = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A";

        // Feedback from interviewer
        const feedback      = r?.interviewFeedback ?? r?.feedback ?? {};
        const rating        = feedback.rating ?? r?.rating ?? null;
        const feedbackText  = feedback.comment ?? feedback.feedback ?? r?.feedbackText ?? null;
        const recommendation = feedback.recommendation ?? r?.recommendation ?? null;

        const lines = [
          `╔══════════════════════════════════════╗`,
          `║     VIP LIVE INTERVIEW REPORT        ║`,
          `╚══════════════════════════════════════╝`,
          `Job Role   : ${assessment.jobTitle ?? "N/A"}`,
          `StatusId   : ${statusId}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${name}`,
          `  Email        : ${seeker.email ?? "N/A"}`,
          `  Status       : ${r?.assessmentStatus ?? r?.status ?? "N/A"}`,
          `  Hiring Stage : ${r?.hiringStage ?? "N/A"}`,
          `  Interview Date: ${r?.interviewDate ?? r?.createdAt ?? "N/A"}`,
          ``,
          `┌─ INTERVIEW FEEDBACK ────────────────────`,
          rating != null         ? `  Rating         : ${"★".repeat(Math.round(rating))} (${rating}/5)` : "  Rating         : N/A",
          recommendation         ? `  Recommendation : ${recommendation}` : "",
          feedbackText           ? `  Comments       : "${feedbackText}"` : "  Comments       : N/A",
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
    "Updates the hiring stage for a VIP Live Interview candidate.",
    {
      statusId:    z.string().describe("Interview status ID from list_vip_interviews"),
      hiringStage: z.string().describe("New hiring stage value, e.g. 'shortlisted', 'rejected', 'hired'"),
    },
    async ({ statusId, hiringStage }) => {
      try {
        const employerId = getEmployerIdFromToken();
        await vipClient.post(`/details/change/hyring-stage/${employerId}`, {
          statusId,
          hiringStage,
        });
        return { content: [{ type: "text" as const, text: `Hiring stage updated to "${hiringStage}" for interview ${statusId}.` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractVipError(err)}` }] };
      }
    }
  );
}
