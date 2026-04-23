import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  screenerClient,
  extractError,
  getEmployerIdFromAPI,
} from "../../api/screener.client";
import { authedTool } from "../../server";

// Rounds total question seconds UP to the nearest fixed slot
// Slots (from UI): 10min=600, 15min=900, 20min=1200, 25min=1500, 60min=3600
function roundToSlot(totalSeconds: number): number {
  if (totalSeconds <= 600) return 600;
  if (totalSeconds <= 900) return 900;
  if (totalSeconds <= 1200) return 1200;
  if (totalSeconds <= 1500) return 1500;
  return 3600;
}

export function registerSharedBuildTools(server: McpServer) {
  // ── configure_assessment ──────────────────────────────────────────────────────
  authedTool(
    server,
    "configure_assessment",
    `Configures availability, proctoring, scoring, and notification settings for an assessment.

Availability:
- "flexi"    = Open link, candidates take anytime (default)
- "schedule" = Fixed time slot (requires scheduleStart + scheduleEnd)

Assessment constraint (flexi only):
- "NO_EXPIRY"             = Never expires (default)
- "SET_DATE"              = Expires on expiryDate
- "SET_RESPONSES_COUNT"   = Closes after responseCount responses`,
    {
      assessmentId: z.string().describe("Assessment UUID"),
      interviewType: z
        .enum(["fixed", "dynamic", "coding", "verbal", "phone", "resume"])
        .optional()
        .describe(
          "Interview type — used to set correct fitScoreWeightAge and interviewTime defaults",
        ),
      availability: z
        .enum(["flexi", "schedule"])
        .optional()
        .describe("Default: flexi"),
      assessmentConstraint: z
        .enum(["NO_EXPIRY", "SET_DATE", "SET_RESPONSES_COUNT"])
        .optional()
        .describe("Default: NO_EXPIRY"),
      expiryDate: z
        .string()
        .optional()
        .describe(
          "ISO date, e.g. '2025-12-31' — required if constraint is SET_DATE",
        ),
      responseCount: z
        .number()
        .optional()
        .describe(
          "Max responses — required if constraint is SET_RESPONSES_COUNT",
        ),
      scheduleStart: z
        .string()
        .optional()
        .describe(
          "ISO datetime for schedule start — required if availability is schedule",
        ),
      scheduleEnd: z
        .string()
        .optional()
        .describe(
          "ISO datetime for schedule end — required if availability is schedule",
        ),
      interviewTime: z
        .number()
        .optional()
        .describe(
          "Override interview duration in seconds. If omitted, auto-calculated from questions (fixed/coding) and rounded to nearest slot: 600/900/1200/1500/3600",
        ),
      candidateVideo: z
        .boolean()
        .optional()
        .describe("Record candidate video. Default: true"),
      enableScreenShare: z
        .boolean()
        .optional()
        .describe("Enable screen sharing. Default: true"),
      tabChangeDetection: z
        .boolean()
        .optional()
        .describe("Flag tab switches. Default: false"),
      faceDetection: z
        .boolean()
        .optional()
        .describe("Flag face out of view. Default: false"),
      multipleFaceDetection: z
        .boolean()
        .optional()
        .describe("Flag multiple faces. Default: false"),
      overallScoreVisible: z
        .boolean()
        .optional()
        .describe("Show overall score to candidate. Default: false"),
      individualScoreVisible: z
        .boolean()
        .optional()
        .describe("Show per-question score to candidate. Default: false"),
      emailNotification: z
        .boolean()
        .optional()
        .describe("Email notifications on completion. Default: true"),
      whatsappNotification: z
        .boolean()
        .optional()
        .describe("WhatsApp notifications. Default: true"),
      // Verbal (English Proficiency) only
      qualificationCriteria: z
        .tuple([z.number(), z.number()])
        .optional()
        .describe(
          "Verbal only — pass score range [min, max]. Default: [76, 100]",
        ),
      verbalWeightAge: z
        .object({
          mti: z
            .number()
            .optional()
            .describe("Mean Turn Initiative. Default: 20"),
          fluency: z.number().optional().describe("Default: 20"),
          grammar: z.number().optional().describe("Default: 20"),
          vocabulary: z.number().optional().describe("Default: 20"),
          pronunciation: z.number().optional().describe("Default: 20"),
        })
        .optional()
        .describe(
          "Verbal only — scoring weights per dimension (must sum to 100). Default: equal 20 each",
        ),
    },
    async ({
      assessmentId,
      interviewType,
      availability,
      assessmentConstraint,
      expiryDate,
      responseCount,
      scheduleStart,
      scheduleEnd,
      interviewTime,
      candidateVideo,
      enableScreenShare,
      tabChangeDetection,
      faceDetection,
      multipleFaceDetection,
      overallScoreVisible,
      individualScoreVisible,
      emailNotification,
      whatsappNotification,
      qualificationCriteria,
      verbalWeightAge,
    }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        const isSchedule = availability === "schedule";
        const isCoding = interviewType === "coding";
        const isFixed = interviewType === "fixed";
        const isPhone = interviewType === "phone";
        const isResume = interviewType === "resume";

        // fitScoreWeightAge is type-specific
        const fitScoreWeightAge = isCoding
          ? [{ codeQuality: 50, problemSolving: 30, codeOptimization: 20 }]
          : [{ technicalScore: 50, communicationScore: 50 }];

        let resolvedInterviewTime = interviewTime;

        if (!resolvedInterviewTime) {
          if (interviewType === "verbal") {
            resolvedInterviewTime = 240;
          } else if (isPhone) {
            resolvedInterviewTime = 300;
          } else if (isResume) {
            resolvedInterviewTime = 600;
          } else if (isFixed) {
            try {
              const qRes = await screenerClient.get(
                `/employer/assessment/questions/${employerId}`,
                {
                  params: { assessmentRefId: assessmentId },
                },
              );
              const questions: any[] = qRes.data?.data ?? [];
              const totalSecs = questions.reduce(
                (sum: number, q: any) => sum + (q.timeToAnswer ?? 30),
                0,
              );
              resolvedInterviewTime =
                totalSecs > 0 ? roundToSlot(totalSecs) : 600;
            } catch {
              resolvedInterviewTime = 600;
            }
          } else if (isCoding) {
            try {
              const aRes = await screenerClient.get(
                `/employer/assessment/job-details/${assessmentId}`,
              );
              const raw = aRes.data?.data;
              const assessment = Array.isArray(raw) ? raw[0] : raw;
              const codingQs: any[] =
                assessment?.HyringScreenerCodingQuestions ?? [];
              const totalMins = codingQs.reduce(
                (sum: number, q: any) => sum + (q.duration ?? 0),
                0,
              );
              resolvedInterviewTime =
                totalMins > 0 ? roundToSlot(totalMins * 60) : 600;
            } catch {
              resolvedInterviewTime = 600;
            }
          } else {
            // dynamic — fixed at 10 min
            resolvedInterviewTime = 600;
          }
        }

        const payload: any = {
          assessmentId,
          assessmentConstraint: assessmentConstraint ?? "NO_EXPIRY",
          interviewTime: resolvedInterviewTime,
          retakeAssessment: true,
          retakeQuestion: "ONE_RETAKE",
          candidateVideo: candidateVideo ?? true,
          enableScreenShare: enableScreenShare ?? true,
          lockAssessment: false,
          tabChanges: tabChangeDetection ?? false,
          faceOutOFView: faceDetection ?? false,
          multipleFaces: multipleFaceDetection ?? false,
          multipleVoices: false,
          isCandidateOverallScore: overallScoreVisible ?? false,
          isCandidateIndividualScore: individualScoreVisible ?? false,
          isCommunicationScore: false,
          scheduleAssessment: isSchedule,
          aiModel: "CHATGPT",
          notification: [
            {
              id: employerId,
              child: false,
              email: emailNotification ?? true,
              slack: [],
              whatsapp: whatsappNotification ?? true,
            },
          ],
          hiringStatusNotification: { email: true, whatsapp: true },
          fitScoreWeightAge,
          // VerbalWeightAge and qualificationCriteria must go via job-configuration, NOT create-verbal-context
          ...(interviewType === "verbal"
            ? {
                VerbalWeightAge: [
                  {
                    mti: verbalWeightAge?.mti ?? 20,
                    fluency: verbalWeightAge?.fluency ?? 20,
                    grammar: verbalWeightAge?.grammar ?? 20,
                    vocabulary: verbalWeightAge?.vocabulary ?? 20,
                    pronunciation: verbalWeightAge?.pronunciation ?? 20,
                  },
                ],
                qualificationCriteria: qualificationCriteria ?? [76, 100],
              }
            : {}),
          integritySignalsEnabled: true,
          engagementVibesEnabled: true,
          cognitiveInsightsEnabled: true,
          cheatingDetectionEnabled: true,
        };

        if (assessmentConstraint === "SET_DATE" && expiryDate) {
          payload.expiryDate = expiryDate;
        }
        if (assessmentConstraint === "SET_RESPONSES_COUNT" && responseCount) {
          payload.responseCount = responseCount;
        }
        if (isSchedule) {
          payload.scheduleDateStart = scheduleStart;
          payload.scheduleDateEnd = scheduleEnd;
        }

        await screenerClient.patch(
          `/employer/assessment/job-configuration/${employerId}`,
          payload,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Assessment ${assessmentId} configured.\nAvailability: ${availability ?? "flexi"} | Constraint: ${assessmentConstraint ?? "NO_EXPIRY"}\n\nNext: publish_assessment`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${extractError(err)}` },
          ],
        };
      }
    },
  );

  // ── review_assessment ─────────────────────────────────────────────────────────
  authedTool(
    server,
    "review_assessment",
    "Returns a complete summary of the assessment before publishing: job details, questions, and configuration.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        const res = await screenerClient.get(
          `/employer/assessment/review/${assessmentId}`,
        );
        const data = res.data?.data ?? res.data;

        if (!data) {
          return {
            content: [
              { type: "text" as const, text: "Could not load review data." },
            ],
          };
        }

        const questions: any[] =
          data.hyringScreenerQuestions ?? data.questions ?? [];

        const lines = [
          `=== ASSESSMENT REVIEW ===`,
          `ID:     ${assessmentId}`,
          `Title:  ${data.jobTitle ?? "N/A"}`,
          `Type:   ${data.interviewType ?? "N/A"}`,
          `Status: ${data.status ?? "N/A"}`,
          ``,
          `--- Job Details ---`,
          `Seniority:  ${data.seniorityLevel ?? "N/A"}`,
          `Experience: ${data.yearOfExperienceFrom ?? 0}–${data.yearOfExperienceTo ?? 0} years`,
          `Skills:     ${Array.isArray(data.skills) ? data.skills.join(", ") : "N/A"}`,
          `Workplace:  ${data.workPlaceType ?? "N/A"}`,
          ``,
          `--- Questions (${questions.length}) ---`,
          ...questions.map(
            (q: any, i: number) =>
              `${i + 1}. ${q.question ?? "N/A"} [${q.difficultyLevel ?? "N/A"}] | Answer: ${q.answerType ?? "N/A"} | Time: ${q.timeToAnswer ?? "N/A"}s`,
          ),
          ``,
          `--- Configuration ---`,
          `Availability:   ${data.availability ?? "N/A"}`,
          `Constraint:     ${data.assessmentConstraint ?? "N/A"}`,
          `Interview Time: ${data.interviewTime ?? "N/A"}s`,
          `Retake:         ${data.retakeAssessment ?? "N/A"}`,
          `Candidate Video:${data.candidateVideo ?? "N/A"}`,
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${extractError(err)}` },
          ],
        };
      }
    },
  );

  // ── publish_assessment ────────────────────────────────────────────────────────
  authedTool(
    server,
    "publish_assessment",
    `Changes the status of an assessment.

Actions:
- "PUBLISHED" = Go live — assessment is now shareable with candidates
- "PAUSED"    = Temporarily stop accepting responses
- "CLOSED"    = Close permanently
- "ARCHIVED"  = Archive the assessment`,
    {
      assessmentId: z.string().describe("Assessment UUID"),
      action: z
        .enum(["PUBLISHED", "PAUSED", "CLOSED", "ARCHIVED"])
        .describe("Action to perform"),
      interviewType: z
        .enum(["fixed", "dynamic", "coding", "verbal", "phone", "resume"])
        .optional()
        .describe("Interview type — required to trigger audio generation for fixed (one-way) assessments"),
    },
    async ({ assessmentId, action, interviewType }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        // Audio processor generates TTS audio for fixed (one-way) questions only
        if (action === "PUBLISHED" && interviewType === "fixed") {
          await screenerClient.post("/employer/audio-processor", {
            assessmentUuid: assessmentId,
            isEdit: false,
          });
        }

        await screenerClient.patch(
          `/employer/assessment/status/${employerId}`,
          {
            assessmentRefId: assessmentId,
            status: action,
          },
        );

        const messages: Record<string, string> = {
          PUBLISHED: `Assessment ${assessmentId} is now LIVE.\nCandidates can now be invited via invite_candidate or bulk_invite.`,
          PAUSED: `Assessment ${assessmentId} is PAUSED. No new responses will be accepted.`,
          CLOSED: `Assessment ${assessmentId} is CLOSED.`,
          ARCHIVED: `Assessment ${assessmentId} has been ARCHIVED.`,
        };

        return { content: [{ type: "text" as const, text: messages[action] }] };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${extractError(err)}` },
          ],
        };
      }
    },
  );
}
