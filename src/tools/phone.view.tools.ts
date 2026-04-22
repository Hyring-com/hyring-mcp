import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError, getEmployerIdFromAPI } from "../api/screener.client";
import { phoneClient, extractPhoneError } from "../api/phone.client";
import { authedTool } from "../server";

export function registerPhoneViewTools(server: McpServer) {

  // ── list_phone_assessments ──────────────────────────────────────────────────
  authedTool(
    server,
    "list_phone_assessments",
    "Lists Phone Screener assessments for the authenticated employer.",
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

        const params: any = { skip: page - 1, take, phone: true };
        if (search) params.search = search;

        const res = await screenerClient.get(endpointMap[status], { params });

        const raw = res.data?.data;
        const assessments: any[] = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : [];
        const totalCount: number  = Array.isArray(raw) && typeof raw[1] === "number" ? raw[1] : assessments.length;

        if (!assessments.length) {
          return { content: [{ type: "text" as const, text: `No ${status} phone assessments found.` }] };
        }

        const lines = assessments.map((a: any, i: number) => {
          const candidates = a._count?.HyringScreenerStatus ?? "N/A";
          const id         = a.assessmentUuid ?? a.id;
          return `${(page - 1) * take + i + 1}. [ID: ${id}] ${a.jobTitle ?? "Untitled"} — Status: ${a.status ?? "N/A"} | Candidates: ${candidates}`;
        });

        const showing = `Showing ${assessments.length} of ${totalCount} ${status} phone assessment(s) (page ${page}):`;
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

  // ── get_phone_assessment_stats ──────────────────────────────────────────────
  authedTool(
    server,
    "get_phone_assessment_stats",
    "Returns candidate counts for a Phone Screener assessment by status: attended, invited, started, declined.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        const res = await phoneClient.get(`/report/view/stats/${assessmentId}`);
        const raw = res.data?.data ?? res.data;

        if (!raw) {
          return { content: [{ type: "text" as const, text: "No stats found for this assessment." }] };
        }

        // Response: { attended, invited, started, declined } or positional array
        const attended = raw.attended  ?? (Array.isArray(raw) ? raw[0] : "N/A");
        const invited  = raw.invited   ?? (Array.isArray(raw) ? raw[1] : "N/A");
        const started  = raw.started   ?? (Array.isArray(raw) ? raw[2] : "N/A");
        const declined = raw.declined  ?? (Array.isArray(raw) ? raw[3] : "N/A");

        const text = [
          `=== Phone Screener Stats: ${assessmentId} ===`,
          `Attended (Completed): ${attended}`,
          `Invited:              ${invited}`,
          `Started:              ${started}`,
          `Declined:             ${declined}`,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractPhoneError(err)}` }] };
      }
    }
  );

  // ── list_phone_candidates ───────────────────────────────────────────────────
  authedTool(
    server,
    "list_phone_candidates",
    "Lists candidates for a Phone Screener assessment by status. Use statusId from attended candidates with get_phone_report.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      status: z.enum(["attended", "invited", "started", "declined"])
        .optional()
        .describe("Candidate status filter. Default: attended"),
    },
    async ({ assessmentId, status = "attended" }) => {
      try {
        const res = await phoneClient.get(`/report/view/${status}/${assessmentId}`);
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
          const seekerId = c.seekerId ?? seeker.seekerId ?? "N/A";
          const stage    = c.hiringStage ?? "N/A";
          const score    = c.totalScore  ?? "N/A";
          return `${i + 1}. [StatusId: ${statusId} | SeekerId: ${seekerId}] ${name} <${email}>\n   Score: ${score} | Stage: ${stage}`;
        });

        const hint = status === "attended"
          ? `\nUse StatusId with get_phone_report to view the full call report.`
          : "";

        return {
          content: [{
            type: "text" as const,
            text: `${candidates.length} ${status} candidate(s) for assessment ${assessmentId}:\n\n${lines.join("\n\n")}${hint}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractPhoneError(err)}` }] };
      }
    }
  );

  // ── get_phone_report ────────────────────────────────────────────────────────
  authedTool(
    server,
    "get_phone_report",
    "Returns the full phone screener call report for a candidate: questions asked, answers, scores, hiring stage.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.number().describe("Candidate seekerId from list_phone_candidates"),
      batch:        z.number().optional().describe("Attempt batch number. Default: 1"),
    },
    async ({ assessmentId, seekerId, batch }) => {
      try {
        const res = await screenerClient.post("/assessment/result", {
          seekerId,
          assessmentId,
          batch: batch ?? 1,
        });

        // Response tuple: [result, sentiment, result_stats, english_score, final_score]
        const raw: any[] = res.data?.data ?? [];
        const r          = Array.isArray(raw) ? raw[0] : raw;

        if (!r) {
          return { content: [{ type: "text" as const, text: "No report found for this candidate." }] };
        }

        const assessment  = r.hyringScreenerAssessment ?? {};
        const seeker      = r.seekerCat ?? {};
        const questions: any[] = assessment.hyringScreenerQuestions ?? [];
        const batchNum    = (batch ?? 1) - 1;

        // ── Per-question breakdown ──────────────────────────────────────────
        const qLines = questions.map((q: any, i: number) => {
          const ans        = q.HyringScreenerAnswers?.[batchNum] ?? {};
          const transcript = ans.transcript ?? "";
          const score      = ans.isOverwritten && ans.overWrittenScore != null
            ? ans.overWrittenScore
            : (ans.score ?? q.score);

          // Phone question types: YES_NO / RATING / NUMERIC
          const typeLabel = q.questionType ?? "N/A";
          const answerVal = ans.answer ?? ans.primaryAnswer ?? "";

          return [
            `  Q${i + 1}: ${q.question ?? "N/A"}`,
            `  Type: ${typeLabel} | Priority: ${q.priority ?? "N/A"}`,
            answerVal ? `  Answer: ${answerVal}` : "",
            transcript ? `  Transcript: "${String(transcript).slice(0, 300)}${String(transcript).length > 300 ? "…" : ""}"` : "",
            score != null ? `  Score: ${score}` : "",
          ].filter(Boolean).join("\n");
        });

        const name = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ") || "N/A";

        const lines = [
          `╔══════════════════════════════════════╗`,
          `║      PHONE SCREENER REPORT           ║`,
          `╚══════════════════════════════════════╝`,
          `Assessment : ${assessmentId}`,
          `Job Title  : ${assessment.jobTitle ?? "N/A"}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name         : ${name}`,
          `  Email        : ${seeker.email ?? "N/A"}`,
          `  SeekerId     : ${seekerId}`,
          `  Batch        : ${batch ?? 1}`,
          `  Status       : ${r.assessmentStatus ?? "N/A"}`,
          `  Hiring Stage : ${r.hiringStage ?? "N/A"}`,
          `  Total Score  : ${r.totalScore ?? "N/A"}`,
          `  Date         : ${r.createdAt ?? "N/A"}`,
          ``,
          `┌─ SCREENING QUESTIONS (${questions.length}) ─────────────`,
          ...qLines.map((q: string) => q + "\n"),
        ].filter((l: string) => l !== "");

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── update_phone_hiring_stage ───────────────────────────────────────────────
  authedTool(
    server,
    "update_phone_hiring_stage",
    "Updates the hiring stage for a phone screener candidate (e.g. shortlisted, rejected).",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerId:     z.number().describe("Candidate seekerId"),
      hiringStage:  z.string().describe("New hiring stage value, e.g. 'shortlisted', 'rejected', 'hired'"),
    },
    async ({ assessmentId, seekerId, hiringStage }) => {
      try {
        await screenerClient.patch("/assessment/result-change", {
          assessmentId,
          seekerId,
          hiringStage,
        });
        return { content: [{ type: "text" as const, text: `Hiring stage updated to "${hiringStage}" for seeker ${seekerId}.` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── send_phone_reminder ─────────────────────────────────────────────────────
  authedTool(
    server,
    "send_phone_reminder",
    "Sends a reminder to invited phone screener candidates who haven't completed the call.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      seekerIds:    z.array(z.number()).describe("Array of seekerIds to send reminders to"),
    },
    async ({ assessmentId, seekerIds }) => {
      try {
        const employerId = await getEmployerIdFromAPI();
        await phoneClient.patch(`/report/send-reminder/${employerId}`, {
          assessmentId,
          seekerIds,
        });
        return { content: [{ type: "text" as const, text: `Reminder sent to ${seekerIds.length} candidate(s).` }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractPhoneError(err)}` }] };
      }
    }
  );
}
