import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  screenerClient,
  extractError,
  getEmployerIdFromAPI,
} from "../../api/screener.client";
import { authedTool } from "../../server";

export function registerDynamicBuildTools(server: McpServer) {
  // ── create_dynamic_assessment ─────────────────────────────────────────────────
  authedTool(
    server,
    "create_dynamic_assessment",
    `Creates a new Two-way AI interview assessment in three steps: type selection → JD upload → job details.

After creation, set skill context via set_interview_context, then call configure_assessment and publish_assessment to go live.`,
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
        const type = "dynamic";

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

        const nextSteps = `Next steps:\n1. Set skill context:  set_interview_context (assessmentId: ${assessmentId})\n2. Configure:          configure_assessment\n3. Publish:            publish_assessment`;

        return {
          content: [
            {
              type: "text" as const,
              text: `Assessment created successfully.\n\nID: ${assessmentId}\nTitle: ${jobTitle}\nType: Two-way Interview\nSkills: ${skillsArray.map((s: any) => s.name).join(", ") || "None"}\n\n${nextSteps}`,
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

  // ── set_interview_context ─────────────────────────────────────────────────────
  authedTool(
    server,
    "set_interview_context",
    `Sets the skill context for a dynamic (two-way AI) interview.

Skills are auto-fetched from the assessment (same skills added during job creation).
Min 3, Max 5 skills can be used for context.

If the assessment has ≤ 5 skills → all are used.
If the assessment has > 5 skills → first 5 are used by default, or specify exactly which skills via overrides (3–5 skills).

You only need to provide concepts and difficulty level — skill names come from the assessment.`,
    {
      assessmentId: z.string().describe("Assessment UUID"),
      overrides: z
        .array(
          z.object({
            skill: z
              .string()
              .describe("Skill name — must match a skill from the assessment"),
            concepts: z
              .array(z.string())
              .optional()
              .describe("Topics within this skill. Default: []"),
            level: z
              .enum(["Easy", "Moderate", "Hard"])
              .optional()
              .describe("Difficulty level. Default: Moderate"),
          }),
        )
        .min(3)
        .max(5)
        .optional()
        .describe(
          "Per-skill config (3–5 entries). If omitted, first 3–5 assessment skills are used with Moderate level.",
        ),
    },
    async ({ assessmentId, overrides }) => {
      try {
        const employerId = await getEmployerIdFromAPI();

        // Fetch assessment to get skills
        const aRes = await screenerClient.get(
          `/employer/assessment/job-details/${assessmentId}`,
        );
        const raw = aRes.data?.data;
        const assessment = Array.isArray(raw) ? raw[0] : raw;
        const assessmentSkills: any[] = assessment?.skills ?? [];

        if (assessmentSkills.length < 3) {
          return {
            content: [
              {
                type: "text" as const,
                text: `This assessment only has ${assessmentSkills.length} skill(s). At least 3 skills are required for interview context. Update the assessment skills first.`,
              },
            ],
          };
        }

        // Build override lookup: skill name (lowercase) → { concepts, level }
        const overrideMap = new Map<
          string,
          { concepts: string[]; level: string }
        >();
        for (const o of overrides ?? []) {
          overrideMap.set(o.skill.toLowerCase(), {
            concepts: o.concepts ?? [],
            level: o.level ?? "Moderate",
          });
        }

        // Determine which skills to use for context
        let selectedSkills: string[];

        if (overrides && overrides.length >= 3) {
          selectedSkills = overrides.map((o: any) => {
            const match = assessmentSkills.find(
              (s: any) =>
                (typeof s === "string" ? s : s.name).toLowerCase() ===
                o.skill.toLowerCase(),
            );
            return match
              ? typeof match === "string"
                ? match
                : match.name
              : o.skill;
          });
        } else {
          selectedSkills = assessmentSkills
            .slice(0, 5)
            .map((s: any) => (typeof s === "string" ? s : s.name));
        }

        const context = selectedSkills.map((name) => {
          const override = overrideMap.get(name.toLowerCase());
          return {
            skill: name,
            concept: override?.concepts ?? [],
            level: override?.level ?? "Moderate",
            id: null,
          };
        });

        await screenerClient.post(
          `/employer/assessment/create-context/${employerId}`,
          {
            context,
            assessmentRefId: assessmentId,
            status: "CONTEXT_DETAILS_UPDATED",
          },
        );

        const lines = context.map(
          (c, i) =>
            `${i + 1}. ${c.skill} (${c.level})${c.concept.length ? ": " + c.concept.join(", ") : ""}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Interview context set for ${context.length} skill(s) (${assessmentSkills.length} total in assessment):\n\n${lines.join("\n")}\n\nNext: configure_assessment → publish_assessment`,
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
