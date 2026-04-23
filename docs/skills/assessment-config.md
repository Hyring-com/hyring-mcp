# Skill: Assessment Configuration & Publishing

**Applies to:** All assessment types (one-way, two-way, coding, verbal, phone, resume)
**Note:** VIP is auto-published - config/publish tools do NOT apply to VIP.
**MCP Tools:** `configure_assessment`, `review_assessment`, `publish_assessment`

---

## Configuration (`configure_assessment`)

**Endpoint:** PATCH `/employer/assessment/job-configuration/{employerId}`

### Availability Mode

**`flexi`** - Candidate can take any time within constraints:

| Constraint | Options |
|-----------|---------|
| `NO_EXPIRY` | Assessment never expires |
| `SET_DATE` | Expires on a specific date |
| `SET_RESPONSES_COUNT` | Closes after N responses (0-5000) |

**`schedule`** - Assessment runs in a specific time window:

| Field | Description |
|-------|-------------|
| `scheduleDate` | Date of the interview session |
| `startTime` | Session start time |
| `endTime` | Must be at least 30 min after startTime |
| `calendarDescription` | Google Calendar event description |
| `emailGoogleOauth` | Google OAuth email for calendar integration |
| `refreshToken` | Google refresh token |

### Scoring Weights

| Field | Description | Default |
|-------|-------------|---------|
| `technicalScore` | Weight % for technical score | 50 |
| `communicationScore` | Weight % for communication score | 50 |

**Must sum to 100%.**

### Proctoring Settings

| Setting | Description |
|---------|-------------|
| `tabChangeDetection` | Flag if candidate switches browser tabs |
| `faceDetection` | Detect if candidate is visible |
| `multipleFaceDetection` | Alert if multiple faces in frame |
| `multipleVoiceDetection` | Alert if multiple voices detected |
| `candidateVideo` | Enable/disable candidate video recording |
| `enableScreenShare` | Allow screen share (two-way only) |
| `lockAssessment` | Prevent candidate from leaving assessment screen |

### Notification Settings

| Setting | Description |
|---------|-------------|
| `emailNotifications` | Send email when candidate completes |
| `smsNotifications` | Send SMS notifications |

---

## Review (`review_assessment`)

**Endpoint:** GET `/employer/assessment/review/{id}`

Returns a complete summary of the assessment before publishing:
- Job details (title, description, skills, location, salary)
- Assessment type and configuration
- Questions list (for one-way, phone)
- Skill context (for two-way)
- Coding questions (for coding)
- Verbal context (for EPT)
- Resume criteria (for resume)
- Scoring weights
- Proctoring settings

**Use this before publishing to verify everything is correct.**

---

## Publishing (`publish_assessment`)

**Endpoint:** PATCH `/employer/assessment/status/{employerId}`

### Status Values

| Status | Description |
|--------|-------------|
| `PUBLISHED` | Live and accessible to candidates |
| `PAUSED` | Temporarily stopped (invites blocked) |
| `CLOSED` | No new responses accepted |
| `ARCHIVED` | Hidden from active lists |

### Workflow

```
DRAFT → [configure] → [review] → PUBLISHED
PUBLISHED → PAUSED → PUBLISHED
PUBLISHED → CLOSED
CLOSED → ARCHIVED
```

---

## Assessment Status in Listing

When listing assessments, status filter values:

| Filter | Description |
|--------|-------------|
| `active` | Currently published/running |
| `inactive` | Paused or closed |
| `drafts` | Not yet published |
| `archived` | Archived assessments |

**Endpoint:** GET `/assessment/{status}/{employerId}?skip=N&take=N&search=...`

---

## Common Mistakes to Avoid

1. **Publishing before adding content** - Always add questions/context/criteria before publishing.
2. **Setting schedule times without timezone** - Ensure times are in the correct timezone.
3. **Technical + Communication weights not summing to 100** - Validation enforced.
4. **Applying config to VIP** - VIP is auto-published; configure_assessment does not apply.

---

## Resume Screener - Criteria Minimum

Resume assessments have special validation:
- **Minimum 3 `MUST_HAVE` criteria** required before publishing
- **Maximum 3 `STARRED` criteria** allowed

This is enforced by the `set_screening_criteria` tool via Zod validation.
