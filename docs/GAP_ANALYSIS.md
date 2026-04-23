# MCP Gap Analysis & Issues (Verified)

**Date:** 2026-04-23
**Status:** Based on actual code reading of all tool files + frontend repos.

---

## Summary Table

| Tool / Area | Status | Severity |
|-------------|--------|---------|
| Authentication (5 tools) | ✅ Correct | - |
| One-Way report (`get_fixed_report`) | ✅ Correct | - |
| Two-Way report (`get_dynamic_report`) | ✅ Correct | - |
| Coding report (`get_coding_report`) | ✅ Correct | - |
| EPT/Verbal report (`get_verbal_report`) | ✅ Correct | - |
| **Phone report (`get_phone_report`)** | ❌ Wrong API | 🔴 Critical |
| **VIP report (`get_vip_report`)** | ⚠️ Incomplete | 🟠 High |
| Resume report (`get_resume_report`) | ⚠️ Partial | 🟡 Medium |
| Results server (results.ts) | ⚠️ Missing phone/resume/VIP | 🟠 High |
| Production URL | ❌ Still LOCAL | 🔴 Critical |
| Score labels (all products) | ✅ Correct | - |
| CEFR levels (verbal) | ✅ Correct | - |
| Communication sub-scores normalization | ✅ Correct | - |
| Overwritten score handling | ✅ Correct | - |
| Fit score weighted calculation | ✅ Correct | - |
| Coding 3-way breakdown (Quality/Solving/Optimization) | ✅ Real data | - |
| AI Summary parsing (JSON array → bullets) | ✅ Correct | - |
| Phone "Interview Worthy" flag | ❌ Missing | 🔴 Critical |
| VIP AI report (tech score, comm score) | ❌ Missing | 🔴 Critical |
| Dashboard stats tool | ❌ Missing | 🟡 Medium |
| Assessment deletion | ❌ Missing | 🟡 Medium |
| Invite cancellation | ❌ Missing | 🟡 Medium |

---

## 🔴 Critical Issues

### 1. `get_phone_report` — Wrong API Endpoint

**File:** `src/tools/phone.view.tools.ts` (lines 160-230)

**Problem:** The tool calls:
```typescript
await screenerClient.post("/assessment/result", { seekerId, assessmentId, batch })
```

This is the **main screener API endpoint** designed for video interview results (one-way/two-way). It returns the video interview data structure (`hyringScreenerAssessment`, `hyringScreenerQuestions`, etc.).

**Phone screener results are completely different:**
- They come from `phoneClient` (port 5003), not `screenerClient`
- The data includes: `callDurationSecs`, `audioUrl`, `transcript[].matched`, `transcript[].priority`, `transcriptSummary`
- The key business logic is: **"Interview Worthy"** = all MUST_HAVE questions have `matched=true`

**What the phone report should look like:**
```typescript
// Correct approach (matching what phone frontend does):
const res = await phoneClient.get(`/report/{statusId}`);
// or
const res = await phoneClient.get(`/report/view/attended/${assessmentId}`, { params: { seekerId } });
```

**What's currently broken:**
1. Wrong API client (screenerClient vs phoneClient)
2. Wrong endpoint (video result vs phone call result)
3. No "Interview Worthy" calculation
4. No call duration display
5. No audio URL link
6. No transcript summary (JSON array parsing)
7. No MUST_HAVE vs NICE_TO_HAVE distinction in results

**Fix required:** Rewrite `get_phone_report` to use `phoneClient` and the correct phone screener endpoints, then implement the "Interview Worthy" calculation.

---

### 2. Production URL Still Set to LOCAL

**File:** `src/api/get-domain.ts`

```typescript
const ENV: Environment = 'LOCAL';  // ← Must be PRODUCTION before deployment
```

All API calls go to `localhost:5000/5003/5005`. This will fail for any real user. Must be switched to `PRODUCTION` before publishing/deploying the MCP.

---

### 3. `get_phone_report` Missing "Interview Worthy" Flag

Even after fixing the API endpoint, the tool must compute:

```typescript
// Phone screener's primary qualification signal:
const interviewWorthy = transcript
  .filter(q => q.priority === "MUST_HAVE")
  .every(q => q.matched === true);
```

This is the most important business metric in phone screening. Without it, the report is not useful.

---

## 🔴 VIP Report — Only Shows Interviewer Tab, Missing AI Analysis

**File:** `src/tools/vip.view.tools.ts` (lines 143-197)

**Problem:** `get_vip_report` currently only shows:
- Candidate name and email
- Interviewer rating (stars)
- Recommendation
- Comment text

**What's missing (the entire AI report tab):**
- Fit score (technical + communication weighted)
- Technical score (skill-by-skill breakdown)
- Per-skill conversation Q&A with scores
- Communication sub-scores (pronunciation, grammar, vocabulary, filler, fluency)
- Accent analysis
- AI-generated summary
- Sentiment analysis data

**Frontend has two tabs:** "AI Report" and "Interviewer Report". The MCP only returns Interviewer Report data.

**VIP API endpoint** `GET /vip/interview/report/{statusId}` returns all data including:
- `conversation_data[]` (skill conversations with scores)
- `language_score{}` (communication metrics)
- `accentAnalysis{}`
- `ai_summary`
- `interviewer_report{}`

**The tool reads this data but then only surfaces the `interviewFeedback` fields.**

**Fix required:** Extract and display the full AI analysis from the response, including the skill score calculation using VIP's specific formula.

---

## 🟠 High Priority Issues

### 4. Results Server Missing Phone/Resume/VIP View Tools

**File:** `src/bin/results.ts`

Current registrations:
```typescript
registerAuthTools(server);
registerAssessmentViewTools(server);   // only screener assessments
registerCandidateReviewTools(server);  // only screener candidates
registerCandidateResultsTools(server); // only fixed/dynamic/coding/verbal reports
```

**Missing:**
```typescript
registerPhoneViewTools(server);   // ← not registered
registerResumeViewTools(server);  // ← not registered
registerVipViewTools(server);     // ← not registered
```

An employer using the `hyring-mcp-results` binary cannot view phone, resume, or VIP reports.

**Fix:** Add the three missing registrations to `results.ts`.

---

## 🟡 Medium Priority Issues

### 5. `get_resume_report` — Partial Data, Criteria Field Name Uncertainty

**File:** `src/tools/resume.view.tools.ts` (lines 147-215)

**Issues:**
1. **Criteria type handling:** The code uses `c.mustHave ? "✓ MUST HAVE" : "Optional"`. But the actual backend data has `type: "MUST_HAVE" | "NICE_TO_HAVE" | "STARRED"`. The `mustHave` boolean may not exist on the actual response.

2. **Missing resume URL:** The report doesn't show the candidate's resume download link (`resume_url` from backend).

3. **Missing AI feedback:** The AI-generated feedback text from resume screening is not shown.

4. **Missing skills analysis:** Skills matched, skills not found, experience years, extracted education - not surfaced.

**Current display:**
- Fit score + label ✅
- Criteria list with matched status ⚠️ (field names uncertain)

**Should also display:**
- Resume download URL
- AI feedback summary
- Skills matched vs not found
- Extracted experience years
- Extracted current role/company

---

### 6. Dashboard Statistics Tool Missing

**No `get_dashboard` tool exists.**

The employer dashboard (`GET /employer/cat/dashboard/{employerId}`) returns 14 data points including:
- Total active assessments, total responses
- Not yet evaluated, evaluated, shortlisted, hired counts
- Organization rating
- Recent assessment activity

This would be a useful first tool for an AI agent to call to understand the employer's hiring pipeline at a glance.

---

### 7. Assessment Deletion Missing

**Backend endpoint:** `DELETE /employer/assessment/job-details/{employerId}`

No MCP tool for deleting draft or archived assessments. Employers accumulate draft assessments during experimentation with no way to clean them up.

---

### 8. Invite Cancellation Missing

**Backend endpoint:** `PATCH /employer/assessment/invite/status-change/{id}`

No MCP tool to cancel a sent invite. Once an invite is sent, the only action available is to send a reminder.

---

## ✅ What's Built Correctly (Verified)

After reading the actual code, these are confirmed correct:

### Authentication Flow
- OTP request + verification ✅
- JWT stored at `~/.hyring/credentials.json` with mode `0o600` ✅
- `employerId` extracted from JWT (no extra API call needed) ✅
- `authedTool` wrapper checks auth before every tool ✅
- Error messages are instruction-style (no "Error:" prefix for Claude) ✅

### One-Way Interview Report (`get_fixed_report`)
- Response tuple parsing: `raw[0]` (result), `raw[2]` (stats/count), `raw[3]` (english aggregates), `raw[4]` (tech score) ✅
- Communication score normalization: `(rawSum / (answeredCount × 10)) × 100` ✅
- Overwritten score handling: `ans.isOverwritten && ans.overWrittenScore != null` ✅
- Fit score weighted calc: `tech * (wTech/100) + comm * (wComm/100)` ✅
- All score labels applied correctly ✅
- AI summary parsed (JSON array or plain string) ✅
- Video link, accent, per-question transcripts ✅
- End-of-interview questions (experience, salary) surfaced ✅

### Two-Way Interview Report (`get_dynamic_report`)
- Uses correct endpoint: `/seeker/dynamic-interview/context-result` ✅
- Communication formula: VAPI style, `score * 10` for each dimension ✅
- Overwritten scores honored per conversation item ✅
- Screen share link surfaced ✅
- Conversations grouped by skill context ✅

### Coding Interview Report (`get_coding_report`)
- 3-way breakdown IS based on real backend data (`raw[3]` contains `codeQuality`, `problemSolving`, `codeOptimization`) ✅
- Weights from assessment config: default 50/30/20 ✅
- Code submission text shown (first 20 lines) ✅
- Per-question labels applied ✅

### EPT/Verbal Report (`get_verbal_report`)
- Uses dedicated endpoint `/language-screener/status/{statusId}/{batch}` ✅
- CEFR mapping from `totalScore` ✅
- All 6 language dimensions shown with labels ✅
- Mother tongue influence score shown ✅
- Per-topic word detections (influenced, unclear, grammar issues, filler/parasitic words) ✅
- Behavioral insights and fraud/integrity data surfaced ✅

### Score Label System
- Fit labels: WEAK/MODERATE/GOOD/STRONG FIT (0-25/26-50/51-75/76-100) ✅
- General labels: POOR/BELOW AVG./AVERAGE/GOOD/EXCELLENT (≤30/≤50/≤70/≤90/>90) ✅
- Per-question labels: Completely Incorrect → Perfect (0-10) ✅
- Resume fit label: Applied from `fitScore ?? totalScore` ✅

### Phone/Resume/VIP Listing & Stats
- `list_phone_assessments` → screenerClient with `phone: true` param ✅
- `get_phone_assessment_stats` → phoneClient at `/report/view/stats/{id}` ✅
- `list_phone_candidates` → phoneClient at `/report/view/{status}/{id}` ✅
- `list_resume_assessments` → screenerClient with `resume: true` param ✅
- `get_resume_assessment_stats` → `/details/employer/view/assessment-stats/{id}` ✅
- `list_resume_candidates` → `/details/employer/view/{status}/{id}` ✅
- `list_vip_assessments` → vipClient at `/vip/interview/assessments/{status}/{employerId}` ✅
- `get_vip_assessment_stats` → vipClient at `/details/interview/stats/{employerId}` ✅
- `list_vip_interviews` → vipClient at `/details/interview/{status}/{employerId}` ✅
- `update_vip_hiring_stage` → vipClient POST (not PATCH) `/details/change/hyring-stage/{employerId}` ✅

---

## Recommended Fix Order

| Priority | Fix |
|----------|-----|
| 1 | Fix production URL (`ENV = 'PRODUCTION'`) |
| 2 | Rewrite `get_phone_report` with correct phoneClient endpoint + "Interview Worthy" |
| 3 | Enhance `get_vip_report` to include AI report data (skills, scores, communication) |
| 4 | Add phone/resume/VIP view tools to `results.ts` |
| 5 | Fix `get_resume_report` criteria field names + add resume URL + AI feedback |
| 6 | Add `get_dashboard` tool |
| 7 | Add `delete_assessment` tool |
| 8 | Add `cancel_invite` tool |
