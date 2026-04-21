import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenerClient, requireAuth, extractError, getEmployerIdFromAPI } from "../api/screener.client";

export function registerAssessmentTools(server: McpServer) {

  // ── list_assessments ─────────────────────────────────────────────────────────
  // FIX: was using /employer/assessment/get-jds (lists JDs, not assessments)
  //      correct endpoint: /assessment/active|inactive|drafts|archived/:employerId
  server.tool(
    "list_assessments",
    "Lists all assessments for the authenticated employer. Returns assessment IDs needed for all other tools.",
    {
      status: z.enum(["active", "inactive", "drafts", "archived"]).optional()
        .describe("Filter by status. Default: active"),
      page: z.number().optional().describe("Page number (1-based). Default: 1"),
      take: z.number().optional().describe("Results per page. Default: 50"),
      search: z.string().optional().describe("Search by job title"),
    },
    async ({ status = "active", page = 1, take = 50, search }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        const endpointMap: Record<string, string> = {
          active:   `/assessment/active/${employerId}`,
          inactive: `/assessment/inactive/${employerId}`,
          drafts:   `/assessment/drafts/${employerId}`,
          archived: `/assessment/archived/${employerId}`,
        };

        // Backend: skip is page number (0-based), skip * take = offset
        const params: any = { skip: page - 1, take };
        if (search) params.search = search;

        const res = await screenerClient.get(endpointMap[status], { params });

        // Response shape: { data: [assessmentsArray, totalCount] }
        const raw = res.data?.data;
        const assessments: any[] = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : [];
        const totalCount: number  = Array.isArray(raw) && typeof raw[1] === "number" ? raw[1] : assessments.length;

        if (!assessments.length) {
          return { content: [{ type: "text" as const, text: `No ${status} assessments found.` }] };
        }

        const typeLabel: Record<string, string> = {
          fixed:   "One-way Interview",
          dynamic: "Two-way Interview",
          coding:  "Coding Interview",
          verbal:  "English Proficiency Test",
          phone:   "Phone Screener",
          resume:  "Resume Screener",
        };

        const lines = assessments.map((a: any, i: number) => {
          const type       = a.interviewType ? (typeLabel[a.interviewType] ?? a.interviewType) : "N/A";
          const candidates = a._count?.HyringScreenerStatus ?? "N/A";
          const questions  = a._count?.hyringScreenerQuestions ?? a._count?.HyringScreenerContext ?? "N/A";
          const id         = a.assessmentUuid ?? a.id;
          return `${(page - 1) * take + i + 1}. [ID: ${id}] ${a.jobTitle ?? "Untitled"} — Type: ${type} | Status: ${a.status ?? "N/A"} | Candidates: ${candidates} | Questions: ${questions}`;
        });

        const showing = `Showing ${assessments.length} of ${totalCount} ${status} assessment(s) (page ${page}):`;
        const hint    = totalCount > page * take ? `\n\nUse page: ${page + 1} to see more.` : "";

        return {
          content: [{
            type: "text" as const,
            text: `${showing}\n\n${lines.join("\n")}${hint}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_assessment ────────────────────────────────────────────────────────────
  server.tool(
    "get_assessment",
    "Returns full details of a specific assessment by its UUID.",
    { assessmentId: z.string().describe("Assessment UUID from list_assessments") },
    async ({ assessmentId }) => {
      try {
        requireAuth();
        const res = await screenerClient.get(`/employer/assessment/job-details/${assessmentId}`);
        // Response: { data: [assessmentObj, planStatus, teamEmails, slack, hrVideos, oauth] }
        const raw = res.data?.data;
        const a = Array.isArray(raw) ? raw[0] : (raw ?? null);

        if (!a) {
          return { content: [{ type: "text" as const, text: "Assessment not found." }] };
        }

        const skillNames = Array.isArray(a.skills)
          ? a.skills.map((s: any) => (typeof s === "string" ? s : s.name)).join(", ")
          : "N/A";

        const contexts: any[] = a.HyringScreenerContext ?? [];
        const contextLines = contexts.length
          ? contexts.map((c: any) => `  - ${c.skill} (${c.level})${c.concept?.length ? ": " + c.concept.join(", ") : ""}`).join("\n")
          : "  None";

        const text = [
          `ID: ${assessmentId}`,
          `Title: ${a.jobTitle ?? "N/A"}`,
          `Interview Type: ${a.interviewType ?? "N/A"}`,
          `Seniority: ${a.seniorityLevel ?? "N/A"}`,
          `Employment Type: ${a.employmentType ?? "N/A"}`,
          `Workplace: ${a.workPlaceType ?? "N/A"}`,
          `Experience: ${a.yearOfExperienceFrom ?? 0}–${a.yearOfExperienceTo ?? 0} years`,
          `Skills: ${skillNames}`,
          `Status: ${a.status ?? "N/A"}`,
          `Language: ${a.language ?? "N/A"}`,
          `Avatar Type: ${a.avatarType ?? "N/A"}`,
          `AI Voice: ${a.aiVoice ?? "N/A"}`,
          `Expiry: ${a.expiryDate ?? "No expiry"}`,
          `Schedule Assessment: ${a.scheduleAssessment ?? "N/A"}`,
          `Screen Share: ${a.enableScreenShare ?? "N/A"}`,
          `Candidate Video: ${a.candidateVideo ?? "N/A"}`,
          `Retake: ${a.retakeAssessment ?? "N/A"}`,
          `Interview Time: ${a.interviewTime ?? "N/A"}s`,
          `Candidates: ${a.HyringScreenerStatus?.length ?? 0}`,
          `Created: ${a.createdAt ?? "N/A"}`,
          `Interview Context:\n${contextLines}`,
          `Description:\n${a.jobDescription ?? "N/A"}`,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── create_assessment ─────────────────────────────────────────────────────────
  // FIX 1: Step 2 — status was "jd" → corrected to "JD_UPDATED"
  // FIX 2: Step 3 — was POST (wrong), now PATCH /employer/assessment/job-details/:id
  //                  assessmentConstraint was "Standard" → corrected to "NO_EXPIRY"
  //                  status was "details" → corrected to "JOB_DETAILS_UPDATED"
  server.tool(
    "create_assessment",
    `Creates a new interview assessment in three steps: type selection → JD upload → job details.

Interview types:
- "fixed"   = One-way Interview (fixed questions — add ≥3 questions via add_question)
- "dynamic" = Two-way AI Interview (set context via set_interview_context)
- "coding"  = Coding Interview (set language via set_coding_language, add problems via add_coding_question)
- "verbal"  = English Proficiency Test (set topics via set_verbal_context)

After creation, call configure_assessment then publish_assessment to go live.`,
    {
      jobTitle:             z.string().describe("Job title, e.g. 'Senior React Developer'"),
      jobDescription:       z.string().describe("Full job description text"),
      interviewType:        z.enum(["fixed", "dynamic", "coding", "verbal"]).optional().describe("Default: fixed"),
      seniorityLevel:       z.enum(["Fresher", "Junior", "Mid Level", "Senior", "CXO"]).optional().describe("Default: Fresher"),
      workPlaceType:        z.enum(["On-Site", "Hybrid", "Remote"]).optional().describe("Default: On-Site"),
      employmentType:       z.enum(["Full-Time", "Part-Time", "Contract", "Temporary", "Volunteer", "Internship"]).optional().describe("Default: Full-Time"),
      yearOfExperienceFrom: z.number().optional().describe("Min years of experience. Default: 0"),
      yearOfExperienceTo:   z.number().optional().describe("Max years of experience. Default: 5"),
      skills:               z.string().optional().describe("Comma-separated skills, e.g. 'React, TypeScript, Node.js'"),
      language:             z.string().optional().describe("Assessment language code. Default: en"),
      avatarType:           z.enum(["noAvatar", "digitalAvatar"]).optional().describe("Default: noAvatar"),
      aiVoice:              z.enum(["nova", "echo", "shimmer", "alloy", "onyx", "fable"]).optional().describe("AI voice. Default: nova"),
      jobLocationCountry:   z.string().optional().describe("Country where the job is located, e.g. 'India'. Default: India"),
      jobLocationCity:      z.string().optional().describe("City where the job is located, e.g. 'Chennai'. Default: Chennai"),
    },
    async ({
      jobTitle, jobDescription, interviewType, seniorityLevel, workPlaceType,
      employmentType, yearOfExperienceFrom, yearOfExperienceTo, skills, language, avatarType, aiVoice,
      jobLocationCountry, jobLocationCity,
    }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();
        const type = interviewType ?? "fixed";

        // Step 1: Create assessment record (type, language, avatar)
        const interviewRes = await screenerClient.post(`/employer/assessment/job-interview/${employerId}`, {
          interviewType: type,
          language:   language ?? "en",
          avatarType: avatarType ?? "noAvatar",
          aiVoice:    aiVoice ?? "nova",
        });

        const assessmentId =
          interviewRes.data?.data?.assessmentUuid ??
          interviewRes.data?.data?.assessmentRefId ??
          interviewRes.data?.assessmentUuid;

        if (!assessmentId) {
          return { content: [{ type: "text" as const, text: "Failed to create assessment: no ID returned from server." }] };
        }

        // Step 2: Upload job description (POST, status: JD_UPDATED)
        await screenerClient.post(`/employer/assessment/job-details/${employerId}`, {
          assessmentId,
          jdTextHtml: jobDescription,
          status: "JD_UPDATED",
        });

        // Step 3: Save job details (PATCH — not POST, status: JOB_DETAILS_UPDATED)
        // Skills must be sent as [{ name, value, favorite: false }] objects, not plain strings
        const skillsArray = skills
          ? skills.split(",").map((s) => s.trim()).filter(Boolean).map((s) => ({ name: s, value: s, favorite: false }))
          : [];

        await screenerClient.patch(`/employer/assessment/job-details/${employerId}`, {
          assessmentId,
          jobTitle,
          seniorityLevel:       seniorityLevel ?? "Fresher",
          workPlaceType:        workPlaceType  ?? "On-Site",
          employmentType:       employmentType ?? "Full-Time",
          yearOfExperienceFrom: yearOfExperienceFrom ?? 0,
          yearOfExperienceTo:   yearOfExperienceTo   ?? 5,
          assessmentConstraint: "NO_EXPIRY",
          skills:               skillsArray,
          jobDescription,
          jobLocationCountry:   jobLocationCountry ?? "India",
          jobLocationCity:      jobLocationCity    ?? "Chennai",
          status: "JOB_DETAILS_UPDATED",
        });

        const typeLabel: Record<string, string> = {
          fixed:   "One-way Interview",
          dynamic: "Two-way Interview",
          coding:  "Coding Interview",
          verbal:  "English Proficiency Test",
        };

        const nextSteps: Record<string, string> = {
          fixed:   `Next steps:\n1. Add ≥3 questions:   add_question (assessmentId: ${assessmentId})\n2. Configure:          configure_assessment\n3. Publish:            publish_assessment`,
          dynamic: `Next steps:\n1. Set skill context:  set_interview_context (assessmentId: ${assessmentId})\n2. Configure:          configure_assessment\n3. Publish:            publish_assessment`,
          coding:  `Next steps:\n1. Set language:       set_coding_language (assessmentId: ${assessmentId})\n2. Add problems:       add_coding_question\n3. Configure:          configure_assessment\n4. Publish:            publish_assessment`,
          verbal:  `Next steps:\n1. Set topics:         set_verbal_context (assessmentId: ${assessmentId})\n2. Configure:          configure_assessment\n3. Publish:            publish_assessment`,
        };

        return {
          content: [{
            type: "text" as const,
            text: `Assessment created successfully.\n\nID: ${assessmentId}\nTitle: ${jobTitle}\nType: ${typeLabel[type] ?? type}\nSkills: ${skillsArray.map((s: any) => s.name).join(", ") || "None"}\n\n${nextSteps[type]}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── list_questions ────────────────────────────────────────────────────────────
  server.tool(
    "list_questions",
    "Lists all questions for a specific assessment. Returns question IDs needed for edit_question and delete_question.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();
        const res = await screenerClient.get(`/employer/assessment/questions/${employerId}`, {
          params: { assessmentRefId: assessmentId },
        });
        const questions: any[] = res.data?.data ?? res.data ?? [];

        if (!questions.length) {
          return { content: [{ type: "text" as const, text: `No questions found for assessment ${assessmentId}.` }] };
        }

        const lines = questions.map((q: any, i: number) =>
          `${i + 1}. [ID: ${q.id}] ${q.question}\n   Type: ${q.questionType} | Answer: ${q.answerType} | Difficulty: ${q.difficultyLevel} | Time: ${q.timeToAnswer ?? "N/A"}s`
        );

        return {
          content: [{
            type: "text" as const,
            text: `${questions.length} question(s) for assessment ${assessmentId}:\n\n${lines.join("\n\n")}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── add_question ──────────────────────────────────────────────────────────────
  server.tool(
    "add_question",
    `Adds a question to a fixed (one-way) interview assessment. At least 3 questions are required before publishing.

Question types: General, Technical
Difficulty:     Easy, Moderate, Hard
Answer types:   Voice, Video, Mcq
Time (seconds): 30, 60, 90, 120`,
    {
      assessmentId:  z.string().describe("Assessment UUID"),
      question:      z.string().describe("The question text"),
      questionType:  z.enum(["General", "Technical"]).optional().describe("Default: General"),
      difficultyLevel: z.enum(["Easy", "Moderate", "Hard"]).optional().describe("Default: Moderate"),
      answerType:    z.enum(["Voice", "Video", "Mcq"]).optional().describe("How the candidate answers. Default: Voice"),
      timeToAnswer:  z.number().optional().describe("Time limit in seconds. Default: 30"),
      mcqOptions:    z.array(z.object({
        option:    z.string(),
        isCorrect: z.boolean(),
      })).optional().describe("MCQ options — required when answerType is Mcq"),
    },
    async ({ assessmentId, question, questionType, difficultyLevel, answerType, timeToAnswer, mcqOptions }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        const payload: any = {
          assessmentRefId: assessmentId,
          question,
          questionType:    questionType    ?? "General",
          answerType:      answerType      ?? "Voice",
          difficultyLevel: difficultyLevel ?? "Moderate",
          scoreApplicable: true,
          timeToAnswer:    timeToAnswer    ?? 30,
          questionDelivery: "DEFAULT",
        };

        if (answerType === "Mcq" && mcqOptions?.length) {
          payload.options = JSON.stringify(mcqOptions);
        }

        const res = await screenerClient.post(`/employer/assessment/add-question/${employerId}`, payload);
        const questionId = res.data?.data?.id ?? res.data?.id;

        return {
          content: [{
            type: "text" as const,
            text: `Question added.\n${questionId ? `Question ID: ${questionId}\n` : ""}Assessment: ${assessmentId}\nQuestion: "${question}"\nType: ${questionType ?? "General"} | Difficulty: ${difficultyLevel ?? "Moderate"} | Answer: ${answerType ?? "Voice"} | Time: ${timeToAnswer ?? 30}s`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── edit_question ─────────────────────────────────────────────────────────────
  server.tool(
    "edit_question",
    "Edits an existing question. Use list_questions to get question IDs.",
    {
      questionId:      z.number().describe("Question ID from list_questions"),
      assessmentId:    z.string().describe("Assessment UUID"),
      question:        z.string().optional().describe("Updated question text"),
      questionType:    z.enum(["General", "Technical"]).optional(),
      difficultyLevel: z.enum(["Easy", "Moderate", "Hard"]).optional(),
      answerType:      z.enum(["Voice", "Video", "Mcq"]).optional(),
      timeToAnswer:    z.number().optional(),
    },
    async ({ questionId, assessmentId, question, questionType, difficultyLevel, answerType, timeToAnswer }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        const payload: any = { id: questionId, assessmentRefId: assessmentId };
        if (question)        payload.question        = question;
        if (questionType)    payload.questionType    = questionType;
        if (difficultyLevel) payload.difficultyLevel = difficultyLevel;
        if (answerType)      payload.answerType      = answerType;
        if (timeToAnswer)    payload.timeToAnswer    = timeToAnswer;

        await screenerClient.patch(`/employer/assessment/edit-question/${employerId}`, payload);

        return {
          content: [{ type: "text" as const, text: `Question ${questionId} updated successfully.` }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── delete_question ───────────────────────────────────────────────────────────
  server.tool(
    "delete_question",
    "Deletes a question from an assessment. Use list_questions to get question IDs.",
    {
      questionId:   z.number().describe("Question ID from list_questions"),
      assessmentId: z.string().describe("Assessment UUID"),
    },
    async ({ questionId, assessmentId }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        await screenerClient.delete(`/employer/assessment/delete-question/${employerId}`, {
          data: { id: questionId, assessmentRefId: assessmentId },
        });

        return {
          content: [{ type: "text" as const, text: `Question ${questionId} deleted from assessment ${assessmentId}.` }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── generate_ai_questions ─────────────────────────────────────────────────────
  server.tool(
    "generate_ai_questions",
    "Generates AI-suggested questions based on the job description and skills. Works on fixed interview assessments.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        const res = await screenerClient.post(`/employer/assessment/ai-questions/${employerId}`, {
          assessmentRefId: assessmentId,
        });

        const questions: any[] = res.data?.data ?? res.data ?? [];

        if (!questions.length) {
          return { content: [{ type: "text" as const, text: "No AI questions generated. Ensure JD and skills are set first." }] };
        }

        const lines = questions.map((q: any, i: number) =>
          `${i + 1}. [ID: ${q.id ?? "N/A"}] ${q.question}\n   Type: ${q.questionType ?? "N/A"} | Difficulty: ${q.difficultyLevel ?? "N/A"}`
        );

        return {
          content: [{
            type: "text" as const,
            text: `${questions.length} AI-generated question(s) for assessment ${assessmentId}:\n\n${lines.join("\n\n")}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── set_interview_context ─────────────────────────────────────────────────────
  server.tool(
    "set_interview_context",
    `Sets the skill context for a dynamic (two-way AI) interview.

Skills are auto-fetched from the assessment (same skills added during job creation).
Min 3, Max 5 skills can be used for context.

If the assessment has ≤ 5 skills → all are used.
If the assessment has > 5 skills → first 5 are used by default, or specify exactly which skills via overrides (3–5 skills).

You only need to provide concepts and difficulty level — skill names come from the assessment.`,
    {
      assessmentId: z.string().describe("Assessment UUID"),
      overrides: z.array(z.object({
        skill:    z.string().describe("Skill name — must match a skill from the assessment"),
        concepts: z.array(z.string()).optional().describe("Topics within this skill. Default: []"),
        level:    z.enum(["Easy", "Moderate", "Hard"]).optional().describe("Difficulty level. Default: Moderate"),
      })).min(3).max(5).optional()
        .describe("Per-skill config (3–5 entries). If omitted, first 3–5 assessment skills are used with Moderate level."),
    },
    async ({ assessmentId, overrides }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        // Fetch assessment to get skills (same list shown in UI context step)
        const aRes = await screenerClient.get(`/employer/assessment/job-details/${assessmentId}`);
        const raw = aRes.data?.data;
        const assessment = Array.isArray(raw) ? raw[0] : raw;
        const assessmentSkills: any[] = assessment?.skills ?? [];

        if (assessmentSkills.length < 3) {
          return {
            content: [{ type: "text" as const, text: `This assessment only has ${assessmentSkills.length} skill(s). At least 3 skills are required for interview context. Update the assessment skills first.` }],
          };
        }

        // Build override lookup: skill name (lowercase) → { concepts, level }
        const overrideMap = new Map<string, { concepts: string[]; level: string }>();
        for (const o of overrides ?? []) {
          overrideMap.set(o.skill.toLowerCase(), {
            concepts: o.concepts ?? [],
            level:    o.level    ?? "Moderate",
          });
        }

        // Determine which skills to use for context
        let selectedSkills: string[];

        if (overrides && overrides.length >= 3) {
          // User specified skills explicitly — use those (already validated 3–5 by Zod)
          selectedSkills = overrides.map((o) => {
            // Find matching assessment skill (case-insensitive)
            const match = assessmentSkills.find(
              (s: any) => (typeof s === "string" ? s : s.name).toLowerCase() === o.skill.toLowerCase()
            );
            return match ? (typeof match === "string" ? match : match.name) : o.skill;
          });
        } else {
          // Auto-select: take first 5 (or all if ≤ 5)
          selectedSkills = assessmentSkills
            .slice(0, 5)
            .map((s: any) => (typeof s === "string" ? s : s.name));
        }

        const context = selectedSkills.map((name) => {
          const override = overrideMap.get(name.toLowerCase());
          return {
            skill:   name,
            concept: override?.concepts ?? [],
            level:   override?.level    ?? "Moderate",
            id:      null,
          };
        });

        await screenerClient.post(`/employer/assessment/create-context/${employerId}`, {
          context,
          assessmentRefId: assessmentId,
          status: "CONTEXT_DETAILS_UPDATED",
        });

        const lines = context.map((c, i) =>
          `${i + 1}. ${c.skill} (${c.level})${c.concept.length ? ": " + c.concept.join(", ") : ""}`
        );

        return {
          content: [{
            type: "text" as const,
            text: `Interview context set for ${context.length} skill(s) (${assessmentSkills.length} total in assessment):\n\n${lines.join("\n")}\n\nNext: configure_assessment → publish_assessment`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── set_verbal_context ────────────────────────────────────────────────────────
  server.tool(
    "set_verbal_context",
    "Sets the conversation topics for a verbal (English proficiency) assessment.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      topics: z.array(z.string())
        .min(1).max(5)
        .describe("Topics the candidate will speak about (min 1, max 5). Predefined: 'Self Introduction', 'Work', 'Hobbies', 'Career Goals', 'Home Town', 'Daily Routine'. Custom topics also allowed."),
    },
    async ({ assessmentId, topics }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        await screenerClient.post(`/employer/assessment/create-verbal-context/${employerId}`, {
          context:         topics,
          assessmentRefId: assessmentId,
          status:          "VERBAL_CONTEXT_UPDATED",
        });

        return {
          content: [{
            type: "text" as const,
            text: `Verbal context set for assessment ${assessmentId}.\nTopics: ${topics.join(", ")}\n\nNext: configure_assessment (interviewType: "verbal") → publish_assessment`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── set_coding_language ───────────────────────────────────────────────────────
  server.tool(
    "set_coding_language",
    "Sets the programming language for a coding interview assessment.",
    {
      assessmentId: z.string().describe("Assessment UUID"),
      language: z.enum([
        "c", "clojure", "cpp", "csharp", "fsharp", "go", "java", "javascript",
        "kotlin", "lua", "objective-c", "pascal", "perl", "php", "python",
        "r", "ruby", "rust", "sql", "swift", "typescript",
      ]).describe("Programming language for the coding test"),
    },
    async ({ assessmentId, language }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        await screenerClient.patch(`/employer/assessment/coding-language/${employerId}`, {
          language,
          assessmentId,
        });

        return {
          content: [{
            type: "text" as const,
            text: `Coding language set to "${language}" for assessment ${assessmentId}.\nNext: add_coding_question`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── add_coding_question ───────────────────────────────────────────────────────
  server.tool(
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
      assessmentId:  z.string().describe("Assessment UUID"),
      codingType:    z.enum(["CustomCode", "AI_GeneratedCode"]).describe("CustomCode = manual, AI_GeneratedCode = AI generates from concept"),
      questionType:  z.enum(["debugging", "complete_code", "code_completion"]).describe("Exercise type"),
      duration:      z.union([z.literal(5), z.literal(10), z.literal(15)]).describe("Time limit in minutes: 5, 10, or 15"),
      language:      z.enum([
        "c", "clojure", "cpp", "csharp", "fsharp", "go", "java", "javascript",
        "kotlin", "lua", "objective-c", "pascal", "perl", "php", "python",
        "r", "ruby", "rust", "sql", "swift", "typescript",
      ]).describe("Programming language"),
      // CustomCode fields
      question:      z.string().optional().describe("Problem description — required for CustomCode"),
      code:          z.string().optional().describe("Starter code template — required for CustomCode"),
      // AI_GeneratedCode fields
      concept:       z.string().optional().describe("Concept or prompt for AI to generate the question — required for AI_GeneratedCode"),
    },
    async ({ assessmentId, codingType, questionType, duration, language, question, code, concept }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        if (codingType === "AI_GeneratedCode") {
          if (!concept) {
            return { content: [{ type: "text" as const, text: "concept is required for AI_GeneratedCode." }] };
          }
          // AI generated — different endpoint, uses concept not question
          await screenerClient.post(`/employer/assessment/generate-coding-questions/${employerId}`, {
            assessmentRefId: assessmentId,
            concept,
            questionType,
            duration,           // stored in minutes directly
            codingType:         "AI_GeneratedCode",
            language,
          });

          return {
            content: [{
              type: "text" as const,
              text: `AI coding question generated for assessment ${assessmentId}.\nConcept: "${concept}"\nExercise: ${questionType} | Duration: ${duration} min | Language: ${language}`,
            }],
          };
        } else {
          if (!question) {
            return { content: [{ type: "text" as const, text: "question is required for CustomCode." }] };
          }
          // Custom manual question
          await screenerClient.post(`/employer/assessment/add-coding-questions/${employerId}`, {
            assessmentRefId: assessmentId,
            question,
            code:            code ?? "",
            questionType,
            duration,           // stored in minutes directly
            codingType:         "CustomCode",
            language,
          });

          return {
            content: [{
              type: "text" as const,
              text: `Custom coding question added to assessment ${assessmentId}.\nQuestion: "${question.slice(0, 80)}${question.length > 80 ? "..." : ""}"\nExercise: ${questionType} | Duration: ${duration} min | Language: ${language}`,
            }],
          };
        }
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── configure_assessment ──────────────────────────────────────────────────────
  server.tool(
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
      assessmentId:          z.string().describe("Assessment UUID"),
      interviewType:         z.enum(["fixed", "dynamic", "coding", "verbal"]).optional().describe("Interview type — used to set correct fitScoreWeightAge and interviewTime defaults"),
      availability:          z.enum(["flexi", "schedule"]).optional().describe("Default: flexi"),
      assessmentConstraint:  z.enum(["NO_EXPIRY", "SET_DATE", "SET_RESPONSES_COUNT"]).optional().describe("Default: NO_EXPIRY"),
      expiryDate:            z.string().optional().describe("ISO date, e.g. '2025-12-31' — required if constraint is SET_DATE"),
      responseCount:         z.number().optional().describe("Max responses — required if constraint is SET_RESPONSES_COUNT"),
      scheduleStart:         z.string().optional().describe("ISO datetime for schedule start — required if availability is schedule"),
      scheduleEnd:           z.string().optional().describe("ISO datetime for schedule end — required if availability is schedule"),
      interviewTime:         z.number().optional().describe("Override interview duration in seconds. If omitted, auto-calculated from questions (fixed/coding) and rounded to nearest slot: 600/900/1200/1500/3600"),
      retakeAllowed:         z.boolean().optional().describe("Allow retakes. Default: true"),
      candidateVideo:        z.boolean().optional().describe("Record candidate video. Default: true"),
      enableScreenShare:     z.boolean().optional().describe("Enable screen sharing. Default: true"),
      tabChangeDetection:    z.boolean().optional().describe("Flag tab switches. Default: false"),
      faceDetection:         z.boolean().optional().describe("Flag face out of view. Default: false"),
      multipleFaceDetection: z.boolean().optional().describe("Flag multiple faces. Default: false"),
      overallScoreVisible:   z.boolean().optional().describe("Show overall score to candidate. Default: false"),
      individualScoreVisible:z.boolean().optional().describe("Show per-question score to candidate. Default: false"),
      emailNotification:     z.boolean().optional().describe("Email notifications on completion. Default: true"),
      whatsappNotification:  z.boolean().optional().describe("WhatsApp notifications. Default: true"),
      // Verbal (English Proficiency) only
      qualificationCriteria: z.tuple([z.number(), z.number()]).optional()
        .describe("Verbal only — pass score range [min, max]. Default: [76, 100]"),
      verbalWeightAge: z.object({
        mti:           z.number().optional().describe("Mean Turn Initiative. Default: 20"),
        fluency:       z.number().optional().describe("Default: 20"),
        grammar:       z.number().optional().describe("Default: 20"),
        vocabulary:    z.number().optional().describe("Default: 20"),
        pronunciation: z.number().optional().describe("Default: 20"),
      }).optional().describe("Verbal only — scoring weights per dimension (must sum to 100). Default: equal 20 each"),
    },
    async ({
      assessmentId, interviewType, availability, assessmentConstraint, expiryDate, responseCount,
      scheduleStart, scheduleEnd, interviewTime, retakeAllowed, candidateVideo,
      enableScreenShare, tabChangeDetection, faceDetection, multipleFaceDetection,
      overallScoreVisible, individualScoreVisible, emailNotification, whatsappNotification,
      qualificationCriteria, verbalWeightAge,
    }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        const isSchedule = availability === "schedule";
        const isCoding   = interviewType === "coding";
        const isFixed    = interviewType === "fixed";

        // fitScoreWeightAge is type-specific
        const fitScoreWeightAge = isCoding
          ? [{ codeQuality: 50, problemSolving: 30, codeOptimization: 20 }]
          : [{ technicalScore: 50, communicationScore: 50 }];

        // Rounds total question seconds UP to the nearest fixed slot
        // Slots (from UI): 10min=600, 15min=900, 20min=1200, 25min=1500, 60min=3600
        function roundToSlot(totalSeconds: number): number {
          if (totalSeconds <= 600)  return 600;
          if (totalSeconds <= 900)  return 900;
          if (totalSeconds <= 1200) return 1200;
          if (totalSeconds <= 1500) return 1500;
          return 3600;
        }

        let resolvedInterviewTime = interviewTime;

        if (!resolvedInterviewTime) {
          if (interviewType === "verbal") {
            resolvedInterviewTime = 240;
          } else if (isFixed) {
            // Auto-calculate from question timeToAnswer values
            try {
              const qRes = await screenerClient.get(`/employer/assessment/questions/${employerId}`, {
                params: { assessmentRefId: assessmentId },
              });
              const questions: any[] = qRes.data?.data ?? [];
              const totalSecs = questions.reduce((sum: number, q: any) => sum + (q.timeToAnswer ?? 30), 0);
              resolvedInterviewTime = totalSecs > 0 ? roundToSlot(totalSecs) : 600;
            } catch {
              resolvedInterviewTime = 600;
            }
          } else if (isCoding) {
            // Auto-calculate from coding question duration values (duration stored in MINUTES)
            try {
              const aRes = await screenerClient.get(`/employer/assessment/job-details/${assessmentId}`);
              const raw = aRes.data?.data;
              const assessment = Array.isArray(raw) ? raw[0] : raw;
              const codingQs: any[] = assessment?.HyringScreenerCodingQuestions ?? [];
              const totalMins = codingQs.reduce((sum: number, q: any) => sum + (q.duration ?? 0), 0);
              // Convert minutes → seconds before rounding to slot
              resolvedInterviewTime = totalMins > 0 ? roundToSlot(totalMins * 60) : 600;
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
          assessmentConstraint:       assessmentConstraint   ?? "NO_EXPIRY",
          interviewTime:              resolvedInterviewTime,
          retakeAssessment:           retakeAllowed          ?? true,
          retakeQuestion:             "ONE_RETAKE",
          candidateVideo:             candidateVideo         ?? true,
          enableScreenShare:          enableScreenShare      ?? true,
          lockAssessment:             false,
          tabChanges:                 tabChangeDetection     ?? false,
          faceOutOFView:              faceDetection          ?? false,
          multipleFaces:              multipleFaceDetection  ?? false,
          multipleVoices:             false,
          isCandidateOverallScore:    overallScoreVisible    ?? false,
          isCandidateIndividualScore: individualScoreVisible ?? false,
          isCommunicationScore:       false,
          // scheduleAssessment is always true per backend default
          scheduleAssessment:         true,
          aiModel:                    "CHATGPT",
          // notification must be array of objects with id, child, email, slack, whatsapp
          notification: [{
            id:       employerId,
            child:    false,
            email:    emailNotification    ?? true,
            slack:    [],
            whatsapp: whatsappNotification ?? true,
          }],
          hiringStatusNotification: { email: true, whatsapp: true },
          fitScoreWeightAge,
          // Verbal (English Proficiency) — VerbalWeightAge and qualificationCriteria
          // must be sent via job-configuration, NOT create-verbal-context
          ...(interviewType === "verbal" ? {
            VerbalWeightAge: [{
              mti:           verbalWeightAge?.mti           ?? 20,
              fluency:       verbalWeightAge?.fluency       ?? 20,
              grammar:       verbalWeightAge?.grammar       ?? 20,
              vocabulary:    verbalWeightAge?.vocabulary    ?? 20,
              pronunciation: verbalWeightAge?.pronunciation ?? 20,
            }],
            qualificationCriteria: qualificationCriteria ?? [76, 100],
          } : {}),
          integritySignalsEnabled:   true,
          engagementVibesEnabled:    true,
          cognitiveInsightsEnabled:  true,
          cheatingDetectionEnabled:  true,
        };

        if (assessmentConstraint === "SET_DATE" && expiryDate) {
          payload.expiryDate = expiryDate;
        }
        if (assessmentConstraint === "SET_RESPONSES_COUNT" && responseCount) {
          payload.responseCount = responseCount;
        }
        if (isSchedule) {
          payload.scheduleDateStart = scheduleStart;
          payload.scheduleDateEnd   = scheduleEnd;
        }

        await screenerClient.patch(`/employer/assessment/job-configuration/${employerId}`, payload);

        return {
          content: [{
            type: "text" as const,
            text: `Assessment ${assessmentId} configured.\nAvailability: ${availability ?? "flexi"} | Constraint: ${assessmentConstraint ?? "NO_EXPIRY"}\nInterview time: ${resolvedInterviewTime}s (${resolvedInterviewTime / 60} min) | Retake: ${retakeAllowed ?? true}\n\nNext: publish_assessment`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── review_assessment ─────────────────────────────────────────────────────────
  server.tool(
    "review_assessment",
    "Returns a complete summary of the assessment before publishing: job details, questions, and configuration.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        requireAuth();
        const res = await screenerClient.get(`/employer/assessment/review/${assessmentId}`);
        const data = res.data?.data ?? res.data;

        if (!data) {
          return { content: [{ type: "text" as const, text: "Could not load review data." }] };
        }

        const questions: any[] = data.hyringScreenerQuestions ?? data.questions ?? [];
        const config = data;

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
          ...questions.map((q: any, i: number) =>
            `${i + 1}. ${q.question ?? "N/A"} [${q.difficultyLevel ?? "N/A"}] | Answer: ${q.answerType ?? "N/A"} | Time: ${q.timeToAnswer ?? "N/A"}s`
          ),
          ``,
          `--- Configuration ---`,
          `Availability:  ${config.availability ?? "N/A"}`,
          `Constraint:    ${config.assessmentConstraint ?? "N/A"}`,
          `Interview Time: ${config.interviewTime ?? "N/A"}s`,
          `Retake:        ${config.retakeAssessment ?? "N/A"}`,
          `Candidate Video: ${config.candidateVideo ?? "N/A"}`,
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── publish_assessment ────────────────────────────────────────────────────────
  server.tool(
    "publish_assessment",
    `Changes the status of an assessment.

Actions:
- "PUBLISHED" = Go live — assessment is now shareable with candidates
- "PAUSED"    = Temporarily stop accepting responses
- "CLOSED"    = Close permanently
- "ARCHIVED"  = Archive the assessment`,
    {
      assessmentId: z.string().describe("Assessment UUID"),
      action: z.enum(["PUBLISHED", "PAUSED", "CLOSED", "ARCHIVED"]).describe("Action to perform"),
    },
    async ({ assessmentId, action }) => {
      try {
        requireAuth();
        const employerId = await getEmployerIdFromAPI();

        await screenerClient.patch(`/employer/assessment/status/${employerId}`, {
          assessmentRefId: assessmentId,
          status:          action,
        });

        const messages: Record<string, string> = {
          PUBLISHED: `Assessment ${assessmentId} is now LIVE.\nCandidates can now be invited via invite_candidate or bulk_invite.`,
          PAUSED:    `Assessment ${assessmentId} is PAUSED. No new responses will be accepted.`,
          CLOSED:    `Assessment ${assessmentId} is CLOSED.`,
          ARCHIVED:  `Assessment ${assessmentId} has been ARCHIVED.`,
        };

        return { content: [{ type: "text" as const, text: messages[action] }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── get_assessment_stats ──────────────────────────────────────────────────────
  server.tool(
    "get_assessment_stats",
    "Returns overall statistics for an assessment: invited, attended, qualified, average score, etc.",
    { assessmentId: z.string().describe("Assessment UUID") },
    async ({ assessmentId }) => {
      try {
        requireAuth();
        const res = await screenerClient.get(`/assessment/assessment-stats/${assessmentId}`);
        const stats = res.data?.data ?? res.data;

        if (!stats) {
          return { content: [{ type: "text" as const, text: "No stats found for this assessment." }] };
        }

        const text = [
          `=== Assessment Stats: ${assessmentId} ===`,
          `Total Invited:  ${stats.totalInvited  ?? stats.invited  ?? "N/A"}`,
          `Attended:       ${stats.attended       ?? "N/A"}`,
          `Completed:      ${stats.completed      ?? "N/A"}`,
          `Qualified:      ${stats.qualified      ?? "N/A"}`,
          `Not Qualified:  ${stats.notQualified   ?? "N/A"}`,
          `Declined:       ${stats.declined       ?? "N/A"}`,
          `Scheduled:      ${stats.scheduled      ?? "N/A"}`,
          `Retake Requests:${stats.retakeRequests ?? "N/A"}`,
          `Average Score:  ${stats.averageScore   ?? "N/A"}`,
          `Total Views:    ${stats.totalViews     ?? "N/A"}`,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );
}
