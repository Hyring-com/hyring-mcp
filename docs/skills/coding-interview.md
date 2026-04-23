# Skill: Coding Interview

**Assessment Type:** `coding`
**Backend Port:** 5000 (screener API)
**Frontend:** `ai-screener-frontend`

---

## What It Is

A technical coding assessment where candidates solve programming problems in a browser-based code editor. The employer sets coding challenges, and AI evaluates the submitted code for correctness, quality, and optimization.

---

## Creation Flow (3 Steps)

```
Step 1: POST /employer/assessment/job-interview/{employerId}
  Body: { assessmentType: "coding", language }
  Response: { assessmentId (UUID), employerId }

Step 2: POST /employer/assessment/job-details/{employerId}
  Body: { assessmentId, jdText }
  Response: { status: "JD_UPDATED" }

Step 3: PATCH /employer/assessment/job-details/{employerId}
  Body: {
    assessmentId,
    roleName, seniorityLevel, employmentType,
    workPlaceType, jobLocationCountry, jobLocationCity,
    skills, currency, annualSalaryRangeFrom, annualSalaryRangeTo
  }
  Response: { status: "JOB_DETAILS_UPDATED" }
```

**MCP Tool:** `create_coding_assessment` ✅

---

## Programming Language Setup

**MCP Tool:** `set_coding_language`
**Endpoint:** PATCH `/employer/assessment/coding-language/{employerId}`

Supported languages (20+):
`Python`, `JavaScript`, `TypeScript`, `Java`, `C`, `C++`, `C#`, `Ruby`, `PHP`, `Swift`, `Kotlin`, `Go`, `Rust`, `Scala`, `R`, `MATLAB`, `Perl`, `Shell`, `SQL`, `Dart`

---

## Adding Coding Problems

**MCP Tool:** `add_coding_question`
**Endpoint:** POST `/employer/assessment/add-coding-questions/{employerId}`

### Question Properties
| Field | Values |
|-------|--------|
| `questionType` | `CustomCode` (employer writes) or `AI_GeneratedCode` (AI generates) |
| `exercise` | `debugging` (fix broken code), `complete_code` (fill in blanks), `code_completion` (write from scratch) |
| `timeDuration` | `5`, `10`, or `15` minutes |
| `difficulty` | `Easy`, `Moderate`, `Hard` |
| `question` | Problem statement text |
| `starterCode` | Optional starter code for candidate |

---

## Interview Time Calculation

```
totalMinutes = sum of all question timeDuration values
roundedSlot = nearest of [10, 15, 20, 25, 60] minutes (converted to seconds)
```

---

## Result Data Structure

### Backend Fields
```json
{
  "codingResults": [
    {
      "questionId": 1,
      "question": "Write a function to reverse a string",
      "difficulty": "Easy",
      "exercise": "code_completion",
      "codingAnswer": "def reverse_string(s):\n    return s[::-1]",
      "codeScore": 8.5,
      "testCasesPassed": 9,
      "totalTestCases": 10,
      "isCodeCompiled": true,
      "compilationError": null,
      "executionTime": 150,
      "memoryUsed": 256
    }
  ],
  "totalScore": 82.5
}
```

### ⚠️ CRITICAL: Score Breakdown Verification Needed

The MCP's `get_coding_report` shows a 3-way breakdown:
- Code Quality (50%)
- Problem Solving (30%)
- Optimization (20%)

**However:** The backend only stores a single `codeScore` per question. It's unclear if the API returns separate sub-scores or if the MCP is computing/inferring these.

**Action Required:** Read `src/tools/candidate.results.tools.ts` - `get_coding_report` implementation to see what fields are actually returned from the API and whether sub-scores are real or derived.

### Frontend Calculations

1. **Completion rate:**
   ```
   completion_percentage = (answered_coding_questions / total_coding_questions) * 100
   ```

2. **Overall fit score:**
   ```
   fit_score = totalScore (from backend)
   ```

3. **Fit score label:**
   - 0-25 → WEAK FIT
   - 26-50 → MODERATE FIT
   - 51-75 → GOOD FIT
   - 76-100 → STRONG FIT

4. **Per-question score label (0-10 scale, same as one-way):**
   Maps `codeScore` to descriptive label.

5. **Test case pass rate:**
   ```
   pass_rate = (testCasesPassed / totalTestCases) * 100
   ```

---

## What the MCP Report Shows

- Candidate name, email, completion status
- Overall fit score with label
- Per-question breakdown:
  - Problem statement
  - Difficulty level
  - Exercise type
  - Submitted code
  - Code score (0-10) with label
  - Test cases: passed/total
  - Compilation status
  - Execution time, memory usage
- Proctoring data (tab changes, face detection)
- AI-generated summary

---

## Status Flow

Same as one-way:
```
Invited → Started → Completed
         ↓
       Declined
```

**Hiring Stages:** `QUALIFIED` | `NOT_QUALIFIED` | `ON_HOLD`

---

## Missing / To Verify

- ⚠️ **CRITICAL:** Verify whether backend returns Code Quality / Problem Solving / Optimization as separate scores, or just a single `codeScore`. If just one score, the 3-way breakdown in MCP is fabricated.
- ⚠️ Verify: Is the `code` submission (actual code text) returned in the report API response?
- ✅ Completion rate calculation correct
- ✅ Fit score labels correct
- ✅ Test case pass rate can be calculated from backend data
