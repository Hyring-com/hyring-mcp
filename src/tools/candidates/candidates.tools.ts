import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError } from "../../api/screener.client";
import { authedTool } from "../../server";

export function registerCandidatesTools(server: McpServer) {

  // ── list_candidates ───────────────────────────────────────────────────────────
  authedTool(
    server,
    "list_candidates",
    "Lists candidates for an assessment filtered by status. Returns seekerIds needed for result tools.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      interviewType: z.enum(["fixed", "dynamic", "coding", "verbal"]).optional()
        .describe("Assessment type. Required for verbal (EPT) — uses a different endpoint."),
      status: z.enum(["completed", "invited", "started", "declined", "not_qualified", "retake", "scheduled"]).optional()
        .describe("Filter by status. Default: completed"),
      skip: z.number().optional().describe("Pagination offset. Default: 0"),
      take: z.number().optional().describe("Number of results. Default: 20"),
    },
    async ({ assessmentId, interviewType, status = "completed", skip = 0, take = 20 }) => {
      try {
        // Backend routes confirmed: all use view/ prefix EXCEPT verbal attended
        // Response tuple: [assessmentData, topFiveCandidate, filteredResponses, total_count, filtered_count, stageCountsData, metrics]
        // Candidates are at index [2], total_count at index [3]

        let res;
        if (interviewType === "verbal" && status === "completed") {
          // Verbal/EPT attended uses a completely different endpoint
          res = await screenerClient.get(`/assessment/verbal/attended/${assessmentId}`, {
            params: { skip, take: Math.max(take, 10), search: "", stage: "", level: "", status: "", date: "", sortBy: "" },
          });
        } else {
          const endpointMap: Record<string, string> = {
            completed:     `/assessment/view/attended/${assessmentId}`,
            invited:       `/assessment/view/invited/${assessmentId}`,
            started:       `/assessment/view/started/${assessmentId}`,
            declined:      `/assessment/view/declined/${assessmentId}`,
            not_qualified: `/assessment/view/not-qualified/${assessmentId}`,
            retake:        `/assessment/view/retake-request/${assessmentId}`,
            scheduled:     `/assessment/view/scheduled/${assessmentId}`,
          };
          // Backend attended endpoint uses 'page' not 'skip' for pagination
          // Send both so it works regardless of which param the endpoint reads
          res = await screenerClient.get(endpointMap[status], { params: { skip, page: skip, take } });
        }
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

        const CAND_STATUS: Record<string, string> = {
          ENDED_ASSESSMENT:        "Completed",
          COMPLETED:               "Completed",
          ENDED_ASSESSMENT_RETAKE: "Completed (Retake)",
          CREATED:                 "Not Completed",
          CREATED_RETAKE:          "Not Completed (Retake)",
          DISQUALIFIED:            "Disqualified",
        };
        const STAGE: Record<string, string> = {
          NOT_YET_EVALUATED: "Pending Review",
          NOT_APPLICABLE:    "Not Applicable",
          ON_HOLD:           "On Hold",
          SHORTLISTED:       "Shortlisted",
          HIRED:             "Hired",
          REJECTED:          "Rejected",
        };

        const lines = candidates.map((c: any, i: number) => {
          const seeker      = c.seekerCat ?? c;
          const name        = c.name ?? ([seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A");
          const email       = c.email ?? seeker.email ?? "N/A";
          const scoreStr    = c.totalScore != null ? ` | Score: ${c.totalScore}` : "";
          const rawStage    = c.hiringStage;
          const stageStr    = rawStage ? ` | Stage: ${STAGE[rawStage] ?? rawStage}` : "";
          const rawStatus   = c.assessmentStatus ?? c.status;
          const statusStr   = rawStatus ? ` | Status: ${CAND_STATUS[rawStatus] ?? rawStatus}` : "";
          return `${skip + i + 1}. ${name} <${email}>${scoreStr}${stageStr}${statusStr}`;
        });

        // Internal refs for follow-up calls — never show to user
        const refs = candidates.map((c: any, i: number) => {
          const seeker   = c.seekerCat ?? c;
          const seekerId = c.seekerId ?? seeker.seekerId ?? c.id;
          const statusId = c.id ?? c.statusId;
          const batch    = c.batch;
          return `${skip + i + 1}: SeekerId ${seekerId}, StatusId ${statusId}${batch ? `, Batch ${batch}` : ""}`;
        }).join("\n");

        const remaining = totalCount - (skip + candidates.length);
        const hint      = remaining > 0 ? `\n\n${remaining} more available — ask to see more.` : "";

        return {
          content: [{
            type: "text" as const,
            text: `${totalCount} ${status} candidate(s) found (showing ${candidates.length}):\n\n${lines.join("\n")}${hint}\n\n[Internal references — do not share with user]\n${refs}`,
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

Applies to: AI Video Interviewer (One-Way), AI Video Interviewer (Two-Way), and AI Coding Interviewer ONLY.
Does NOT apply to: English Proficiency Test, AI Phone Screener, or AI Resume Screener — those use AI-determined Qualified (Yes/No) status only.

Stages:
- "SHORTLISTED"      = Advance candidate to next round
- "HIRED"            = Candidate is hired
- "REJECTED"         = Reject candidate (provide rejectReason for good candidate experience)
- "ON_HOLD"          = Hold for later review
- "NOT_APPLICABLE"   = Mark as not applicable
- "NOT_YET_EVALUATED"= Reset to pending evaluation`,
    {
      assessmentId:     z.string().describe("Assessment UUID — required by backend to look up notification settings"),
      resultId:         z.number().describe("StatusId from list_attended_candidates internal references (labeled 'StatusId'). NOT the SeekerId."),
      stage:            z.enum(["SHORTLISTED", "HIRED", "REJECTED", "ON_HOLD", "NOT_APPLICABLE", "NOT_YET_EVALUATED"]).describe("Hiring stage to set"),
      rejectReason:     z.string().optional().describe("Reason for rejection — recommended when stage is REJECTED"),
      hideRejectReason: z.boolean().optional().describe("Hide rejection reason from the candidate. Default: false"),
    },
    async ({ assessmentId, resultId, stage, rejectReason, hideRejectReason }) => {
      try {
        const payload: any = { id: resultId, status: stage, assessmentId };
        if (rejectReason)                  payload.rejectReason     = rejectReason;
        if (hideRejectReason !== undefined) payload.hideRejectReason = hideRejectReason;

        await screenerClient.patch("/assessment/result-change", payload);

        return { content: [{ type: "text" as const, text: `Candidate hiring stage updated to ${stage}.` }] };
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
