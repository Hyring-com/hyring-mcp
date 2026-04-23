# Skill: VIP Live Interview

**Assessment Type:** `vip`
**Backend Port:** 5005 (VIP API)
**Frontend:** `VIP-UI`

---

## What It Is

A premium live interview platform. Unlike other Hyring products, VIP involves a real human interviewer conducting a structured video interview with the candidate. The platform provides AI assistance to the interviewer and generates two types of reports: an AI analysis report and an interviewer's subjective report.

---

## Key Differentiators from Other Products

| Aspect | VIP | AI Products |
|--------|-----|-------------|
| Interviewer | Human (employer/team) | AI |
| Interview type | Scheduled live video | Async or AI-real-time |
| Report types | AI Report + Interviewer Report | Single AI report |
| Status types | Scheduled/Completed/Cancelled | Invited/Started/Completed |
| Auto-published | Yes (no publish step) | No (requires configure + publish) |
| API | Separate VIP API (port 5005) | Screener API (port 5000) |
| Creation steps | 2 steps | 3 steps |

---

## Creation Flow (2 Steps - Auto Published)

```
Step 1: POST /vip/interview/job-details/{employerId}  [vip API]
  Body: { jdText, assessmentId }

Step 2: PATCH /vip/interview/job-details/{employerId}  [vip API]
  Body: {
    assessmentId,
    roleName, seniorityLevel, employmentType,
    workPlaceType, jobLocationCountry, jobLocationCity,
    skills, currency, annualSalaryRangeFrom, annualSalaryRangeTo
  }
```

**VIP assessments are auto-published immediately after creation.** No separate publish step needed.

**MCP Tool:** `create_vip_assessment` ✅

---

## Interview Lifecycle

Unlike other assessments, VIP interviews must be **scheduled** before they happen:

```
Job Role Created (auto-published)
    ↓
Candidate identified & interview scheduled
    ↓
Interview conducted (live video)
    ↓
AI generates analysis report
    ↓
Interviewer submits feedback
    ↓
Hiring decision made
```

---

## Result Data Structure

### API Endpoint
`GET /vip/interview/report/{statusId}` [vip API]

### Backend Fields
```json
{
  "vipStatus": {
    "id": "status-id",
    "interviewStatus": "COMPLETED",
    "scheduledAt": "2024-01-15T15:00:00Z",
    "completedAt": "2024-01-15T16:00:00Z",
    "seekerCat": {
      "firstName": "John",
      "lastName": "Doe",
      "profilePicture": "https://...",
      "currentDesignation": "Senior Developer",
      "currentCity": "San Francisco"
    },
    "employerCat": {
      "fullName": "Tech Corp",
      "HyringScreenerTeamManagement": [
        { "email": "interviewer@tech.com", "firstName": "Jane", "lastName": "Smith" }
      ]
    }
  },
  "conversation_data": [
    {
      "skill": "React",
      "score": 8.0,
      "scoreApplicable": true,
      "isOverwritten": false,
      "overWrittenScore": null,
      "transcript": "Interviewer: Explain React's reconciliation algorithm.\nCandidate: ..."
    }
  ],
  "language_score": {
    "pronunciation_score": 82,
    "grammar_score": 79,
    "vocabulary_score": 85,
    "filler_score": 78,
    "fluency_score": 88
  },
  "video_link": "https://...",
  "accentAnalysis": {
    "detected_accent": "American English",
    "country_code": "US"
  },
  "ai_summary": "Candidate demonstrated strong React knowledge...",
  "interviewer_report": {
    "rating": 4,
    "recommendation": "HIRE",
    "notes": "Strong technical skills, good communication",
    "strengths": ["Deep React knowledge", "Problem-solving"],
    "weaknesses": ["Could improve system design knowledge"]
  }
}
```

### Frontend Score Calculations (VIP-specific)

The VIP frontend has more complex score calculations than other products.

#### 1. Technical Score (Skill-Based)

```javascript
// Step 1: Organize conversations by skill
skill_mapper(conversation_data):
  skills = {} // { skillName: [scores] }
  for each conversation:
    score = isOverwritten ? overWrittenScore : score
    skills[skill].push(score)

// Step 2: Average per skill
for each skill:
  avg = totalScore / Math.max(count, 3)  // min 3 to normalize
  avg = Math.min(avg, 5.0)               // cap at 5

// Step 3: Portion of total technical score
portion = (avg / 5) * (100 / totalSkills)
final_technical = sum of all portions  // 0-100
```

#### 2. Communication Score

Two possible formulas depending on interview type:

**For VAPI-based interviews:**
```javascript
transformDataVapiIntelligence(language_score):
  pronunciation = (pronunciation_score * 10) / 100
  grammar = (grammar_score * 10) / 100
  vocabulary = (vocabulary_score * 10) / 100
  filler = (filler_score * 10) / 100
  fluency = (fluency_score * 10) / 100
  average = (sum of all) / (5 * 10) * 100
```

**For standard two-way:**
```javascript
transformDataTwoWay(language_score):
  pronunciation = (vocabulary_score / 4) * 100  // Note: uses vocabulary_score
  grammar = (grammar_score / 4) * 100
  vocabulary = (vocabulary_score / 4) * 100
  filler = (filler_score / 4) * 100
  fluency = (fluency_score / 4) * 100
  average = (sum of A values) / (5 * 100) * 100
```

#### 3. Fit Score

```javascript
calculateFitScoreRevamp(techScore, commScore, weightage):
  fit = techScore * (weightage.technicalScore / 100)
      + commScore * (weightage.communicationScore / 100)
  return Math.round(fit)
```

#### 4. Fit Level Labels

```javascript
getFitLevelDetails(score):
  0-25   → Weak Fit (1 bar, red #FD3636)
  26-50  → Moderate Fit (2 bars, orange #F5A544)
  51-75  → Good Fit (3 bars, green #84DC49)
  76-100 → Strong Fit (4 bars, dark green #2E931E)
```

#### 5. Score Comment Labels

```javascript
getCommentRevamp(score):
  N/A    → N/A (gray)
  0-30   → Poor (red)
  31-50  → Below Avg. (orange)
  51-70  → Average (blue)
  71-90  → Good (green)
  91-100 → Excellent (dark green)
```

#### 6. Individual Skill Score Label

```javascript
getScoreInfo(score):
  null → gray
  ≤2   → Poor (red #CC1919)
  ≤4   → Average (orange #E17425)
  ≤6   → Fair (blue #0479BA)
  ≤8   → Good (green #3A9201)
  >8   → Perfect (dark green #05692F)
```

### ⚠️ CRITICAL: Which Formula Does MCP Use?

The VIP frontend has two communication score formulas (VAPI vs standard). The MCP's `get_vip_report` must use the correct one. This needs verification.

---

## Report Tabs (Two Report Types)

### Tab 1: AI Report
- Fit score (weighted technical + communication)
- Technical score breakdown (per skill with transcripts)
- Communication score breakdown (pronunciation, grammar, vocabulary, filler, fluency)
- Sentiment analysis graph
- Interview intelligence (integrity signals, engagement vibes, cognitive insights)
- Accent analysis
- AI summary

### Tab 2: Interviewer Report
- Interviewer's rating (1-5 stars)
- Recommendation (HIRE/HOLD/REJECT)
- Written notes
- Strengths and weaknesses lists

**⚠️ MCP Check:** Does `get_vip_report` return both AI data AND interviewer feedback? Or just one?

---

## VIP Interview Status Types

| Status | Meaning |
|--------|---------|
| `completed` | Interview done |
| `scheduled` | Upcoming interview |
| `cancelled` | Interview cancelled |

---

## VIP Assessment Listing

Unlike other products, VIP uses:
- `list_vip_assessments` → lists job roles
- `list_vip_interviews` → lists scheduled/completed interviews within a job role

**Endpoints:**
- `GET /vip/interview/assessments/{status}/{employerId}` (active/inactive/archived)
- `GET /details/interview/{status}/{employerId}` (completed/scheduled/cancelled)

---

## Missing / To Verify

- ⚠️ **CRITICAL:** Verify which communication score formula (`transformDataVapiIntelligence` vs `transformDataTwoWay`) the MCP applies in `get_vip_report`
- ⚠️ **CRITICAL:** Verify the technical score `skill_mapper` calculation is replicated in MCP (the `Math.max(count, 3)` normalization is non-obvious)
- ⚠️ **Verify:** Does MCP return both AI report AND interviewer report data?
- ⚠️ **Verify:** Is `isOverwritten` honored in skill score calculation?
- ✅ Separate VIP API client (port 5005) used correctly
- ✅ VIP assessments auto-published (no publish step in MCP)
- ✅ Different status types (completed/scheduled/cancelled) handled
- ✅ Hiring stage update uses correct VIP endpoint
