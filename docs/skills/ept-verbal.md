# Skill: English Proficiency Test (EPT / Verbal)

**Assessment Type:** `verbal`
**Backend Port:** 5000 (screener API)
**Frontend:** `ai-screener-frontend` (separate `/verbal/` route)

---

## What It Is

An automated English language proficiency assessment. Candidates speak on given topics and the AI evaluates their English across 5 dimensions: Pronunciation, Grammar, Vocabulary, Fluency, and Filler Words. Results are mapped to the international CEFR scale.

---

## Creation Flow (3 Steps)

```
Step 1: POST /employer/assessment/job-interview/{employerId}
  Body: { assessmentType: "verbal", language: "en" }
  Response: { assessmentId (UUID), employerId }

Step 2: POST /employer/assessment/job-details/{employerId}
  Body: { assessmentId, jdText }
  Response: { status: "JD_UPDATED" }

Step 3: PATCH /employer/assessment/job-details/{employerId}
  Body: {
    assessmentId,
    roleName, seniorityLevel, employmentType,
    workPlaceType, jobLocationCountry, jobLocationCity,
    skills, currency
  }
  Response: { status: "JOB_DETAILS_UPDATED" }
```

**MCP Tool:** `create_verbal_assessment` ✅

> **Note:** EPT has a separate creation route in the frontend (`/verbal/`). However, the backend uses the same endpoints as other assessment types.

---

## Conversation Topics Setup

**MCP Tool:** `set_verbal_context`
**Endpoint:** POST `/employer/assessment/create-verbal-context/{employerId}`

Employers select 1-5 topics for candidates to speak about.

### Predefined Topics
| Topic | Description |
|-------|-------------|
| `Self Introduction` | Tell us about yourself |
| `Work` | Your professional experience |
| `Hobbies` | What you enjoy outside work |
| `Career Goals` | Your ambitions and plans |
| `Home Town` | Where you're from |
| `Daily Routine` | Your typical day |

Custom topics can also be added.

---

## Interview Duration

**Fixed:** 4 minutes (240 seconds) regardless of topic count.

---

## Result Data Structure

### Backend Fields

The EPT result uses the same `HyringScreenerResult` model but with English-specific fields:

```json
{
  "results": [
    {
      "topic": "Self Introduction",
      "transcript": "Hello, my name is...",
      "english_score": 82,
      "english_vocabulary": 80,
      "english_fluency": 85,
      "english_pronunciation": 78,
      "english_filler_words": 3,
      "grammar_score": 84,
      "pronounciation_score": 78,
      "fluency_score": 85,
      "vocabulary_score": 80,
      "words": [
        { "word": "um", "count": 3, "type": "filler" },
        { "word": "actually", "count": 5, "type": "filler" }
      ]
    }
  ],
  "totalScore": 82,
  "accentAnalysis": {
    "detected_accent": "Indian English",
    "country_code": "IN",
    "motherTongueInfluence": "Moderate"
  },
  "ai_summary": "The candidate demonstrates B2 level English..."
}
```

### Frontend Calculations

1. **CEFR Level Mapping (from `english_score` or `totalScore`):**
   ```
   90-100 → C2 - Mastery
   80-89  → C1 - Advanced
   70-79  → B2 - Upper-Intermediate
   60-69  → B1 - Intermediate
   50-59  → A2 - Elementary
   <50    → A1 - Beginner
   ```

2. **Per-dimension scores (0-100):**
   All scores already come as 0-100 from backend. No normalization needed.

3. **Filler word detection:**
   Words array shows detected filler words with counts.

4. **Fit score label:**
   - 0-25 → WEAK FIT
   - 26-50 → MODERATE FIT
   - 51-75 → GOOD FIT
   - 76-100 → STRONG FIT

5. **General score label (applies to each dimension):**
   - ≤30 → POOR
   - ≤50 → BELOW AVG.
   - ≤70 → AVERAGE
   - ≤90 → GOOD
   - >90 → EXCELLENT

### MCP Tool
**`get_verbal_report`** - Fetches data and applies CEFR mapping + labels.

---

## What the MCP Report Shows

- Candidate name, email, completion status
- Overall English score (0-100) with CEFR level (A1-C2)
- Per-dimension breakdown with labels:
  - Pronunciation score + label
  - Grammar score + label
  - Vocabulary score + label
  - Fluency score + label
  - Filler Words count + label
- Per-topic breakdown:
  - Topic name
  - Transcript of what candidate said
  - Detected filler words
- Accent analysis:
  - Detected accent
  - Country code
  - Mother tongue influence
- AI-generated summary
- Fraud/integrity insights (verbal)

---

## Key Differences from Other Assessments

| Aspect | EPT/Verbal | One-Way | Two-Way |
|--------|------------|---------|---------|
| Questions | Topic prompts | Pre-written Q's | AI-generated |
| Scoring focus | Language metrics | Technical + Comm | Technical + Comm |
| Duration | 4 min fixed | Sum of Q times | 10 min fixed |
| Output level | CEFR level | Fit score | Fit score |
| Filler words | ✅ Tracked | ❌ | ❌ |
| Mother tongue | ✅ Tracked | ❌ | ❌ |

---

## Score Weights (Configurable)

Default weights (each 20%):
- Turn Initiative
- Fluency
- Grammar
- Vocabulary
- Pronunciation

These weights can be adjusted in `configure_assessment` for EPT assessments.

---

## Missing / To Verify

- ⚠️ **Verify:** Does `get_verbal_report` use `english_score` or `totalScore` for CEFR mapping? These may differ.
- ⚠️ **Verify:** Are individual filler words listed in the MCP report or just the count?
- ⚠️ **Verify:** Is `motherTongueInfluence` surfaced in the report?
- ✅ CEFR level mapping is implemented correctly
- ✅ Per-dimension labels applied
- ✅ Accent analysis included
