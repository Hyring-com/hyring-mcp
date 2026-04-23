# Skill: Resume Screener

**Assessment Type:** `resume`
**Backend Port:** 5000 (screener API)
**Frontend:** `hyring-resume-screener`

---

## What It Is

An AI-powered resume screening system. Employers define screening criteria, candidates upload their resumes (or are invited to do so), and the AI evaluates each resume against the criteria. Provides a fit score, skill match analysis, and detailed resume insights.

---

## Creation Flow (3 Steps)

```
Step 1: POST /employer/assessment/job-interview/{employerId}
  Body: { assessmentType: "resume", language }
  Response: { assessmentId (UUID), employerId }

Step 2: POST /employer/assessment/job-details/{employerId}
  Body: { assessmentId, jdText }

Step 3: PATCH /employer/assessment/job-details/{employerId}
  Body: { assessmentId, roleName, seniorityLevel, skills, ... }
```

**MCP Tool:** `create_resume_assessment` ✅

---

## Screening Criteria Setup

**MCP Tools:**
- `get_criteria_suggestions` - AI suggests criteria based on JD
- `set_screening_criteria` - Set final criteria list

### Criteria Types
| Property | Value |
|---------|-------|
| `type` | `MUST_HAVE` or `NICE_TO_HAVE` or `STARRED` |
| `criteria` | Requirement text (e.g., "3+ years Python experience") |

**Validation Rules:**
- Minimum 3 `MUST_HAVE` criteria required
- Maximum 3 `STARRED` criteria allowed

### Example Criteria
```json
[
  { "type": "MUST_HAVE", "criteria": "5+ years of React experience" },
  { "type": "MUST_HAVE", "criteria": "Experience with REST APIs" },
  { "type": "MUST_HAVE", "criteria": "Bachelor's degree in Computer Science or related" },
  { "type": "NICE_TO_HAVE", "criteria": "Experience with TypeScript" },
  { "type": "STARRED", "criteria": "Open source contributions" }
]
```

---

## Interview Duration

**Fixed:** 10 minutes (600 seconds) - this is resume upload time allotted.

---

## Two Ways Candidates Enter

1. **Invited (Outbound):** Employer sends invite link → candidate uploads resume
2. **Inbound:** Candidates apply via a public job link

---

## Result Data Structure

### Backend Fields

```json
{
  "statusId": "status-id",
  "status": "QUALIFIED",
  "resumeScore": 88,
  "matchPercentage": 92,
  "feedback": "Strong match for the role. Candidate has extensive React experience...",
  "resume_url": "https://...",
  "criteriaResults": [
    {
      "criteria": "5+ years of React experience",
      "type": "MUST_HAVE",
      "matched": true,
      "evidence": "Candidate has 6 years of React at Company X"
    },
    {
      "criteria": "Bachelor's degree",
      "type": "MUST_HAVE",
      "matched": true,
      "evidence": "BS Computer Science, State University"
    }
  ],
  "skillsMatched": ["React", "TypeScript", "Node.js"],
  "skillsNotFound": ["Docker", "Kubernetes"],
  "experienceYears": 6,
  "extractedData": {
    "name": "John Doe",
    "email": "john@example.com",
    "currentRole": "Senior Developer",
    "currentCompany": "Tech Corp",
    "education": "BS Computer Science"
  }
}
```

### ⚠️ Premium Features (Access-Gated)

The frontend checks `accessData.access.resumeAccess` for:
| Feature | Flag | Description |
|---------|------|-------------|
| Industry Exposure | `IndustryExposure` | Which industries candidate has worked in |
| Career Gap | `careeerGap` | Employment gaps analysis |
| Skill Depth Analysis | `skillDepthAnalysis` | Depth of skills, not just presence |
| Company Tier Analysis | `companyTierAnalysis` | Tier/prestige of past companies |

These premium insights are only shown if the employer's plan includes them.

### Frontend Calculations

1. **Fit score label (same as all products):**
   ```
   0-25   → WEAK FIT
   26-50  → MODERATE FIT
   51-75  → GOOD FIT
   76-100 → STRONG FIT
   ```

2. **Criteria match rate:**
   ```
   matchedMustHave = criteriaResults.filter(c => c.type === "MUST_HAVE" && c.matched).length
   totalMustHave = criteriaResults.filter(c => c.type === "MUST_HAVE").length
   ```

3. **Overall qualification:**
   ```
   qualified = ALL MUST_HAVE criteria matched
   ```

### MCP Tool
**`get_resume_report`** - Fetches and processes the above data.

---

## What the MCP Report Shows

- Candidate name, email
- Fit score (0-100) with label (WEAK/MODERATE/GOOD/STRONG FIT)
- Match percentage
- Qualification status (QUALIFIED/NOT_QUALIFIED)
- Per-criteria breakdown:
  - Criteria text and type (MUST_HAVE/NICE_TO_HAVE/STARRED)
  - Whether matched (true/false)
  - Evidence from resume
- Skills matched (list)
- Skills not found (list)
- Years of experience
- Extracted resume data (name, role, company, education)
- Resume download link
- AI feedback summary

---

## Candidate Status Types

| Status | Meaning |
|--------|---------|
| `all` | All candidates |
| `uploaded` | Resume submitted |
| `invited` | Invited but hasn't submitted |
| `inbound` | Applied via public link |
| `declined` | Declined invitation |

---

## Key Differences from Other Assessments

| Aspect | Resume Screener | Video/Phone |
|--------|----------------|-------------|
| Medium | Document (PDF/Doc) | Video/Audio |
| Interaction | None - async upload | Real-time |
| Scoring basis | Resume content vs criteria | AI interview evaluation |
| Key metric | Match % + criteria match | Fit score |
| Candidate input | Resume file | Video/Audio responses |
| Duration | 10 min (upload window) | 4-60 min |

---

## Missing / To Verify

- ⚠️ **Verify:** Does `get_resume_report` use `resumeScore` or `matchPercentage` as the primary fit score? These are different values.
- ⚠️ **Verify:** Are premium features (Industry Exposure, Career Gap, etc.) surfaced in MCP report? Or are they skipped?
- ⚠️ **Verify:** Does MCP correctly handle both inbound and invited candidate types?
- ⚠️ **Verify:** Is the resume download URL included in the MCP report?
- ✅ Criteria min/max validation in creation
- ✅ MUST_HAVE minimum 3 enforced
- ✅ Fit score labels applied
