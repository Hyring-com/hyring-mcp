import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  screenerClient,
  extractError,
  getEmployerIdFromAPI,
} from "../../api/screener.client";
import { phoneClient, extractPhoneError } from "../../api/phone.client";
import { authedTool } from "../../server";

export function registerPhoneBuildTools(server: McpServer) {
  // ── create_phone_assessment ───────────────────────────────────────────────────
  authedTool(
    server,
    "create_phone_assessment",
    `Creates a new AI Phone Screener assessment in three steps: type selection → JD upload → job details.

After creation, add ≥3 questions via add_phone_question (or generate via generate_phone_questions),
then call configure_assessment and publish_assessment to go live.`,
    {
      jobTitle: z.string().describe("Job title, e.g. 'Frontend Developer'"),
      jobDescription: z.string().describe("Full job description text"),
      seniorityLevel: z
        .enum(["Fresher", "Junior", "Mid Level", "Senior", "CXO"])
        .optional()
        .describe("Default: Fresher"),
      workPlaceType: z
        .enum(["On-Site", "Hybrid", "Remote"])
        .optional()
        .describe("Default: On-Site"),
      employmentType: z
        .enum([
          "Full-Time",
          "Part-Time",
          "Contract",
          "Temporary",
          "Volunteer",
          "Internship",
        ])
        .optional()
        .describe("Default: Full-Time"),
      yearOfExperienceFrom: z
        .number()
        .optional()
        .describe("Min years of experience. Default: 0"),
      yearOfExperienceTo: z
        .number()
        .optional()
        .describe("Max years of experience. Default: 5"),
      skills: z
        .string()
        .optional()
        .describe("Comma-separated skills, e.g. 'React, TypeScript, Node.js'"),
      language: z
        .string()
        .optional()
        .describe("Assessment language code. Default: en"),
      aiVoice: z
        .enum(["nova", "echo", "shimmer", "alloy", "onyx", "fable"])
        .optional()
        .describe("AI voice for the phone call. Default: nova"),
      jobLocationCountry: z
        .string()
        .optional()
        .describe("Country where the job is located. Default: India"),
      jobLocationCity: z
        .string()
        .optional()
        .describe("City where the job is located. Default: Chennai"),
    },
    async ({
      jobTitle,
      jobDescription,
      seniorityLevel,
      workPlaceType,
      employmentType,
      yearOfExperienceFrom,
      yearOfExperienceTo,
      skills,
      language,
      aiVoice,
      jobLocationCountry,
      jobLocationCity,
    }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        // Step 1: Create assessment record
        const interviewRes = await screenerClient.post(
          `/employer/assessment/job-interview/${employerId}`,
          {
            interviewType: "phone",
            language: language ?? "en",
            aiVoice: aiVoice ?? "nova",
          },
        );

        const assessmentId =
          interviewRes.data?.data?.assessmentUuid ??
          interviewRes.data?.data?.assessmentRefId ??
          interviewRes.data?.assessmentUuid;

        if (!assessmentId) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Failed to create assessment: no ID returned from server.",
              },
            ],
          };
        }

        // Step 2: Upload job description
        await screenerClient.post(
          `/employer/assessment/job-details/${employerId}`,
          {
            assessmentId,
            jdTextHtml: jobDescription,
            status: "JD_UPDATED",
          },
        );

        // Step 3: Save job details
        const skillsArray = skills
          ? skills
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
              .map((s: string) => ({ name: s, value: s, favorite: false }))
          : [];

        await screenerClient.patch(
          `/employer/assessment/job-details/${employerId}`,
          {
            assessmentId,
            jobTitle,
            seniorityLevel: seniorityLevel ?? "Fresher",
            workPlaceType: workPlaceType ?? "On-Site",
            employmentType: employmentType ?? "Full-Time",
            yearOfExperienceFrom: yearOfExperienceFrom ?? 0,
            yearOfExperienceTo: yearOfExperienceTo ?? 5,
            assessmentConstraint: "NO_EXPIRY",
            skills: skillsArray,
            jobDescription,
            jobLocationCountry: jobLocationCountry ?? "India",
            jobLocationCity: jobLocationCity ?? "Chennai",
            status: "JOB_DETAILS_UPDATED",
          },
        );

        const nextSteps = `Next steps:\n1. Add ≥3 questions:   add_phone_question  (assessmentId: ${assessmentId})\n   — or generate them: generate_phone_questions\n2. Configure:          configure_assessment\n3. Publish:            publish_assessment`;

        return {
          content: [
            {
              type: "text" as const,
              text: `Assessment created successfully.\n\nID: ${assessmentId}\nTitle: ${jobTitle}\nType: AI Phone Screener\nSkills: ${skillsArray.map((s: any) => s.name).join(", ") || "None"}\n\n${nextSteps}`,
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

  // ── generate_phone_questions ──────────────────────────────────────────────────
  authedTool(
    server,
    "generate_phone_questions",
    `Generates AI-suggested phone screening questions based on the job description.

Returns suggested questions of the requested types. Use add_phone_question to add them to the assessment.`,
    {
      assessmentId: z.string().describe("Assessment UUID"),
      types: z
        .array(z.enum(["YES_NO", "RATING", "NUMERIC"]))
        .optional()
        .describe(
          "Question types to generate. Default: all three types [YES_NO, RATING, NUMERIC]",
        ),
    },
    async ({ assessmentId, types }) => {
      try {
        const res = await phoneClient.post(
          `/employer/questions/generate/${assessmentId}`,
          {
            type: types ?? ["YES_NO", "RATING", "NUMERIC"],
            questions: [],
          },
        );

        const questions: any[] =
          res.data?.data?.questionsData?.questions ?? res.data?.data ?? [];

        if (!questions.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No questions generated. Ensure the assessment has a job description and skills set.",
              },
            ],
          };
        }

        const lines = questions.map((q: any, i: number) => {
          let detail = `Type: ${q.type ?? "N/A"} | Priority: ${q.priority ?? "N/A"}`;
          if (q.type === "YES_NO") detail += ` | Expected: ${q.yesOrNo ?? "N/A"}`;
          if (q.type === "RATING") detail += ` | Min rating: ${q.primaryValue ?? "N/A"}`;
          if (q.type === "NUMERIC")
            detail += ` | Condition: ${q.operator ?? "N/A"} ${q.primaryValue ?? ""}${q.SecondaryValue != null ? `–${q.SecondaryValue}` : ""} ${q.metric ?? ""}`;
          return `${i + 1}. ${q.question}\n   ${detail}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `${questions.length} AI-generated question(s) for ${assessmentId}:\n\n${lines.join("\n\n")}\n\nUse add_phone_question to add any of these to the assessment.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${extractPhoneError(err)}` },
          ],
        };
      }
    },
  );

  // ── list_phone_questions ──────────────────────────────────────────────────────
  authedTool(
    server,
    "list_phone_questions",
    "Lists all questions for a phone screener assessment. Returns question IDs needed for edit_phone_question and delete_phone_question.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        const res = await phoneClient.get(
          `/employer/questions/${assessmentId}`,
        );

        const questions: any[] =
          res.data?.data?.questions ?? res.data?.data ?? res.data ?? [];

        if (!questions.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No questions found for assessment ${assessmentId}.`,
              },
            ],
          };
        }

        const lines = questions.map((q: any, i: number) => {
          let detail = `Type: ${q.type ?? "N/A"} | Priority: ${q.priority ?? "N/A"}`;
          if (q.type === "YES_NO") detail += ` | Expected: ${q.yesOrNo ?? "N/A"}`;
          if (q.type === "RATING") detail += ` | Min rating: ${q.primaryValue ?? "N/A"}`;
          if (q.type === "NUMERIC")
            detail += ` | ${q.operator ?? ""} ${q.primaryValue ?? ""}${q.SecondaryValue != null ? `–${q.SecondaryValue}` : ""} ${q.metric ?? ""}`;
          return `${i + 1}. [ID: ${q.id}] ${q.question}\n   ${detail}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `${questions.length} question(s) for assessment ${assessmentId}:\n\n${lines.join("\n\n")}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${extractPhoneError(err)}` },
          ],
        };
      }
    },
  );

  // ── add_phone_question ────────────────────────────────────────────────────────
  authedTool(
    server,
    "add_phone_question",
    `Adds a question to a phone screener assessment. At least 3 questions are required before publishing.

Question types and their required fields:
- YES_NO  → yesOrNo: "YES" | "NO" | "MAYBE"  (expected answer)
- RATING  → primaryValue: 1–5  (minimum acceptable rating)
- NUMERIC → operator + metric + primaryValue (+ secondaryValue if operator is BETWEEN)

Priority: MUST_HAVE (disqualifying) | NICE_TO_HAVE | OPTIONAL`,
    {
      assessmentId: z
        .string()
        .describe("Assessment UUID (assessmentRefId)"),
      question: z.string().describe("The question text"),
      type: z
        .enum(["YES_NO", "RATING", "NUMERIC"])
        .describe("Question response type"),
      priority: z
        .enum(["MUST_HAVE", "NICE_TO_HAVE", "OPTIONAL"])
        .optional()
        .describe("Default: NICE_TO_HAVE"),
      // YES_NO fields
      yesOrNo: z
        .enum(["YES", "NO", "MAYBE"])
        .optional()
        .describe("Expected answer — required when type is YES_NO"),
      // RATING / NUMERIC fields
      primaryValue: z
        .number()
        .optional()
        .describe(
          "For RATING: minimum acceptable rating (1–5). For NUMERIC: comparison value",
        ),
      secondaryValue: z
        .number()
        .optional()
        .describe("For NUMERIC BETWEEN only: upper bound of the range"),
      operator: z
        .enum([
          "EQUAL",
          "GREATER_THAN",
          "LESSER_THAN",
          "BETWEEN",
          "LESSER_THAN_OR_EQUAL",
          "GREATER_THAN_OR_EQUAL",
        ])
        .optional()
        .describe("Numeric comparison operator — required when type is NUMERIC"),
      metric: z
        .enum([
          "COUNT",
          "HOURS",
          "DAYS",
          "MONTHS",
          "YEARS",
          "PERCENTAGE",
          "CURRENCY",
        ])
        .optional()
        .describe("Unit of measurement — required when type is NUMERIC"),
      currency: z
        .string()
        .optional()
        .describe("Currency code (e.g. USD) — required when metric is CURRENCY"),
    },
    async ({
      assessmentId,
      question,
      type,
      priority,
      yesOrNo,
      primaryValue,
      secondaryValue,
      operator,
      metric,
      currency,
    }) => {
      try {
        const payload: any = {
          assessmentRefId: assessmentId,
          question,
          type,
          priority: priority ?? "NICE_TO_HAVE",
        };

        if (type === "YES_NO" && yesOrNo) payload.yesOrNo = yesOrNo;
        if (primaryValue != null) payload.primaryValue = primaryValue;
        if (secondaryValue != null) payload.SecondaryValue = secondaryValue;
        if (operator) payload.operator = operator;
        if (metric) payload.metric = metric;
        if (currency) payload.currency = currency;

        const res = await phoneClient.post(`/employer/questions`, payload);
        const questionId = res.data?.data?.id ?? res.data?.id;

        return {
          content: [
            {
              type: "text" as const,
              text: `Question added.${questionId ? `\nQuestion ID: ${questionId}` : ""}\nAssessment: ${assessmentId}\nQuestion: "${question}"\nType: ${type} | Priority: ${priority ?? "NICE_TO_HAVE"}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${extractPhoneError(err)}` },
          ],
        };
      }
    },
  );

  // ── edit_phone_question ───────────────────────────────────────────────────────
  authedTool(
    server,
    "edit_phone_question",
    "Edits an existing phone screener question. Use list_phone_questions to get question IDs.",
    {
      questionId: z.number().describe("Question ID from list_phone_questions"),
      question: z.string().optional().describe("Updated question text"),
      type: z.enum(["YES_NO", "RATING", "NUMERIC"]).optional(),
      priority: z
        .enum(["MUST_HAVE", "NICE_TO_HAVE", "OPTIONAL"])
        .optional(),
      yesOrNo: z.enum(["YES", "NO", "MAYBE"]).optional(),
      primaryValue: z.number().optional(),
      secondaryValue: z.number().optional(),
      operator: z
        .enum([
          "EQUAL",
          "GREATER_THAN",
          "LESSER_THAN",
          "BETWEEN",
          "LESSER_THAN_OR_EQUAL",
          "GREATER_THAN_OR_EQUAL",
        ])
        .optional(),
      metric: z
        .enum([
          "COUNT",
          "HOURS",
          "DAYS",
          "MONTHS",
          "YEARS",
          "PERCENTAGE",
          "CURRENCY",
        ])
        .optional(),
      currency: z.string().optional(),
    },
    async ({
      questionId,
      question,
      type,
      priority,
      yesOrNo,
      primaryValue,
      secondaryValue,
      operator,
      metric,
      currency,
    }) => {
      try {
        const payload: any = { id: questionId };
        if (question) payload.question = question;
        if (type) payload.type = type;
        if (priority) payload.priority = priority;
        if (yesOrNo) payload.yesOrNo = yesOrNo;
        if (primaryValue != null) payload.primaryValue = primaryValue;
        if (secondaryValue != null) payload.SecondaryValue = secondaryValue;
        if (operator) payload.operator = operator;
        if (metric) payload.metric = metric;
        if (currency) payload.currency = currency;

        await phoneClient.patch(`/employer/questions/${questionId}`, payload);

        return {
          content: [
            {
              type: "text" as const,
              text: `Question ${questionId} updated successfully.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${extractPhoneError(err)}` },
          ],
        };
      }
    },
  );

  // ── delete_phone_question ─────────────────────────────────────────────────────
  authedTool(
    server,
    "delete_phone_question",
    "Deletes a question from a phone screener assessment. Use list_phone_questions to get question IDs.",
    {
      questionId: z.number().describe("Question ID from list_phone_questions"),
    },
    async ({ questionId }) => {
      try {
        await phoneClient.delete(`/employer/questions/${questionId}`, {
          data: { id: questionId },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Question ${questionId} deleted.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${extractPhoneError(err)}` },
          ],
        };
      }
    },
  );
}
