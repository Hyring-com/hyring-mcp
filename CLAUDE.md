# Hyring MCP — Architecture & Tool Knowledge

## What This Is

An MCP (Model Context Protocol) server that gives an AI assistant full access to the Hyring hiring platform. The AI acts as a bridge between the user (an employer) and the Hyring backend APIs — listing assessments, inviting candidates, viewing reports, updating hiring stages, etc.

The server communicates over **stdio** using the `@modelcontextprotocol/sdk`. Every tool is registered with a name, description, Zod schema, and handler. The AI selects tools based on the user's request.

---

## Auth Flow

1. User has no session → `requireAuth()` throws → `authedTool` returns an instruction to the AI to call `request_otp`.
2. AI asks user for email → calls `request_otp(email)` → OTP sent to user's inbox.
3. User shares OTP → AI calls `verify_otp(email, otp)` → JWT saved to `~/.hyring/credentials.json` (mode 600).
4. All subsequent tool calls attach `Authorization: Bearer <token>` via axios interceptors.
5. `requireAuth()` checks token existence and JWT `exp` claim — expired tokens prompt re-login.

**Key functions:**
- `requireAuth()` — `src/api/screener.client.ts` — throws if not logged in or expired
- `authedTool()` — `src/server.ts` — wraps every non-auth tool with the auth check
- `getEmployerIdFromAPI()` — `src/api/screener.client.ts` — hits `/employer/cat/me`, returns numeric employerId
- `getEmployerIdFromToken()` — `src/auth/credentials.ts` — decodes JWT payload directly (no API call), used by VIP tools
- Credentials stored at: `~/.hyring/credentials.json`

---

## Products

| Internal type | Product name shown to user           | API client     |
|---------------|--------------------------------------|----------------|
| `fixed`       | AI Video Interviewer (One-Way)       | screenerClient |
| `dynamic`     | AI Video Interviewer (Two-Way)       | screenerClient |
| `coding`      | AI Coding Interviewer                | screenerClient |
| `verbal`      | English Proficiency Test             | screenerClient |
| `phone`       | AI Phone Screener                    | phoneClient    |
| `resume`      | AI Resume Screener                   | screenerClient |
| `vip`         | Virtual Interview Platform           | vipClient      |

**Rule:** Never use internal type names (fixed, dynamic, verbal, etc.) in user-facing responses. Always use the product name on the right.

---

## API Clients

All clients live in `src/api/`. Base URLs come from `getDomain()` (`src/api/get-domain.ts`).

| Client          | File                         | Used by                        |
|-----------------|------------------------------|--------------------------------|
| `screenerClient`| `api/screener.client.ts`     | assessment, candidates, resume |
| `phoneClient`   | `api/phone.client.ts`        | phone screener tools           |
| `vipClient`     | `api/vip.client.ts`          | VIP tools                      |

Error extractors: `extractError`, `extractPhoneError`, `extractVipError` — all handle AxiosError `.response.data.message`.

---

## Source File Structure

```
src/
  server.ts                          — createServer(), authedTool(), startStdio(), TONE_INSTRUCTIONS
  auth/
    credentials.ts                   — save/load/clear JWT, isTokenExpired(), getEmployerIdFromToken()
  api/
    screener.client.ts               — screenerClient axios instance, requireAuth(), getEmployerIdFromAPI()
    phone.client.ts                  — phoneClient axios instance
    vip.client.ts                    — vipClient axios instance
    get-domain.ts                    — returns base URLs per environment
  tools/
    helpers.ts                       — ALL shared score helpers, formatters, status maps (single source of truth)
    auth.tools.ts                    — request_otp, verify_otp, whoami, logout, token_status
    assessment/
      assessment.tools.ts            — list_assessments, get_assessment, get_assessment_stats
    candidates/
      candidates.tools.ts            — list_candidates, update_hiring_stage, send_reminder
      attended.tools.ts              — list_attended_candidates
      invite.tools.ts                — invite_candidate, bulk_invite
    reports/
      one-way.report.tools.ts        — get_fixed_report
      two-way.report.tools.ts        — get_dynamic_report
      coding.report.tools.ts         — get_coding_report
      ept.report.tools.ts            — get_verbal_report
    phone-screener/
      phone.tools.ts                 — list_phone_assessments, get_phone_assessment_stats, list_phone_candidates, get_phone_report, send_phone_reminder
    resume-screener/
      resume.tools.ts                — list_resume_assessments, get_resume_assessment_stats, list_resume_candidates, get_resume_report, send_resume_reminder
    vip/
      vip.tools.ts                   — list_vip_assessments, get_vip_assessment_stats, list_vip_interviews, get_vip_report, update_vip_hiring_stage
    build/                           — assessment creation tools (one file per product)
  bin/
    full.ts      — all tools (full product suite)
    fixed.ts     — AI Video Interviewer (One-Way) only
    dynamic.ts   — AI Video Interviewer (Two-Way) only
    coding.ts    — AI Coding Interviewer only
    verbal.ts    — English Proficiency Test only
    phone.ts     — AI Phone Screener only
    resume.ts    — AI Resume Screener only
    vip.ts       — Virtual Interview Platform only
    results.ts   — all results/report tools (no build tools)
```

---

## Tool Reference

### Auth tools — `tools/auth.tools.ts`
Registered via `server.tool()` directly (no auth check — these ARE the auth tools).

| Tool           | Purpose                                              |
|----------------|------------------------------------------------------|
| `request_otp`  | Sends OTP to employer email to begin sign-in         |
| `verify_otp`   | Verifies OTP, saves JWT to `~/.hyring/credentials.json` |
| `whoami`       | Returns signed-in employer profile                   |
| `logout`       | Clears saved credentials                             |
| `token_status` | Checks if session is active, expired, or missing     |

---

### Assessment tools — `tools/assessment/assessment.tools.ts`

| Tool                    | Purpose                                                                  |
|-------------------------|--------------------------------------------------------------------------|
| `list_assessments`      | Lists assessments by status (active/inactive/drafts/archived). Supports filter by interviewType, search, pagination. Assessment UUIDs go in the `[Internal references]` block — never shown to user. |
| `get_assessment`        | Full details of one assessment by UUID (job title, skills, questions, expiry, etc.) |
| `get_assessment_stats`  | Candidate counts for an assessment: completed, invited, in-progress, declined, not-qualified, retake, scheduled |

---

### Candidate tools — `tools/candidates/`

| Tool                       | File                  | Purpose                                                                 |
|----------------------------|-----------------------|-------------------------------------------------------------------------|
| `list_candidates`          | candidates.tools.ts   | Lists candidates for any assessment by status (completed/invited/started/declined/not_qualified/retake/scheduled). Verbal EPT uses a different endpoint. Internal refs (seekerId, statusId, batch) go in `[Internal references]` block. |
| `update_hiring_stage`      | candidates.tools.ts   | Updates hiring stage (SHORTLISTED/HIRED/REJECTED/ON_HOLD/NOT_APPLICABLE/NOT_YET_EVALUATED). Applies to fixed/dynamic/coding ONLY. |
| `send_reminder`            | candidates.tools.ts   | Sends reminder email to an invited candidate who hasn't started yet. Takes inviteId. |
| `list_attended_candidates` | attended.tools.ts     | Lists completed candidates with scores and hiring stage (or Qualified for EPT). Returns internal refs (seekerId/statusId + batch) for follow-up report calls. |
| `invite_candidate`         | invite.tools.ts       | Sends a single invite to a candidate for an assessment                  |
| `bulk_invite`              | invite.tools.ts       | Sends invites to multiple candidates at once                            |

---

### Report tools — `tools/reports/`

All report tools need seekerId + batch (fixed/dynamic/coding) or statusId + batch (verbal/EPT). Always pass the batch number — omitting it defaults to batch 1 (first attempt), not the latest.

| Tool               | File                       | Assessment type | Purpose                                                    |
|--------------------|----------------------------|-----------------|------------------------------------------------------------|
| `get_fixed_report` | one-way.report.tools.ts    | fixed           | Full One-Way report: fit score, technical %, communication %, per-question scores/transcripts, AI summary, video link |
| `get_dynamic_report`| two-way.report.tools.ts   | dynamic         | Full Two-Way report: fit score, skill-grouped conversation Q&A with transcripts, AI summary |
| `get_coding_report`| coding.report.tools.ts     | coding          | Full Coding report: fit score, code quality/problem-solving/optimization %, per-question submitted code |
| `get_verbal_report`| ept.report.tools.ts        | verbal          | Full EPT report: CEFR level, pronunciation/fluency/grammar/vocabulary/MTI scores, per-topic transcript, AI summary |

**Score scales (defined in `tools/helpers.ts`):**
- Fit Score %: 0-25 Weak Fit, 26-50 Moderate Fit, 51-75 Good Fit, 76+ Strong Fit
- Technical/Communication %: ≤30 POOR, ≤50 BELOW AVG., ≤70 AVERAGE, ≤90 GOOD, >90 EXCELLENT
- Per-question 0-10 scale: 0 Completely Incorrect … 10 Perfect
- Dynamic score 0-5 scale: ≤1 Poor, ≤2 Average, ≤3 Fair, >3 Perfect
- VIP per-question 0-4 scale: 0 Not Scored, ≤1 Poor, ≤2 Average, ≤3 Fair, >3 Perfect

---

### Phone Screener tools — `tools/phone-screener/phone.tools.ts`

| Tool                        | Purpose                                                                    |
|-----------------------------|----------------------------------------------------------------------------|
| `list_phone_assessments`    | Lists AI Phone Screener assessments. Uses `phone: true` param on screener API. |
| `get_phone_assessment_stats`| Candidate counts: attended/invited/started/declined                        |
| `list_phone_candidates`     | Lists candidates by status. ScreenerId + candidateType in `[Internal references]` block. |
| `get_phone_report`          | Full call report: call success, duration, score, Interview Worthy status (all MUST_HAVE matched), per-question transcript, AI summary, audio link. Falls back active→passive if result empty. |
| `send_phone_reminder`       | Sends reminder to invited candidates. Takes assessmentId + seekerIds[].   |

---

### Resume Screener tools — `tools/resume-screener/resume.tools.ts`

| Tool                          | Purpose                                                                  |
|-------------------------------|--------------------------------------------------------------------------|
| `list_resume_assessments`     | Lists AI Resume Screener assessments. Uses `resume: true` param.         |
| `get_resume_assessment_stats` | Candidate counts: all/uploaded/invited/inbound/declined                  |
| `list_resume_candidates`      | Lists candidates by status. Backend returns 5-tuple — candidates at index [2], totalCount at [3]. StatusId in `[Internal references]` block. |
| `get_resume_report`           | Full resume report: fit score label, MUST HAVE/nice-to-have criteria match, skill depth %, company tier %, industry exposure %, AI summary, resume URL |
| `send_resume_reminder`        | Sends reminder to invited candidate. Takes assessmentId + seekerId.      |

---

### VIP tools — `tools/vip/vip.tools.ts`

| Tool                      | Purpose                                                                      |
|---------------------------|------------------------------------------------------------------------------|
| `list_vip_assessments`    | Lists Virtual Interview Platform job roles. Uses `getEmployerIdFromToken()` (no API call). |
| `get_vip_assessment_stats`| Interview counts: completed/scheduled/cancelled                              |
| `list_vip_interviews`     | Lists interviews by status. StatusId in `[Internal references]` block.       |
| `get_vip_report`          | Full VIP report: AI analysis (fit score, tech score, comm breakdown, accent, AI summary), per-skill Q&A with transcript, behavioral signals, interviewer evaluation (rating, hiring decision, skill ratings). |
| `update_vip_hiring_stage` | Updates VIP candidate stage: SHORTLIST/REJECT/HOLD                          |

---

## Key Patterns

### Internal references block
Every list tool ends with a block that Claude uses for follow-up calls but never reads aloud to the user:
```
[Internal references — do not share with user]
1: SeekerId 12345, Batch 2
2: SeekerId 67890, Batch 1
```

UUIDs, SeekerId, StatusId, ScreenerId, and Batch numbers all go here. The user sees name/email/score/stage only.

### EPT (English Proficiency Test) is ALWAYS separate from list_assessments
`list_assessments` without `interviewType` uses the default screener API endpoint which **never includes EPT**. EPT requires a separate call with `interviewType: 'verbal'` (which adds `verbal: true` to the request params). This is a backend API design — not a bug.

**Rule:** Any time the user asks for a total assessment count or a full breakdown across products, you MUST call `list_assessments` twice: once without filter (video+coding) and once with `interviewType='verbal'` (EPT). Never report totals from a single call. The tool response includes a `[Note for AI]` reminder when EPT is excluded.

### Pagination language
Always: `"X more available — ask to see more."` — never "Use page: N to see more."

### Status label mappings (in `tools/helpers.ts`)
```
CANDIDATE_STATUS:
  ENDED_ASSESSMENT / COMPLETED   → "Completed"
  ENDED_ASSESSMENT_RETAKE        → "Completed (Retake)"
  CREATED                        → "Not Completed"
  CREATED_RETAKE                 → "Not Completed (Retake)"
  DISQUALIFIED                   → "Disqualified"

HIRING_STAGE:
  NOT_YET_EVALUATED  → "Pending Review"
  NOT_APPLICABLE     → "Not Applicable"
  ON_HOLD            → "On Hold"
  SHORTLISTED        → "Shortlisted"
  HIRED              → "Hired"
  REJECTED           → "Rejected"

ASSESSMENT_STATUS (in assessment.tools.ts):
  PUBLISHED          → "Active"
  IN_ACTIVE          → "Inactive"
  ARCHIVED           → "Archived"
  DRAFT              → "Draft"
  LIPSYNC_PENDING    → "Live Soon"
  AUDIO_PENDING      → "Live Soon"
  LIPSYNC_ERROR      → "Failed"
```

### Response tuple structure (screener API)
Most list endpoints return a tuple array:
- `[0]` — assessment/context info
- `[1]` — top 5 candidates (or totalCount for assessment lists)
- `[2]` — candidates list
- `[3]` — total_count
- `[4]` — filtered_count

Always check for this tuple shape before treating the response as a flat array.

### Batch numbers
For fixed/dynamic/coding/verbal reports, `batch` = attempt number (1 = first, 2 = second retake, etc.). Always pass the batch from `list_attended_candidates` — omitting it defaults to batch 1 which may not be the latest attempt.

---

## Rules (never break these)

1. **Never show UUIDs to the user.** Assessment UUIDs, StatusIds, SeekerId, ScreenerId go in the `[Internal references]` block only.
2. **Never show internal type names** (`fixed`, `dynamic`, `verbal`, etc.) in user-facing text. Always use the product page names.
3. **Always map raw backend statuses** to human labels using the mappings above. Never let `LIPSYNC_PENDING`, `ENDED_ASSESSMENT`, `NOT_YET_EVALUATED`, etc. reach the user.
4. **`update_hiring_stage` does not apply to EPT, Phone Screener, or Resume Screener** — those products use AI-determined Qualified (Yes/No) only.
5. **VIP uses `getEmployerIdFromToken()`** (decodes JWT locally). All other products use `getEmployerIdFromAPI()` (API call).

---

## Adding a New Tool

1. Find the right subfolder under `src/tools/` by product or category.
2. Use `authedTool(server, name, description, schema, handler)` — never `server.tool()` directly (except auth tools).
3. Import any score helpers or formatters from `../helpers` (or `../../helpers` if deeper).
4. Move all internal IDs to the `[Internal references — do not share with user]` block at the bottom of the response.
5. Register the new function in the relevant `src/bin/*.ts` files.
6. Run `npm run build` to verify.
