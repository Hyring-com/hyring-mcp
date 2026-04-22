import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError, getEmployerIdFromAPI } from "../api/screener.client";
import { authedTool } from "../server";

export function registerCandidateInviteTools(server: McpServer) {

  // ── invite_candidate ──────────────────────────────────────────────────────────
  authedTool(
    server,
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
  authedTool(
    server,
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
        const employerId = await getEmployerIdFromAPI();

        const res = await screenerClient.post(`/employer/assessment/invite/bulk/${employerId}`, {
          assessmentRefId: assessmentId,
          employerId,
          candidates: candidates.map((c: any) => ({
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
}
