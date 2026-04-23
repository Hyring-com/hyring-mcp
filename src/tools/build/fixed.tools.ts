import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  screenerClient,
  extractError,
  getEmployerIdFromAPI,
} from "../../api/screener.client";
import { authedTool } from "../../server";

export function registerFixedBuildTools(server: McpServer) {
  // ── create_fixed_assessment ───────────────────────────────────────────────────
  authedTool(
    server,
    "create_fixed_assessment",
    `Creates a new One-Way (Fixed) interview assessment in three steps: type selection → JD upload → job details.

After creation, add ≥3 questions via add_question, then call configure_assessment and publish_assessment to go live.`,
    {
      jobTitle: z.string().describe("Job title, e.g. 'Senior React Developer'"),
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
      avatarType: z
        .enum(["noAvatar", "digitalAvatar"])
        .optional()
        .describe("Default: noAvatar"),
      aiVoice: z
        .enum(["nova", "echo", "shimmer", "alloy", "onyx", "fable"])
        .optional()
        .describe("AI voice. Default: nova"),
      jobLocationCountry: z
        .string()
        .optional()
        .describe(
          "Country where the job is located, e.g. 'India'. Default: India",
        ),
      jobLocationCity: z
        .string()
        .optional()
        .describe(
          "City where the job is located, e.g. 'Chennai'. Default: Chennai",
        ),
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
      avatarType,
      aiVoice,
      jobLocationCountry,
      jobLocationCity,
    }) => {
      try {
        const employerId = await getEmployerIdFromAPI();
        const type = "fixed";

        // Step 1: Create assessment record (type, language, avatar)
        const interviewRes = await screenerClient.post(
          `/employer/assessment/job-interview/${employerId}`,
          {
            interviewType: type,
            language: language ?? "en",
            avatarType: avatarType ?? "noAvatar",
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

        // Step 2: Upload job description (POST, status: JD_UPDATED)
        await screenerClient.post(
          `/employer/assessment/job-details/${employerId}`,
          {
            assessmentId,
            jdTextHtml: jobDescription,
            status: "JD_UPDATED",
          },
        );

        // Step 3: Save job details (PATCH — not POST, status: JOB_DETAILS_UPDATED)
        // Skills must be sent as [{ name, value, favorite: false }] objects, not plain strings
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

        const nextSteps = `Next steps:\n1. Add ≥3 questions:   add_question (assessmentId: ${assessmentId})\n2. Configure:          configure_assessment\n3. Publish:            publish_assessment`;

        return {
          content: [
            {
              type: "text" as const,
              text: `Assessment created successfully.\n\nID: ${assessmentId}\nTitle: ${jobTitle}\nType: One-way Interview\nSkills: ${skillsArray.map((s: any) => s.name).join(", ") || "None"}\n\n${nextSteps}`,
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

  // ── list_questions ────────────────────────────────────────────────────────────
  authedTool(
    server,
    "list_questions",
    "Lists all questions for a specific assessment. Returns question IDs needed for edit_question and delete_question.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        const employerId = await getEmployerIdFromAPI();
        const res = await screenerClient.get(
          `/employer/assessment/questions/${employerId}`,
          {
            params: { assessmentRefId: assessmentId },
          },
        );
        const questions: any[] = res.data?.data ?? res.data ?? [];

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

        const lines = questions.map(
          (q: any, i: number) =>
            `${i + 1}. [ID: ${q.id}] ${q.question}\n   Type: ${q.questionType} | Answer: ${q.answerType} | Difficulty: ${q.difficultyLevel} | Time: ${q.timeToAnswer ?? "N/A"}s`,
        );

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
            { type: "text" as const, text: `Error: ${extractError(err)}` },
          ],
        };
      }
    },
  );

  // ── add_question ──────────────────────────────────────────────────────────────
  authedTool(
    server,
    "add_question",
    `Adds a question to a fixed (one-way) interview assessment. At least 3 questions are required before publishing.

Question types: General, Technical
Difficulty:     Easy, Moderate, Hard
Answer types:   Video, Mcq, Text
Time (seconds): 30, 60, 90, 120`,
    {
      assessmentId: z.string().describe("Assessment UUID"),
      question: z.string().describe("The question text"),
      questionType: z
        .enum(["General", "Technical"])
        .optional()
        .describe("Default: General"),
      difficultyLevel: z
        .enum(["Easy", "Moderate", "Hard"])
        .optional()
        .describe("Default: Moderate"),
      answerType: z
        .enum(["Video", "Mcq", "Text"])
        .optional()
        .describe("How the candidate answers. Default: Video"),
      timeToAnswer: z
        .number()
        .optional()
        .describe("Time limit in seconds. Default: 30"),
      mcqOptions: z
        .array(
          z.object({
            option: z.string(),
            isCorrect: z.boolean(),
          }),
        )
        .optional()
        .describe("MCQ options — required when answerType is Mcq"),
    },
    async ({
      assessmentId,
      question,
      questionType,
      difficultyLevel,
      answerType,
      timeToAnswer,
      mcqOptions,
    }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        const payload: any = {
          assessmentRefId: assessmentId,
          question,
          questionType: questionType ?? "General",
          answerType: answerType ?? "Video",
          difficultyLevel: difficultyLevel ?? "Moderate",
          scoreApplicable: true,
          timeToAnswer: timeToAnswer ?? 30,
          questionDelivery: "DEFAULT",
        };

        if (answerType === "Mcq" && mcqOptions?.length) {
          payload.options = JSON.stringify(mcqOptions);
        }

        const res = await screenerClient.post(
          `/employer/assessment/add-question/${employerId}`,
          payload,
        );
        const questionId = res.data?.data?.id ?? res.data?.id;

        return {
          content: [
            {
              type: "text" as const,
              text: `Question added.\n${questionId ? `Question ID: ${questionId}\n` : ""}Assessment: ${assessmentId}\nQuestion: "${question}"\nType: ${questionType ?? "General"} | Difficulty: ${difficultyLevel ?? "Moderate"} | Answer: ${answerType ?? "Video"} | Time: ${timeToAnswer ?? 30}s`,
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

  // ── edit_question ─────────────────────────────────────────────────────────────
  authedTool(
    server,
    "edit_question",
    "Edits an existing question. Use list_questions to get question IDs.",
    {
      questionId: z.number().describe("Question ID from list_questions"),
      assessmentId: z.string().describe("Assessment UUID"),
      question: z.string().optional().describe("Updated question text"),
      questionType: z.enum(["General", "Technical"]).optional(),
      difficultyLevel: z.enum(["Easy", "Moderate", "Hard"]).optional(),
      answerType: z.enum(["Video", "Mcq", "Text"]).optional(),
      timeToAnswer: z.number().optional(),
    },
    async ({
      questionId,
      assessmentId,
      question,
      questionType,
      difficultyLevel,
      answerType,
      timeToAnswer,
    }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        const payload: any = { id: questionId, assessmentRefId: assessmentId };
        if (question) payload.question = question;
        if (questionType) payload.questionType = questionType;
        if (difficultyLevel) payload.difficultyLevel = difficultyLevel;
        if (answerType) payload.answerType = answerType;
        if (timeToAnswer) payload.timeToAnswer = timeToAnswer;

        await screenerClient.patch(
          `/employer/assessment/edit-question/${employerId}`,
          payload,
        );

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
            { type: "text" as const, text: `Error: ${extractError(err)}` },
          ],
        };
      }
    },
  );

  // ── delete_question ───────────────────────────────────────────────────────────
  authedTool(
    server,
    "delete_question",
    "Deletes a question from an assessment. Use list_questions to get question IDs.",
    {
      questionId: z.number().describe("Question ID from list_questions"),
      assessmentId: z.string().describe("Assessment UUID"),
    },
    async ({ questionId, assessmentId }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        await screenerClient.delete(
          `/employer/assessment/delete-question/${employerId}`,
          {
            data: { id: questionId, assessmentRefId: assessmentId },
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Question ${questionId} deleted from assessment ${assessmentId}.`,
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

  // ── generate_ai_questions ─────────────────────────────────────────────────────
  authedTool(
    server,
    "generate_ai_questions",
    "Generates AI-suggested questions based on the job description and skills. Works on fixed interview assessments.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        const res = await screenerClient.post(
          `/employer/assessment/ai-questions/${employerId}`,
          {
            assessmentRefId: assessmentId,
          },
        );

        const questions: any[] = res.data?.data ?? res.data ?? [];

        if (!questions.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No AI questions generated. Ensure JD and skills are set first.",
              },
            ],
          };
        }

        const lines = questions.map(
          (q: any, i: number) =>
            `${i + 1}. [ID: ${q.id ?? "N/A"}] ${q.question}\n   Type: ${q.questionType ?? "N/A"} | Difficulty: ${q.difficultyLevel ?? "N/A"}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${questions.length} AI-generated question(s) for assessment ${assessmentId}:\n\n${lines.join("\n\n")}`,
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
}
