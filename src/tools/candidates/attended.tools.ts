import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError } from "../../api/screener.client";
import { authedTool } from "../../server";
import { mapStage } from "../helpers";

export function registerAttendedCandidatesTools(server: McpServer) {

  // ── list_attended_candidates ───────────────────────────────────────────────
  authedTool(
    server,
    "list_attended_candidates",
    `Lists candidates who have completed an assessment. Use this to get the candidate list and their internal references (SeekerId, Batch) for report tool calls.

Score will show as N/A from this endpoint — that is expected. If the user asks for scores, call the appropriate report tool for each candidate using the SeekerId and Batch from the internal references:
- fixed → get_fixed_report
- dynamic → get_dynamic_report
- coding → get_coding_report
- verbal → get_verbal_report

The Batch number is the candidate's latest attempt. Always pass it to the report tool — omitting it defaults to batch 1 (first attempt) which may be outdated.

- AI Video Interviewer (One-Way/Two-Way) / AI Coding Interviewer: shows Hiring Stage
- English Proficiency Test: shows Qualified (Yes/No) — no hiring stage`,
    {
      assessmentId:  z.string().describe("Assessment UUID"),
      interviewType: z.enum(["fixed", "dynamic", "coding", "verbal"]).describe("Type of assessment"),
    },
    async ({ assessmentId, interviewType }) => {
      try {
        let candidates: any[] = [];

        if (interviewType === "verbal") {
          // Verbal attended — different endpoint, tuple: [assessmentData, topFive, filteredResponses, total_count, ...]
          const res = await screenerClient.get(`/assessment/verbal/attended/${assessmentId}`, {
            params: { skip: 0, take: 50, search: "", stage: "", level: "", status: "", date: "", sortBy: "" },
          });
          const raw = res.data?.data;
          if (Array.isArray(raw)) {
            const slot2 = raw[2];
            candidates = Array.isArray(slot2) ? slot2 : [];
          }
        } else {
          // seekers endpoint: no pagination, returns all attended candidates reliably
          // Returns: id, batch, seekerId, seekerCat (firstName, lastName, email)
          const res = await screenerClient.get(`/assessment/view/attended/seekers/${assessmentId}`);
          const raw = res.data?.data ?? res.data;
          candidates = Array.isArray(raw) ? raw : [];
        }

        if (!candidates.length) {
          return { content: [{ type: "text" as const, text: `No attended candidates found for assessment ${assessmentId}.` }] };
        }

        const lines = candidates.map((c: any, i: number) => {
          const seeker    = c.seekerCat ?? c;
          const name      = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A";
          const email     = seeker.email ?? c.email ?? "N/A";
          const batch     = c.batch ?? 1;
          const score     = c.totalScore ?? "N/A";
          const attempts  = batch > 1 ? ` | Attempts: ${batch}` : "";

          const stage = c.hiringStage ? ` | Hiring Stage: ${mapStage(c.hiringStage)}` : "";
          const qualified = interviewType === "verbal" && c.isQualified != null
            ? ` | Qualified: ${c.isQualified ? "Yes ✓" : "No ✗"}`
            : "";
          const scoreStr = score !== "N/A" ? ` | Score: ${score}` : "";

          return `${i + 1}. ${name} <${email}>${scoreStr}${stage}${qualified}${attempts}`;
        });

        // Internal refs for follow-up report calls — never show to user
        const refs = candidates.map((c: any, i: number) => {
          const seeker   = c.seekerCat ?? c;
          const seekerId = c.seekerId ?? seeker.seekerId;
          const statusId = c.id ?? c.statusId;
          const batch    = c.batch ?? 1;
          return interviewType === "verbal"
            ? `${i + 1}: StatusId ${statusId}, Batch ${batch}, AssessmentId ${assessmentId}`
            : `${i + 1}: SeekerId ${seekerId}, StatusId ${statusId}, Batch ${batch}, AssessmentId ${assessmentId}`;
        }).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `${candidates.length} completed candidate(s):\n\n${lines.join("\n\n")}\n\n[Internal references — do not share with user]\n${refs}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
