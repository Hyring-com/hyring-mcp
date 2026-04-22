import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  screenerClient,
  extractError,
  getEmployerIdFromAPI,
} from "../../api/screener.client";
import { authedTool } from "../../server";

export function registerCodingBuildTools(server: McpServer) {
  // ── create_coding_assessment ──────────────────────────────────────────────────
  authedTool(
    server,
    "create_coding_assessment",
    `Creates a new Coding interview assessment in three steps: type selection → JD upload → job details.

After creation, set the language via set_coding_language, add problems via add_coding_question, then call configure_assessment and publish_assessment to go live.`,
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
        const type = "coding";

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

        const nextSteps = `Next steps:\n1. Set language:       set_coding_language (assessmentId: ${assessmentId})\n2. Add problems:       add_coding_question\n3. Configure:          configure_assessment\n4. Publish:            publish_assessment`;

        return {
          content: [
            {
              type: "text" as const,
              text: `Assessment created successfully.\n\nID: ${assessmentId}\nTitle: ${jobTitle}\nType: Coding Interview\nSkills: ${skillsArray.map((s: any) => s.name).join(", ") || "None"}\n\n${nextSteps}`,
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

  // ── set_coding_language ───────────────────────────────────────────────────────
  authedTool(
    server,
    "set_coding_language",
    "Sets the programming language for a coding interview assessment.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      language: z
        .enum([
          "c",
          "clojure",
          "cpp",
          "csharp",
          "fsharp",
          "go",
          "java",
          "javascript",
          "kotlin",
          "lua",
          "objective-c",
          "pascal",
          "perl",
          "php",
          "python",
          "r",
          "ruby",
          "rust",
          "sql",
          "swift",
          "typescript",
        ])
        .describe("Programming language for the coding test"),
    },
    async ({ assessmentId, language }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        await screenerClient.patch(
          `/employer/assessment/coding-language/${employerId}`,
          {
            language,
            assessmentId,
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Coding language set to "${language}" for assessment ${assessmentId}.\nNext: add_coding_question`,
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

  // ── add_coding_question ───────────────────────────────────────────────────────
  authedTool(
    server,
    "add_coding_question",
    `Adds a coding problem to a coding interview assessment.

Two modes:
- "CustomCode"       = Manual question with custom code template (uses add-coding-questions endpoint)
- "AI_GeneratedCode" = AI generates the question from a concept/prompt (uses generate-coding-questions endpoint)

Exercise types (questionType):
- "debugging"        = Debugging — fix broken code
- "complete_code"    = Full Coding — write from scratch
- "code_completion"  = Code Completion — fill in partial code

Duration options: 5, 10, or 15 minutes (stored as minutes directly).`,
    {
      assessmentId: z.string().describe("Assessment UUID"),
      codingType: z
        .enum(["CustomCode", "AI_GeneratedCode"])
        .describe(
          "CustomCode = manual, AI_GeneratedCode = AI generates from concept",
        ),
      questionType: z
        .enum(["debugging", "complete_code", "code_completion"])
        .describe("Exercise type"),
      duration: z
        .union([z.literal(5), z.literal(10), z.literal(15)])
        .describe("Time limit in minutes: 5, 10, or 15"),
      language: z
        .enum([
          "c",
          "clojure",
          "cpp",
          "csharp",
          "fsharp",
          "go",
          "java",
          "javascript",
          "kotlin",
          "lua",
          "objective-c",
          "pascal",
          "perl",
          "php",
          "python",
          "r",
          "ruby",
          "rust",
          "sql",
          "swift",
          "typescript",
        ])
        .describe("Programming language"),
      // CustomCode fields
      question: z
        .string()
        .optional()
        .describe("Problem description — required for CustomCode"),
      code: z
        .string()
        .optional()
        .describe("Starter code template — required for CustomCode"),
      // AI_GeneratedCode fields
      concept: z
        .string()
        .optional()
        .describe(
          "Concept or prompt for AI to generate the question — required for AI_GeneratedCode",
        ),
    },
    async ({
      assessmentId,
      codingType,
      questionType,
      duration,
      language,
      question,
      code,
      concept,
    }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        if (codingType === "AI_GeneratedCode") {
          if (!concept) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "concept is required for AI_GeneratedCode.",
                },
              ],
            };
          }
          await screenerClient.post(
            `/employer/assessment/generate-coding-questions/${employerId}`,
            {
              assessmentRefId: assessmentId,
              concept,
              questionType,
              duration, // stored in minutes directly
              codingType: "AI_GeneratedCode",
              language,
            },
          );

          return {
            content: [
              {
                type: "text" as const,
                text: `AI coding question generated for assessment ${assessmentId}.\nConcept: "${concept}"\nExercise: ${questionType} | Duration: ${duration} min | Language: ${language}`,
              },
            ],
          };
        } else {
          if (!question) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "question is required for CustomCode.",
                },
              ],
            };
          }
          await screenerClient.post(
            `/employer/assessment/add-coding-questions/${employerId}`,
            {
              assessmentRefId: assessmentId,
              question,
              code: code ?? "",
              questionType,
              duration, // stored in minutes directly
              codingType: "CustomCode",
              language,
            },
          );

          return {
            content: [
              {
                type: "text" as const,
                text: `Custom coding question added to assessment ${assessmentId}.\nQuestion: "${question.slice(0, 80)}${question.length > 80 ? "..." : ""}"\nExercise: ${questionType} | Duration: ${duration} min | Language: ${language}`,
              },
            ],
          };
        }
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
