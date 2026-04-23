# Skill: Phone Screener

**Assessment Type:** `phone`
**Backend Port:** 5003 (phone API)
**Frontend:** `phone-screener-frontend`

---

## What It Is

An automated phone screening system. The AI calls candidates and conducts a structured phone interview using pre-set questions. Answers are recorded and transcribed, then scored. Question types are designed for quick screening: Yes/No, Rating scale, or Numeric answers.

---

## Creation Flow (3 Steps)

```
Step 1: POST /employer/assessment/job-interview/{employerId}  [screener API]
  Body: { assessmentType: "phone", language }
  Response: { assessmentId (UUID), employerId }

Step 2: POST /employer/assessment/job-details/{employerId}  [screener API]
  Body: { assessmentId, jdText }

Step 3: PATCH /employer/assessment/job-details/{employerId}  [screener API]
  Body: { assessmentId, roleName, seniorityLevel, skills, ... }
```

> Note: Assessment creation uses the **screener API** (port 5000).
> Question management and results use the **phone API** (port 5003).

**MCP Tool:** `create_phone_assessment` ✅

---

## Question Management

### Question Types
| Type | Description |
|------|-------------|
| `YES_NO` | Candidate answers yes or no |
| `RATING` | Candidate rates on a scale (1-10) |
| `NUMERIC` | Candidate provides a number |

### Priority Levels
| Priority | Description |
|---------|-------------|
| `MUST_HAVE` | Critical requirement - must be met |
| `NICE_TO_HAVE` | Preferred but not required |
| `OPTIONAL` | Extra context, not scored for qualification |

### MCP Tools Available
| Tool | Endpoint |
|------|---------|
| `generate_phone_questions` | POST `phoneApi/employer/questions/generate/{id}` |
| `list_phone_questions` | GET `phoneApi/employer/questions/{id}` |
| `add_phone_question` | POST `phoneApi/employer/questions/{id}` |
| `edit_phone_question` | PATCH `phoneApi/employer/questions/{id}` |
| `delete_phone_question` | DELETE `phoneApi/employer/questions/{id}` |

**AI Question Generation:** Sends JD → returns suggested phone screening questions with appropriate types and priorities.

---

## Interview Duration

**Fixed:** 5 minutes (300 seconds).

---

## Result Data Structure

### Backend Fields

```json
{
  "assessment_data": {
    "jobTitle": "Software Engineer",
    "assessmentUuid": "uuid"
  },
  "result": [
    {
      "id": "call-id",
      "eventTimestamp": 1706000000000,
      "conversationId": "conv-123",
      "startTimeUnix": 1706000000,
      "callDurationSecs": 280,
      "mainLanguage": "en",
      "terminationReason": "completed",
      "audioUrl": "https://...",
      "transcript": [
        {
          "type": "YES_NO",
          "metric": "Has 3+ years of experience",
          "reason": "Candidate confirmed they have 4 years of experience",
          "matched": true,
          "priority": "MUST_HAVE",
          "question": "Do you have at least 3 years of experience?",
          "primaryValue": 1,
          "SecondaryValue": 0,
          "matched_time_in_secs": 45,
          "matched_user_message": "Yes, I have 4 years of experience"
        }
      ],
      "transcriptSummary": "[\"Strong candidate\", \"Met all must-have criteria\"]",
      "callSuccessful": "success",
      "error": null
    }
  ],
  "seeker_data": {
    "firstName": "John",
    "lastName": "Doe",
    "currentDesignation": "Developer",
    "email": "john@example.com",
    "phoneNumber": "+1234567890"
  },
  "total_score": 85
}
```

### Frontend Calculations

1. **"Interview Worthy" determination:**
   ```javascript
   // CRITICAL CALCULATION
   interviewWorthy = transcript
     .filter(q => q.priority === "MUST_HAVE")
     .every(q => q.matched === true)

   // Result: "Interview Worthy" or "Not Qualified"
   ```

2. **Score comment mapping:**
   ```
   0 or N/A → N/A (gray #6F7D71)
   1-30     → Poor (red #EB3939)
   31-50    → Below Avg. (orange #E17425)
   51-70    → Average (blue #198FD1)
   71-90    → Good (green #53B43B)
   91-100   → Excellent (dark green #05692F)
   ```

3. **Call duration formatting:**
   ```
   callDurationSecs → "Xm Ys" format
   ```

4. **Transcript summary parsing:**
   ```
   transcriptSummary is a JSON string → parse to array → display as bullet points
   ```

5. **Question match percentage:**
   ```
   matchedCount = transcript.filter(q => q.matched).length
   totalCount = transcript.length
   matchPercentage = (matchedCount / totalCount) * 100
   ```

### MCP Tool
**`get_phone_report`** - Fetches and processes the above data.

---

## What the MCP Report Shows

- Candidate name, phone number, designation
- Call status (success/failed)
- Call duration (formatted)
- Overall score (0-100) with label
- **"Interview Worthy" flag** (all MUST_HAVE matched = true)
- Per-question breakdown:
  - Question text and type
  - Priority level (MUST_HAVE/NICE_TO_HAVE/OPTIONAL)
  - Whether answer matched (true/false)
  - The actual answer the candidate gave
  - Reason/context
  - Timestamp in call
- AI-generated transcript summary (bullet points)
- Audio recording link

---

## Key Differences from Video Assessments

| Aspect | Phone Screener | Video Interviews |
|--------|---------------|-----------------|
| Medium | Voice call | Video recording |
| Question types | YES_NO, RATING, NUMERIC | Video, MCQ, Text |
| Interaction | Real-time phone call | Async recording |
| Duration | 5 min fixed | Variable |
| Score basis | Match % + priority | AI evaluation |
| Key metric | "Interview Worthy" | Fit score |
| Data | Audio URL + transcript | Video URL + transcript |

---

## Candidate Status Types

| Status | Meaning |
|--------|---------|
| `attended` | Completed the call |
| `invited` | Invited but not yet called |
| `started` | Call in progress/ringing |
| `declined` | Declined the invitation |

---

## Missing / To Verify

- ⚠️ **CRITICAL:** Verify `get_phone_report` computes and surfaces the **"Interview Worthy"** flag (all MUST_HAVE matched = true). This is the key business metric for phone screening.
- ⚠️ Verify: Is `transcriptSummary` parsed from JSON string to array before displaying?
- ⚠️ Verify: Is audio URL surfaced in the MCP report for playback?
- ⚠️ Verify: Is the score comment label (Poor/Below Avg./Average/Good/Excellent) applied to `total_score`?
- ✅ Question priority types handled (MUST_HAVE/NICE_TO_HAVE/OPTIONAL)
- ✅ Phone API client (port 5003) used correctly
