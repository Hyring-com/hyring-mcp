# Skill: One-Way (Fixed) Interview

**Assessment Type:** `fixed`
**Backend Port:** 5000 (screener API)
**Frontend:** `ai-screener-frontend`

---

## What It Is

A structured video interview where the employer pre-sets all questions. Candidates record their answers (video, audio, text, or MCQ). There is no live interaction - candidates respond at their own pace within time limits.

---

## Creation Flow (3 Steps)

```
Step 1: POST /employer/assessment/job-interview/{employerId}
  Body: { assessmentType: "fixed", avatarType, aiVoice, language }
  Response: { assessmentId (UUID), employerId }

Step 2: POST /employer/assessment/job-details/{employerId}
  Body: { assessmentId, jdText }
  Response: { status: "JD_UPDATED" }

Step 3: PATCH /employer/assessment/job-details/{employerId}
  Body: {
    assessmentId,
    roleName,
    seniorityLevel,       // Fresher | Junior | Mid Level | Senior | CXO
    employmentType,       // Full-Time | Part-Time | Contract | Temporary | Volunteer | Internship
    workPlaceType,        // On-Site | Hybrid | Remote
    jobLocationCountry,
    jobLocationCity,
    skills,               // array, min 2 max 5
    currency,
    annualSalaryRangeFrom,
    annualSalaryRangeTo,
    frequency
  }
  Response: { status: "JOB_DETAILS_UPDATED" }
```

**MCP Tool:** `create_fixed_assessment` ✅

---

## Question Management

### Question Types
| Field | Values |
|-------|--------|
| `questionType` | `General` or `Technical` |
| `answerType` | `Video` (recorded response), `Mcq` (multiple choice), `Text` (typed) |
| `difficultyLevel` | `Easy`, `Moderate`, `Hard` |
| `timeToAnswer` | 30 to 120 seconds |
| `mediaType` | `DEFAULT`, `VIDEO`, `MANUAL_AUDIO`, `IMAGE` |

### MCQ Options
- Min 2 options, max 50 chars each
- At least 1 option must be marked correct

### MCP Tools Available
| Tool | Endpoint |
|------|---------|
| `list_questions` | GET `/employer/assessment/questions/{employerId}` |
| `add_question` | POST `/employer/assessment/add-question/{employerId}` |
| `edit_question` | PATCH `/employer/assessment/edit-question/{employerId}` |
| `delete_question` | DELETE `/employer/assessment/delete-question/{employerId}` |
| `generate_ai_questions` | POST `/employer/assessment/ai-questions/{employerId}` |

**AI Question Generation:** Sends JD + skills → returns suggested questions with type/difficulty/time.

---

## Interview Time Calculation

Automatically calculated from question times:
```
totalSeconds = sum of all question timeToAnswer values
roundedSlot = nearest of [600, 900, 1200, 1500, 3600] seconds
```

---

## Configuration (Shared Tool)

**MCP Tool:** `configure_assessment`

| Setting | Options |
|---------|---------|
| Availability | `flexi` or `schedule` |
| Constraint | `NO_EXPIRY`, `SET_DATE`, `SET_RESPONSES_COUNT` |
| Scoring | Technical weight %, Communication weight % |
| Proctoring | Tab change detection, face detection, multiple face/voice detection |
| Candidate video | Enable/disable recording |

**Default scoring weights:** Technical 50%, Communication 50%

---

## Result Data Structure

### Backend Fields Returned
```json
{
  "assessmentData": {
    "hyringScreenerAssessment": {
      "assessmentId": "uuid",
      "hyringScreenerQuestions": [...],
      "integritySignalsEnabled": true,
      "engagementVibesEnabled": true,
      "cognitiveInsightsEnabled": true
    }
  },
  "seekerData": { ... },
  "results": [
    {
      "questionId": 1,
      "question": "Tell us about yourself",
      "score": 8.5,
      "transcript": "...",
      "summary": "Candidate discussed...",
      "english_score": 82,
      "english_vocabulary": 80,
      "english_fluency": 85,
      "english_pronunciation": 78,
      "sentimentAnalysis": {...},
      "tabChangeCount": 0,
      "isFaceDetected": true,
      "isDualVoiceDetected": false,
      "isDualFaceDetected": false,
      "isExternalMonitorUsed": false,
      "isOverwritten": false,
      "overWrittenScore": null
    }
  ],
  "videoAnalysis": {
    "accent_analysis": {
      "detected_accent": "Indian English",
      "country_code": "IN"
    },
    "video_link": "https://...",
    "isVideoDeleted": false
  }
}
```

### Frontend Calculations on This Data

1. **Completion rate:**
   ```
   result_percentage = (answered_count / total_questions) * 100
   ```

2. **Show communication score:**
   ```
   showCommunication = result_percentage >= 30
   ```

3. **Fit score label:**
   - 0-25 → WEAK FIT
   - 26-50 → MODERATE FIT
   - 51-75 → GOOD FIT
   - 76-100 → STRONG FIT

4. **Per-question score label (0-10):**
   - 0 → Completely Incorrect
   - 1 → Very Poor
   - 2 → Poor
   - 3 → Weak
   - 4 → Below Average
   - 5 → Average
   - 6 → Fair
   - 7 → Good
   - 8 → Very Good
   - 9 → Excellent
   - 10 → Perfect

5. **Overwritten score:** If `isOverwritten=true`, use `overWrittenScore` instead of `score`.

### MCP Tool
**`get_fixed_report`** - Fetches raw data and applies all above calculations, returning enriched report with labels.

---

## What the MCP Report Shows

- Candidate name, email, completion status
- Fit score (0-100) with label (WEAK/MODERATE/GOOD/STRONG FIT)
- Technical score with label (POOR/BELOW AVG./AVERAGE/GOOD/EXCELLENT)
- Communication score with label (only if completion ≥ 30%)
- Per-question breakdown:
  - Question text, type, difficulty
  - Score (0-10) with label
  - Transcript of candidate's answer
  - AI summary of answer
  - Sentiment analysis
- Proctoring data:
  - Tab changes count
  - Face detection status
  - Dual voice/face detection
  - External monitor usage
- Accent analysis (detected accent + country)
- Video link (if not deleted)
- AI-generated overall summary
- Hiring stage

---

## Status Flow

```
Invited → Started → Completed
         ↓
       Declined
         ↓
      Not Qualified (by employer)
```

**Hiring Stages (employer sets):** `QUALIFIED` | `NOT_QUALIFIED` | `ON_HOLD`

---

## Missing / To Verify

- ✅ Score labels are correctly applied
- ✅ Completion rate calculation
- ✅ Proctoring data surfaced
- ✅ Accent analysis surfaced
- ⚠️ Verify: Is `isOverwritten` score honored in MCP report?
- ⚠️ Verify: Are individual communication sub-scores (pronunciation, grammar, vocabulary, fluency, filler words) shown?
