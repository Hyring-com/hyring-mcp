import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, requireAuth, extractError, getEmployerIdFromAPI } from "../api/screener.client";

export function registerCandidateManageTools(server: McpServer) {

  // ── list_candidates ───────────────────────────────────────────────────────────
  server.tool(
    "list_candidates",
    "Lists candidates for an assessment filtered by status. Returns seekerIds needed for result tools.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      status: z.enum(["completed", "invited", "started", "declined", "not_qualified"]).optional()
        .describe("Filter by status. Default: completed"),
      skip: z.number().optional().describe("Pagination offset. Default: 0"),
      take: z.number().optional().describe("Number of results. Default: 20"),
    },
    async ({ assessmentId, status = "completed", skip = 0, take = 20 }) => {
      try {
        requireAuth();

        const endpointMap: Record<string, string> = {
          completed:     `/assessment/view/attended/${assessmentId}`,
          invited:       `/assessment/view/invited/${assessmentId}`,
          started:       `/assessment/view/started/${assessmentId}`,
          declined:      `/assessment/view/declined/${assessmentId}`,
          not_qualified: `/assessment/view/not-qualified/${assessmentId}`,
        };

        const res = await screenerClient.get(endpointMap[status], { params: { skip, take } });
        const raw = res.data?.data;
        const candidates: any[] = Array.isArray(raw) ? raw : raw?.candidates ?? raw?.items ?? [];

        if (!candidates.length) {
          return { content: [{ type: "text" as const, text: `No ${status} candidates for assessment ${assessmentId}.` }] };
        }

        const lines = candidates.map((c: any, i: number) => {
          const score    = c.totalScore != null
            ? ` | Score: ${c.totalScore}`
            : c.overallScore != null ? ` | Score: ${c.overallScore}` : "";
          const stage    = c.hiringStage ? ` | Stage: ${c.hiringStage}` : "";
          const resultId = c.resultId ?? c.id;
          return `${i + 1}. [SeekerId: ${c.seekerId ?? c.id}${resultId ? ` | ResultId: ${resultId}` : ""}] ${c.name ?? "N/A"} <${c.email ?? "N/A"}>${score}${stage} | Status: ${c.assessmentStatus ?? c.status ?? "N/A"}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `${candidates.length} ${status} candidate(s) for assessment ${assessmentId}:\n\n${lines.join("\n")}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── invite_candidate ──────────────────────────────────────────────────────────
  server.tool(
    "invite_candidate",
    "Sends an interview invite to a single candidate for a specific assessment.",
    {
      name:         z.string().describe("Candidate's full name"),
      email:        z.string().email().describe("Candidate's email address"),
      assessmentId: z.string().describe("Assessment UUID"),
      expiresAt:    z.string().optional().describe("ISO date when the invite expires, e.g. '2025-12-31'"),
    },
    async ({ name, email, assessmentId, expiresAt }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        const payload: any = {
          name,
          email,
          assessmentRefId: assessmentId,
          employerId,
        };
        if (expiresAt) payload.expiresAt = expiresAt;

        const res = await screenerClient.post(`/employer/assessment/invite/${employerId}`, payload);
        const status = res.data?.data?.status ?? res.data?.message ?? "sent";

        return {
          content: [{
            type: "text" as const,
            text: `Invite sent to ${name} (${email}) for assessment ${assessmentId}.\nStatus: ${status}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── bulk_invite ───────────────────────────────────────────────────────────────
  server.tool(
    "bulk_invite",
    "Sends interview invites to multiple candidates at once.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      candidates: z.array(z.object({
        name:   z.string(),
        email:  z.string().email(),
        mobile: z.string().optional(),
      })).describe("List of candidates to invite"),
    },
    async ({ assessmentId, candidates }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        const res = await screenerClient.post(`/employer/assessment/invite/bulk/${employerId}`, {
          assessmentRefId: assessmentId,
          employerId,
          candidates: candidates.map((c) => ({
            name:   c.name,
            email:  c.email,
            mobile: c.mobile ?? null,
          })),
        });

        const failed: string[] = res.data?.data?.failed ?? [];
        const sent = candidates.length - failed.length;

        return {
          content: [{
            type: "text" as const,
            text: `Bulk invite complete for assessment ${assessmentId}.\nSent: ${sent}/${candidates.length}\n${failed.length ? `Failed emails: ${failed.join(", ")}` : "All invites sent successfully."}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── update_hiring_stage ───────────────────────────────────────────────────────
  server.tool(
    "update_hiring_stage",
    `Updates the hiring stage for a candidate after reviewing their interview result.

Stages:
- "QUALIFIED"     = Advance candidate in the hiring pipeline
- "NOT_QUALIFIED" = Reject (provide a rejectReason for good candidate experience)
- "ON_HOLD"       = Hold for later review`,
    {
      resultId:         z.number().describe("Result record ID (from list_candidates or get_candidate_result)"),
      stage:            z.enum(["QUALIFIED", "NOT_QUALIFIED", "ON_HOLD"]).describe("Hiring stage to set"),
      rejectReason:     z.string().optional().describe("Reason for rejection — recommended when stage is NOT_QUALIFIED"),
      hideRejectReason: z.boolean().optional().describe("Hide rejection reason from the candidate. Default: false"),
    },
    async ({ resultId, stage, rejectReason, hideRejectReason }) => {
      try {
        requireAuth();

        const payload: any = {
          id:     resultId,
          status: stage,
        };
        if (rejectReason)                   payload.rejectReason     = rejectReason;
        if (hideRejectReason !== undefined)  payload.hideRejectReason = hideRejectReason;

        await screenerClient.patch("/assessment/result-change", payload);

        const msgs: Record<string, string> = {
          QUALIFIED:     `Candidate (result ${resultId}) marked as QUALIFIED.`,
          NOT_QUALIFIED: `Candidate (result ${resultId}) marked as NOT QUALIFIED.${rejectReason ? `\nReason: "${rejectReason}"` : ""}`,
          ON_HOLD:       `Candidate (result ${resultId}) placed ON HOLD.`,
        };

        return { content: [{ type: "text" as const, text: msgs[stage] }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── send_reminder ─────────────────────────────────────────────────────────────
  server.tool(
    "send_reminder",
    "Sends a reminder email to a candidate who has been invited but hasn't started the interview yet.",
    {
      inviteId: z.number().describe("Invite ID (visible in list_candidates with status='invited')"),
    },
    async ({ inviteId }) => {
      try {
        requireAuth();
        await screenerClient.patch(`/assessment/send-reminder/${inviteId}`);
        return {
          content: [{ type: "text" as const, text: `Reminder sent for invite ${inviteId}.` }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
