import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  screenerClient,
  extractError,
  getEmployerIdFromAPI,
} from "../../api/screener.client";
import { phoneClient, extractPhoneError } from "../../api/phone.client";
import { authedTool } from "../../server";

export function registerResumeBuildTools(server: McpServer) {
  // ── create_resume_assessment ──────────────────────────────────────────────────
  authedTool(
    server,
    "create_resume_assessment",
    `Creates a new AI Resume Screener assessment in three steps: type selection → JD upload → job details.

After creation, set screening criteria via get_criteria_suggestions + set_screening_criteria,
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
      jobLocationCountry,
      jobLocationCity,
    }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        // Step 1: Create assessment record (no aiVoice for resume screener)
        const interviewRes = await screenerClient.post(
          `/employer/assessment/job-interview/${employerId}`,
          {
            interviewType: "resume",
            language: language ?? "en",
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

        const nextSteps = `Next steps:\n1. Get suggestions:     get_criteria_suggestions (assessmentId: ${assessmentId})\n2. Set criteria:        set_screening_criteria\n3. Configure:           configure_assessment\n4. Publish:             publish_assessment`;

        return {
          content: [
            {
              type: "text" as const,
              text: `Assessment created successfully.\n\nID: ${assessmentId}\nTitle: ${jobTitle}\nType: AI Resume Screener\nSkills: ${skillsArray.map((s: any) => s.name).join(", ") || "None"}\n\n${nextSteps}`,
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

  // ── get_criteria_suggestions ──────────────────────────────────────────────────
  authedTool(
    server,
    "get_criteria_suggestions",
    `Fetches AI-suggested screening criteria for a resume screener assessment based on its job description and skills.

Returns a list of suggested criteria (keywords, skills, experience markers) with IDs.
Pass the returned criteria to set_screening_criteria to save them.`,
    {
      assessmentId: z.string().describe("Assessment UUID"),
    },
    async ({ assessmentId }) => {
      try {
        const res = await phoneClient.get(
          `/details/employer/criteria/suggestions/${assessmentId}`,
        );

        const data = res.data?.data ?? res.data;
        const suggestions: any[] = Array.isArray(data) ? data : [];

        if (!suggestions.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No criteria suggestions returned. Ensure the assessment has a job description and skills.",
              },
            ],
          };
        }

        const lines = suggestions.map(
          (c: any, i: number) =>
            `${i + 1}. [ID: ${c.id}] "${c.keyword}"  mustHave: ${c.mustHave ?? false}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${suggestions.length} suggested criteria for assessment ${assessmentId}:\n\n${lines.join("\n")}\n\nUse set_screening_criteria with these IDs to save your selection.`,
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

  // ── set_screening_criteria ────────────────────────────────────────────────────
  authedTool(
    server,
    "set_screening_criteria",
    `Sets the screening criteria for a resume screener assessment.

Each criterion has:
- id: from get_criteria_suggestions
- keyword: the keyword/skill to screen for
- mustHave: true = disqualifying if absent; false = nice-to-have
- fitScore: true = include in fit score calculation

At least 3 criteria must have mustHave: true.`,
    {
      assessmentId: z.string().describe("Assessment UUID"),
      criteria: z
        .array(
          z.object({
            id: z.number().describe("Criterion ID from get_criteria_suggestions"),
            keyword: z.string().describe("Keyword or skill to screen for"),
            mustHave: z
              .boolean()
              .describe("true = disqualifying if absent. At least 3 required"),
            fitScore: z
              .boolean()
              .optional()
              .describe("Include in fit score calculation. Default: false"),
          }),
        )
        .min(1)
        .describe("List of criteria to set"),
      isFirstSave: z
        .boolean()
        .optional()
        .describe(
          "Set true on initial save to advance status to CRITERIA_DETAILS_UPDATED. Default: true",
        ),
    },
    async ({ assessmentId, criteria, isFirstSave }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        const payload: any = {
          assessmentId,
          criteria: criteria.map((c: any) => ({
            id: c.id,
            keyword: c.keyword,
            mustHave: c.mustHave,
            fitScore: c.fitScore ?? false,
          })),
        };

        if (isFirstSave !== false) {
          payload.status = "CRITERIA_DETAILS_UPDATED";
        }

        await screenerClient.patch(
          `/employer/assessment/update-criteria/${employerId}`,
          payload,
        );

        const mustHaveCount = criteria.filter((c: any) => c.mustHave).length;

        return {
          content: [
            {
              type: "text" as const,
              text: `Screening criteria saved for assessment ${assessmentId}.\n${criteria.length} criteria set (${mustHaveCount} must-have).\n\nNext: configure_assessment → publish_assessment`,
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
