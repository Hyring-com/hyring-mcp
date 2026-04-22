import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { vipClient, extractVipError } from "../../api/vip.client";
import { authedTool } from "../../server";
import { getEmployerIdFromToken } from "../../auth/credentials";

export function registerVipBuildTools(server: McpServer) {
  // ── create_vip_assessment ─────────────────────────────────────────────────────
  authedTool(
    server,
    "create_vip_assessment",
    `Creates a new VIP Live Interview job role in two steps: JD upload → job details.

Unlike other assessment types, VIP assessments are published immediately when job details are saved.
No separate configure or publish step is needed.

After creation, use invite_candidate to send interview invitations to candidates.`,
    {
      jobTitle: z.string().describe("Job title, e.g. 'Software Developer'"),
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
        .describe("Comma-separated skills, e.g. 'Java, Spring, SQL'"),
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
      currency: z
        .enum(["INR", "USD", "EUR", "AUD", "GBP", "AED"])
        .optional()
        .describe("Salary currency. Default: USD"),
      annualSalaryRangeFrom: z
        .number()
        .optional()
        .describe("Annual salary range start (optional)"),
      annualSalaryRangeTo: z
        .number()
        .optional()
        .describe("Annual salary range end (optional)"),
      isSalaryHidden: z
        .boolean()
        .optional()
        .describe("Hide salary from candidates. Default: false"),
      salaryFrequency: z
        .enum(["Per hour", "Per month", "Per year"])
        .optional()
        .describe("Salary frequency — required if salary range is provided"),
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
      currency,
      annualSalaryRangeFrom,
      annualSalaryRangeTo,
      isSalaryHidden,
      salaryFrequency,
    }) => {
      try {
        const employerId = getEmployerIdFromToken();

        // Step 1: Upload JD — creates the assessment and returns assessmentId
        const jdRes = await vipClient.post(
          `/vip/interview/job-details/${employerId}`,
          {
            jdTextHtml: jobDescription,
            status: "JD_UPDATED",
          },
        );

        const assessmentId =
          jdRes.data?.data?.assessmentUuid ??
          jdRes.data?.data?.assessmentRefId ??
          jdRes.data?.data ??
          jdRes.data?.assessmentUuid;

        if (!assessmentId) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Failed to create VIP assessment: no ID returned from server.",
              },
            ],
          };
        }

        // Step 2: Save job details — publishes the assessment immediately
        const skillsArray = skills
          ? skills
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
              .map((s: string) => ({ name: s, value: s, favorite: false }))
          : [];

        const detailsPayload: any = {
          assessmentId,
          jobTitle,
          seniorityLevel: seniorityLevel ?? "Fresher",
          workPlaceType: workPlaceType ?? "On-Site",
          employmentType: employmentType ?? "Full-Time",
          yearOfExperienceFrom: yearOfExperienceFrom ?? 0,
          yearOfExperienceTo: yearOfExperienceTo ?? 5,
          skills: skillsArray,
          jobDescription,
          jobLocationCountry: jobLocationCountry ?? "India",
          jobLocationCity: jobLocationCity ?? "Chennai",
          language: language ?? "en",
          currency: currency ?? "USD",
          isSalaryHidden: isSalaryHidden ?? false,
          compensation: [],
          status: "PUBLISHED",
        };

        if (annualSalaryRangeFrom != null)
          detailsPayload.annualSalaryRangeFrom = String(annualSalaryRangeFrom);
        if (annualSalaryRangeTo != null)
          detailsPayload.annualSalaryRangeTo = String(annualSalaryRangeTo);
        if (salaryFrequency) detailsPayload.salaryFrequency = salaryFrequency;

        await vipClient.patch(
          `/vip/interview/job-details/${employerId}`,
          detailsPayload,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `VIP Live Interview role created and published.\n\nID: ${assessmentId}\nTitle: ${jobTitle}\nType: VIP Live Interview\nSkills: ${skillsArray.map((s: any) => s.name).join(", ") || "None"}\n\nThe role is now live. Use invite_candidate to send interview invitations.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${extractVipError(err)}` },
          ],
        };
      }
    },
  );
}
