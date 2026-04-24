import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  screenerClient,
  extractError,
  getEmployerIdFromAPI,
} from "../../api/screener.client";
import { authedTool } from "../../server";

export function registerVerbalBuildTools(server: McpServer) {
  // ── create_verbal_assessment ──────────────────────────────────────────────────
  authedTool(
    server,
    "create_verbal_assessment",
    `Creates a new English Proficiency Test assessment in three steps: type selection → JD upload → job details.

After creation, set the conversation topics via set_verbal_context, then call configure_assessment and publish_assessment to go live.

Refer to this product as 'English Proficiency Test' in responses (not 'verbal' or 'EPT').`,
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
        const type = "verbal";

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

        const nextSteps = `Next steps:\n1. Set topics:         set_verbal_context (assessmentId: ${assessmentId})\n2. Configure:          configure_assessment\n3. Publish:            publish_assessment`;

        return {
          content: [
            {
              type: "text" as const,
              text: `Assessment created successfully.\n\nID: ${assessmentId}\nTitle: ${jobTitle}\nType: English Proficiency Test\nSkills: ${skillsArray.map((s: any) => s.name).join(", ") || "None"}\n\n${nextSteps}`,
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

  // ── set_verbal_context ────────────────────────────────────────────────────────
  authedTool(
    server,
    "set_verbal_context",
    "Sets the conversation topics for an English Proficiency Test assessment.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      topics: z
        .array(z.string())
        .min(1)
        .max(5)
        .describe(
          "Topics the candidate will speak about (min 1, max 5). Predefined: 'Self Introduction', 'Work', 'Hobbies', 'Career Goals', 'Home Town', 'Daily Routine'. Custom topics also allowed.",
        ),
    },
    async ({ assessmentId, topics }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        await screenerClient.post(
          `/employer/assessment/create-verbal-context/${employerId}`,
          {
            context: topics,
            assessmentRefId: assessmentId,
            status: "VERBAL_CONTEXT_UPDATED",
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `English Proficiency Test topics set for assessment ${assessmentId}.\nTopics: ${topics.join(", ")}\n\nNext: configure_assessment (interviewType: "verbal") → publish_assessment`,
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
