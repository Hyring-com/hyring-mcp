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
          const responses   = a._count?.HyringPhoneScreenerStatus ?? 0;
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
        // Global ResponseInterceptor wraps in { status, message, data: <service return> }
        // Stats service itself returns { status, message, data: { attended, invited, started, declined } }
        // So: res.data.data.data = { attended, invited, ... }
        const envelope = res.data?.data ?? res.data;
        const raw = envelope?.data ?? envelope;

        if (!raw) {
          return { content: [{ type: "text" as const, text: "No stats found for this assessment." }] };
        }

        const attended = raw.attended  ?? "N/A";
        const invited  = raw.invited   ?? "N/A";
        const started  = raw.started   ?? "N/A";
        const declined = raw.declined  ?? "N/A";

        const text = [
          `Candidate Summary:`,
          `  Completed : ${attended}`,
          `  Invited   : ${invited}`,
          `  Started   : ${started}`,
          `  Declined  : ${declined}`,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err: any) {
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
        const res = await phoneClient.get(`/report/view/${status}/${assessmentId}`, {
          params: { page: 0, take: 50, search: "", from: 0, to: 100, date: "", sortBy: "", qualification: "" },
        });
        // Global ResponseInterceptor wraps in { status, message, data: <service return> }
        // Attended service itself returns { status, message, data: { responses, total_count } }
        // So: res.data.data.data = { responses: [...], total_count: N }
        const envelope = res.data?.data ?? res.data;
        const raw = envelope?.data ?? envelope;

        const candidates: any[] = raw?.responses ?? (Array.isArray(raw) ? raw : []);
        const totalCount: number = raw?.total_count ?? candidates.length;

        if (!candidates.length) {
          return { content: [{ type: "text" as const, text: `No ${status} candidates found for assessment ${assessmentId}.` }] };
        }

        const lines = candidates.map((c: any, i: number) => {
          // Active: seekerCat; Passive: invite or HyringPhoneScreenerDemoUsers
          const seeker   = c.seekerCat ?? {};
          const invite   = c.invite ?? {};
          const demoUser = c.HyringPhoneScreenerDemoUsers?.[0] ?? {};
          const name   = [seeker.firstName, seeker.lastName].filter(Boolean).join(" ")
                       || invite.candidateName
                       || demoUser.candidateName
                       || c.candidateName
                       || "N/A";
          const email  = seeker.email ?? invite.email ?? c.email ?? "N/A";
          const phone  = seeker.mobile ?? invite.phoneNumber ?? demoUser.phoneNumber ?? c.phoneNumber ?? c.mobile ?? "N/A";
          const score  = c.totalScore != null ? `${c.totalScore}%` : "N/A";
          const candType = (c.cadidateType ?? c.candidateType ?? (seeker.seekerId ? "ACTIVE" : "PASSIVE")).toUpperCase();

          if (status === "attended") {
            return `${i + 1}. ${name} <${email}>\n   Phone: ${phone} | Score: ${score} | Type: ${candType}`;
          } else if (status === "declined") {
            const reason = c.declineReason ?? "N/A";
            return `${i + 1}. ${name}\n   Phone: ${phone} | Reason: ${reason}`;
          } else {
            // invited / started
            const schedDate = c.scheduledDate ?? c.createdAt ?? "N/A";
            return `${i + 1}. ${name}\n   Phone: ${phone} | Status: ${c.status ?? status} | Date: ${schedDate}`;
          }
        });

        // Internal refs only needed for attended (to call get_phone_report)
        const refs = candidates.map((c: any, i: number) => {
          const screenerId   = c.id ?? c.statusId ?? "N/A";
          const candidateType = (c.cadidateType ?? c.candidateType ?? (c.seekerCat?.seekerId ? "ACTIVE" : "PASSIVE")).toLowerCase();
          return `${i + 1}: ScreenerId ${screenerId}, Type ${candidateType}`;
        }).join("\n");

        const refsBlock = status === "attended"
          ? `\n\n[Internal references — do not share with user]\n${refs}`
          : "";

        return {
          content: [{
            type: "text" as const,
            text: `${candidates.length} of ${totalCount} ${status} candidate(s):\n\n${lines.join("\n\n")}${refsBlock}`,
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${extractPhoneError(err)}` }] };
      }
    }
  );

  // ── get_phone_report ────────────────────────────────────────────────────────
  authedTool(
    server,
    "get_phone_report",
    `Returns the full AI Phone Screener call report for a candidate.

IMPORTANT: Always show ALL of the following in your response — never omit any section:
- Candidate name, phone (with country code), email, city, designation
- Call status, duration, date
- Audio recording URL (ALWAYS show the full URL even if not asked — never omit it)
- Overall score with label
- Interview Worthy status
- AI Summary bullet points
- All screening questions with priority, result, and candidate answer
- Full conversation transcript if available
- Questions asked by candidate if available

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
        // active: result = phoneScreenerResponses; passive: result = passiveCandidates
        const callData        = Array.isArray(raw.result) ? raw.result[0] : (raw.result ?? {});
        const seekerData      = raw.seeker_data ?? {};           // active: seekerCat; passive: invite
        const demoUser        = raw.demoUser ?? {};              // passive fallback if invite is null
        const totalScore      = raw.total_score ?? null;
        const type            = raw.cadidateType ?? candidateType.toUpperCase();

        // ── Candidate info ────────────────────────────────────────────────────
        const name = [seekerData.firstName, seekerData.lastName].filter(Boolean).join(" ")
                   || seekerData.candidateName
                   || demoUser.candidateName
                   || "N/A";
        const email       = seekerData.email    ?? "N/A";
        const designation = seekerData.currentDesignation ?? "N/A";
        const city        = seekerData.currentCity ?? "N/A";
        // Phone with country code: +{phoneCode} {number}
        const phoneCode = seekerData.countryCode?.phoneCode ?? demoUser.countryCode?.phoneCode ?? null;
        const phoneRaw  = seekerData.phoneNumber ?? seekerData.mobile ?? demoUser.phoneNumber ?? null;
        const phone     = phoneRaw ? (phoneCode ? `+${phoneCode} ${phoneRaw}` : phoneRaw) : "N/A";

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

        // ── AI Summary & candidate questions ─────────────────────────────────
        const aiSummary       = formatAISummary(callData.transcriptSummary);
        const detailsRequest: any[] = Array.isArray(callData.detailsRequest) ? callData.detailsRequest : [];

        // ── Full conversation transcript (role: "agent" | "candidate") ────────
        const fullTranscript: any[] = callData.fullTranscript ?? [];
        const secToMmSs = (sec: any) => {
          if (sec == null || isNaN(parseFloat(sec))) return "??:??";
          const total = Math.round(parseFloat(sec));
          return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
        };
        const convLines = fullTranscript.map((e: any) => {
          const speaker = e.role === "agent" ? "AI Phone Screener" : (name !== "N/A" ? name : "Candidate");
          return `  [${secToMmSs(e.time_in_call_secs)}] ${speaker}: ${e.message ?? ""}`;
        });

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
          callDate !== "N/A" ? `  Call Date       : ${callDate}` : "",
          ``,
          `┌─ AUDIO RECORDING ──────────────────────`,
          audioUrl ? `  ${audioUrl}` : "  N/A",
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
          detailsRequest.length > 0 ? `┌─ QUESTIONS ASKED BY CANDIDATE ─────────` : "",
          ...detailsRequest.map((q: any, i: number) =>
            `  ${i + 1}. ${typeof q === "string" ? q : q.question ?? JSON.stringify(q)}`
          ),
          detailsRequest.length > 0 ? `` : "",
          `┌─ SCREENING QUESTIONS (${totalQ}) ──────────────`,
          ...qLines.map((q: string) => q + "\n"),
          convLines.length > 0 ? `┌─ FULL CONVERSATION (${fullTranscript.length} messages) ──────` : "",
          ...convLines,
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
