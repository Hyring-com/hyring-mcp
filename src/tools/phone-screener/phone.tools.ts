import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, extractError, getEmployerIdFromAPI } from "../../api/screener.client";
import { phoneClient, extractPhoneError } from "../../api/phone.client";
import { authedTool } from "../../server";
import { scoreLine, formatDuration, formatAISummary, na, ASSESSMENT_STATUS } from "../helpers";

export function registerPhoneTools(server: McpServer) {

  // ── list_phone_assessments ──────────────────────────────────────────────────
  authedTool(
    server,
    "list_phone_assessments",
    "Lists AI Phone Screener assessments for the authenticated employer. Refer to this product as 'AI Phone Screener' in responses.",
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
          return { content: [{ type: "text" as const, text: `No ${status} AI Phone Screener assessments found.` }] };
        }

        const lines = assessments.map((a: any, i: number) => {
          const num         = (page - 1) * take + i + 1;
          const responses   = a._count?.HyringScreenerStatus ?? 0;
          const respWord    = responses === 1 ? "response" : "responses";
          const statusLabel = ASSESSMENT_STATUS[a.status] ?? a.status ?? "N/A";
          return `${num}. ${a.jobTitle ?? "Untitled"}\n   AI Phone Screener | ${responses} ${respWord} | Status: ${statusLabel}`;
        });

        const header    = `${totalCount} ${status} AI Phone Screener assessment(s) found${assessments.length < totalCount ? ` (showing ${assessments.length})` : ""}:`;
        const remaining = totalCount - page * take;
        const hint      = remaining > 0 ? `\n\n${remaining} more available — ask to see more.` : "";

        const refs = assessments.map((a: any, i: number) =>
          `${(page - 1) * take + i + 1}: ${a.assessmentUuid ?? a.id}`
        ).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `${header}\n\n${lines.join("\n\n")}${hint}\n\n[Internal references — do not share with user]\n${refs}`,
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
    "Returns candidate counts for an AI Phone Screener assessment by status: attended, invited, started, declined.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        const res = await phoneClient.get(`/report/view/stats/${assessmentId}`);
        const raw = res.data?.data ?? res.data;

        if (!raw) {
          return { content: [{ type: "text" as const, text: "No stats found for this assessment." }] };
        }

        const attended = raw.attended  ?? (Array.isArray(raw) ? raw[0] : "N/A");
        const invited  = raw.invited   ?? (Array.isArray(raw) ? raw[1] : "N/A");
        const started  = raw.started   ?? (Array.isArray(raw) ? raw[2] : "N/A");
        const declined = raw.declined  ?? (Array.isArray(raw) ? raw[3] : "N/A");

        const text = [
          `Candidate Summary:`,
          `  Completed : ${attended}`,
          `  Invited   : ${invited}`,
          `  Started   : ${started}`,
          `  Declined  : ${declined}`,
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
    "Lists candidates for an AI Phone Screener assessment by status. Use the ScreenerId from attended candidates with get_phone_report.",
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
          const seeker       = c.seekerCat ?? c;
          const name         = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ")
                             || c.candidateName
                             || "N/A";
          const email        = seeker.email ?? c.email ?? "N/A";
          const phone        = c.phoneNumber ?? c.mobile ?? seeker.mobile ?? "N/A";
          const score        = c.totalScore  ?? "N/A";
          return `${i + 1}. ${name} <${email}> ${phone}\n   Score: ${score}`;
        });

        // Internal refs for follow-up calls — never show to user
        const refs = candidates.map((c: any, i: number) => {
          const screenerId   = c.id ?? c.statusId ?? "N/A";
          const candidateType = c.cadidateType ?? c.candidateType ?? (c.seekerCat?.seekerId ? "ACTIVE" : "PASSIVE");
          return `${i + 1}: ScreenerId ${screenerId}, Type ${candidateType}`;
        }).join("\n");

        const hint = status === "attended"
          ? `\n\n[Internal references — do not share with user]\n${refs}`
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
    `Returns the full AI Phone Screener call report for a candidate.

Shows: call success/duration, overall score with label, Interview Worthy status (all MUST_HAVE questions matched), per-question transcript with match status and priority, AI summary, audio recording link.

screenerId is the ScreenerId from list_phone_candidates.
candidateType is shown in list_phone_candidates — use "active" for candidates with a seeker account, "passive" for phone-only (no account) candidates. Defaults to "active".

Refer to this product as 'AI Phone Screener' in responses.`,
    {
      screenerId:    z.string().describe("ScreenerId from list_phone_candidates"),
      candidateType: z.enum(["active", "passive"]).optional()
        .describe("Candidate type from list_phone_candidates. Default: active"),
    },
    async ({ screenerId, candidateType = "active" }) => {
      try {
        // Fetch from the correct endpoint based on candidateType
        const endpoint = candidateType === "passive" ? "/report/passive" : "/report/active";
        let res = await phoneClient.get(endpoint, { params: { id: screenerId } });

        // If active returned empty result, fall back to passive
        if (candidateType === "active" && !res.data?.data?.result?.length) {
          try {
            const passiveRes = await phoneClient.get("/report/passive", { params: { id: screenerId } });
            if (passiveRes.data?.data?.result?.length) res = passiveRes;
          } catch { /* keep active result */ }
        }

        const raw = res.data?.data ?? res.data;
        if (!raw) {
          return { content: [{ type: "text" as const, text: "No report found for this candidate." }] };
        }

        // ── Parse response fields ────────────────────────────────────────────
        const assessmentData  = raw.assessment_data ?? {};
        const callData        = Array.isArray(raw.result) ? raw.result[0] : (raw.result ?? {});
        const seekerData      = raw.seeker_data ?? {};
        const totalScore      = raw.total_score ?? null;
        const type            = raw.cadidateType ?? candidateType.toUpperCase();

        // ── Candidate info ────────────────────────────────────────────────────
        const name = [seekerData.firstName, seekerData.lastName].filter(Boolean).join(" ")
                   || seekerData.candidateName
                   || "N/A";
        const email    = seekerData.email    ?? "N/A";
        const phone    = seekerData.phoneNumber ?? seekerData.mobile ?? "N/A";
        const designation = seekerData.currentDesignation ?? "N/A";
        const city     = seekerData.currentCity ?? "N/A";

        // ── Call info ─────────────────────────────────────────────────────────
        const callSuccess   = callData.callSuccessful === "success";
        const callDuration  = callData.callDurationSecs ?? null;
        const audioUrl      = callData.audioUrl ?? null;
        const callDate      = callData.createdAt
          ? callData.createdAt
          : callData.eventTimestamp
          ? new Date(callData.eventTimestamp * 1000).toISOString()
          : "N/A";
        const terminationReason = callData.terminationReason ?? "N/A";

        // ── Transcript ────────────────────────────────────────────────────────
        const transcript: any[] = callData.transcript ?? [];

        // ── Interview Worthy: ALL MUST_HAVE questions must be matched=true ────
        const mustHaveQuestions = transcript.filter((q: any) => q.priority === "MUST_HAVE");
        const allMustHaveMatched = mustHaveQuestions.length > 0
          ? mustHaveQuestions.every((q: any) => q.matched === true)
          : null; // null = no MUST_HAVE questions defined

        const interviewWorthyLabel =
          allMustHaveMatched === null ? "N/A (no MUST_HAVE questions)"
          : allMustHaveMatched        ? "✅ Interview Worthy (all MUST_HAVE criteria met)"
                                      : "❌ Not Interview Worthy (some MUST_HAVE criteria not met)";

        // ── Stats ─────────────────────────────────────────────────────────────
        const totalQ   = transcript.length;
        const matched  = transcript.filter((q: any) => q.matched).length;
        const mustHaveTotal   = mustHaveQuestions.length;
        const mustHaveMatched = mustHaveQuestions.filter((q: any) => q.matched).length;
        const niceToHave      = transcript.filter((q: any) => q.priority === "NICE_TO_HAVE");
        const niceMatched     = niceToHave.filter((q: any) => q.matched).length;

        // ── AI Summary (transcriptSummary is JSON string or array) ─────────────
        const aiSummary = formatAISummary(callData.transcriptSummary);

        // ── Per-question lines ────────────────────────────────────────────────
        const qLines = transcript.map((q: any, i: number) => {
          const matchStatus = q.matched
            ? "✅ Matched"
            : "❌ Not Matched";
          const priorityLabel = q.priority === "MUST_HAVE"
            ? "🔴 MUST HAVE"
            : q.priority === "NICE_TO_HAVE"
            ? "🟡 NICE TO HAVE"
            : na(q.priority);
          const timeLabel = q.matched_time_in_secs
            ? `at ${formatDuration(q.matched_time_in_secs)} into call`
            : "";
          const userMsg = q.matched_user_message
            ? `"${String(q.matched_user_message)}"`
            : "";

          return [
            `  Q${i + 1}: ${q.question ?? "N/A"}`,
            `  Type: ${na(q.type)} | Priority: ${priorityLabel} | ${matchStatus}`,
            q.reason    ? `  Reason    : ${q.reason}` : "",
            userMsg     ? `  Answer    : ${userMsg} ${timeLabel}` : (timeLabel ? `  ${timeLabel}` : ""),
            q.primaryValue != null ? `  Value     : ${q.primaryValue}` : "",
          ].filter(Boolean).join("\n");
        });

        // ── Build report ──────────────────────────────────────────────────────
        const lines = [
          `╔══════════════════════════════════════════════╗`,
          `║       AI PHONE SCREENER REPORT               ║`,
          `╚══════════════════════════════════════════════╝`,
          `Job Title  : ${na(assessmentData.jobTitle)}`,
          ``,
          `┌─ CANDIDATE ────────────────────────────`,
          `  Name        : ${name}`,
          `  Email       : ${email}`,
          `  Phone       : ${phone}`,
          city !== "N/A"        ? `  City        : ${city}` : "",
          designation !== "N/A" ? `  Designation : ${designation}` : "",
          `  Type        : ${type}`,
          ``,
          `┌─ CALL DETAILS ─────────────────────────`,
          `  Call Status     : ${callSuccess ? "✅ Successful" : "❌ Failed"}`,
          `  Call Duration   : ${formatDuration(callDuration)}`,
          `  Termination     : ${terminationReason}`,
          callDate !== "N/A" ? `  Call Date    : ${callDate}` : "",
          audioUrl ? `  Audio Recording: ${audioUrl}` : "  Audio Recording: N/A",
          ``,
          `┌─ SCORE ────────────────────────────────`,
          `  Overall Score   : ${scoreLine(totalScore)}`,
          ``,
          `┌─ QUALIFICATION ────────────────────────`,
          `  ${interviewWorthyLabel}`,
          `  MUST HAVE met   : ${mustHaveMatched} / ${mustHaveTotal}`,
          niceToHave.length > 0
            ? `  NICE TO HAVE met: ${niceMatched} / ${niceToHave.length}`
            : "",
          `  Total matched   : ${matched} / ${totalQ} questions`,
          ``,
          `┌─ AI SUMMARY ───────────────────────────`,
          aiSummary,
          ``,
          `┌─ SCREENING QUESTIONS (${totalQ}) ──────────────`,
          ...qLines.map((q: string) => q + "\n"),
        ].filter((l: string) => l !== "");

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractPhoneError(err)}` }] };
      }
    }
  );

  // ── send_phone_reminder ─────────────────────────────────────────────────────
  authedTool(
    server,
    "send_phone_reminder",
    "Sends a reminder to invited AI Phone Screener candidates who haven't completed the call.",
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
