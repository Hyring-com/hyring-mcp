import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError, getEmployerIdFromAPI } from "../api/screener.client";
import { authedTool } from "../server";

export function registerCandidateReviewTools(server: McpServer) {

  // ── list_candidates ───────────────────────────────────────────────────────────
  authedTool(
    server,
    "list_candidates",
    "Lists candidates for an assessment filtered by status. Returns seekerIds needed for result tools.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      status: z.enum(["completed", "invited", "started", "declined", "not_qualified", "retake", "scheduled"]).optional()
        .describe("Filter by status. Default: completed"),
      skip: z.number().optional().describe("Pagination offset. Default: 0"),
      take: z.number().optional().describe("Number of results. Default: 20"),
    },
    async ({ assessmentId, status = "completed", skip = 0, take = 20 }) => {
      try {
        // Backend routes confirmed: all use view/ prefix
        // Response tuple: [assessmentData, topFiveCandidate, filteredResponses, total_count, filtered_count, stageCountsData, metrics]
        // Candidates are at index [2], total_count at index [3]
        const endpointMap: Record<string, string> = {
          completed:     `/assessment/view/attended/${assessmentId}`,
          invited:       `/assessment/view/invited/${assessmentId}`,
          started:       `/assessment/view/started/${assessmentId}`,
          declined:      `/assessment/view/declined/${assessmentId}`,
          not_qualified: `/assessment/view/not-qualified/${assessmentId}`,
          retake:        `/assessment/view/retake-request/${assessmentId}`,
          scheduled:     `/assessment/view/scheduled/${assessmentId}`,
        };

        const res = await screenerClient.get(endpointMap[status], { params: { skip, take } });
        const raw = res.data?.data;

        // Backend returns a tuple: [assessment_info, top_candidates, candidates_list, total_count, ...]
        // candidates_list is always at index 2 for attended/status views
        let candidates: any[] = [];
        if (Array.isArray(raw)) {
          // Tuple response — candidates are at index 2
          const slot2 = raw[2];
          candidates = Array.isArray(slot2) ? slot2 : [];
          // Fallback: if slot2 is empty but raw itself looks like a flat list of candidates
          if (!candidates.length && raw.length > 0 && raw[0]?.seekerId != null) {
            candidates = raw;
          }
        } else {
          candidates = raw?.candidates ?? raw?.items ?? [];
        }

        const totalCount: number = Array.isArray(raw) && typeof raw[3] === "number" ? raw[3] : candidates.length;

        if (!candidates.length) {
          return { content: [{ type: "text" as const, text: `No ${status} candidates for assessment ${assessmentId}. Total on record: ${totalCount}` }] };
        }

        const lines = candidates.map((c: any, i: number) => {
          const seeker   = c.seekerCat ?? c;
          const name     = c.name ?? ([seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A");
          const email    = c.email ?? seeker.email ?? "N/A";
          const score    = c.totalScore != null ? ` | Score: ${c.totalScore}` : "";
          const stage    = c.hiringStage ? ` | Stage: ${c.hiringStage}` : "";
          const seekerId = c.seekerId ?? seeker.seekerId ?? c.id;
          const statusId = c.id ?? c.statusId;
          const batch    = c.batch ?? "";
          return `${skip + i + 1}. [SeekerId: ${seekerId} | StatusId: ${statusId}${batch ? ` | Batch: ${batch}` : ""}] ${name} <${email}>${score}${stage} | Status: ${c.assessmentStatus ?? c.status ?? "N/A"}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `Showing ${candidates.length} of ${totalCount} ${status} candidate(s) for assessment ${assessmentId}:\n\n${lines.join("\n")}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── update_hiring_stage ───────────────────────────────────────────────────────
  authedTool(
    server,
    "update_hiring_stage",
    `Updates the hiring stage for a candidate after reviewing their interview result.

Applies to: One-Way (fixed), Two-Way (dynamic), and Coding interviews ONLY.
Does NOT apply to: EPT/Verbal, Phone Screener, or Resume Screener — those use AI-determined Qualified (Yes/No) status only.

Stages:
- "SHORTLISTED"      = Advance candidate to next round
- "HIRED"            = Candidate is hired
- "REJECTED"         = Reject candidate (provide rejectReason for good candidate experience)
- "ON_HOLD"          = Hold for later review
- "NOT_APPLICABLE"   = Mark as not applicable
- "NOT_YET_EVALUATED"= Reset to pending evaluation`,
    {
      resultId:         z.number().describe("StatusId from list_candidates"),
      stage:            z.enum(["SHORTLISTED", "HIRED", "REJECTED", "ON_HOLD", "NOT_APPLICABLE", "NOT_YET_EVALUATED"]).describe("Hiring stage to set"),
      rejectReason:     z.string().optional().describe("Reason for rejection — recommended when stage is REJECTED"),
      hideRejectReason: z.boolean().optional().describe("Hide rejection reason from the candidate. Default: false"),
    },
    async ({ resultId, stage, rejectReason, hideRejectReason }) => {
      try {
        const payload: any = { id: resultId, status: stage };
        if (rejectReason)                  payload.rejectReason     = rejectReason;
        if (hideRejectReason !== undefined) payload.hideRejectReason = hideRejectReason;

        await screenerClient.patch("/assessment/result-change", payload);

        return { content: [{ type: "text" as const, text: `Candidate (result ${resultId}) stage updated to ${stage}.${rejectReason ? `\nReason: "${rejectReason}"` : ""}` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── send_reminder ─────────────────────────────────────────────────────────────
  authedTool(
    server,
    "send_reminder",
    "Sends a reminder email to a candidate who has been invited but hasn't started the interview yet.",
    {
      inviteId: z.number().describe("Invite ID (visible in list_candidates with status='invited')"),
    },
    async ({ inviteId }) => {
      try {
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
