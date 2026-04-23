# Skill: Candidate Management

**Applies to:** All assessment types
**MCP Tools:** `invite_candidate`, `bulk_invite`, `list_candidates`, `update_hiring_stage`, `send_reminder`

---

## Inviting Candidates

### Single Invite (`invite_candidate`)

**Endpoint:** POST `/employer/assessment/invite/{employerId}`

```json
{
  "assessmentId": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "mobile": "+1234567890",
  "countryCode": "+1",
  "expiresAt": "2024-02-15T23:59:59Z"
}
```

**`expiresAt` is optional.** If not set, the assessment's default constraint applies (NO_EXPIRY / SET_DATE / SET_RESPONSES_COUNT).

### Bulk Invite (`bulk_invite`)

**Endpoint:** POST `/employer/assessment/invite/bulk/{employerId}`

```json
{
  "assessmentId": "uuid",
  "candidates": [
    { "name": "Alice", "email": "alice@example.com" },
    { "name": "Bob", "email": "bob@example.com" }
  ]
}
```

**Supported formats:** Array of name+email pairs.

---

## Listing Candidates

### `list_candidates`

**Endpoint:** GET `/assessment/view/{status}/{assessmentId}`

Supported status values:

| Status | Who Shows Up |
|--------|-------------|
| `completed` | Candidates who finished the assessment |
| `invited` | Candidates who received invite but haven't started |
| `started` | Candidates currently in progress |
| `declined` | Candidates who declined the invite |
| `not_qualified` | Candidates marked Not Qualified by employer |

**Pagination:** `skip` and `take` params supported.

### Data Returned Per Candidate

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "status": "completed",
  "invitedAt": "2024-01-10T10:00:00Z",
  "completedAt": "2024-01-12T14:30:00Z",
  "totalScore": 82.5,
  "hiringStage": "QUALIFIED",
  "statusId": 12345
}
```

> **Key:** `statusId` is needed to fetch individual candidate reports.

---

## Listing Attended Candidates with Scores

### `list_attended_candidates`

**Endpoint:** GET `/assessment/view/attended/{assessmentId}`

Returns more detailed data for completed candidates:
- Score breakdown (technical, communication)
- Hiring stage
- statusId for fetching full report

---

## Updating Hiring Stage

### `update_hiring_stage`

**Endpoint:** PATCH `/assessment/result-change`

```json
{
  "statusId": 12345,
  "hiringStage": "QUALIFIED",
  "rejectReason": null
}
```

**Hiring Stage Options:**

| Stage | Meaning |
|-------|---------|
| `QUALIFIED` | Move candidate forward |
| `NOT_QUALIFIED` | Reject candidate |
| `ON_HOLD` | Keep under consideration |

**When setting `NOT_QUALIFIED`**, a `rejectReason` can optionally be provided.

---

## Sending Reminders

### `send_reminder`

**Endpoint:** PATCH `/assessment/send-reminder/{inviteId}`

Sends a reminder email to a candidate who has been invited but hasn't started.

> **Note:** You need the `inviteId`, not the `statusId`. These are different IDs.

---

## Product-Specific Candidate Tools

For phone, resume, and VIP, use their dedicated tools:

| Tool | Product | Update Hiring Stage | Send Reminder |
|------|---------|--------------------|----|
| `update_phone_hiring_stage` | Phone | ✅ | via `send_phone_reminder` |
| `update_resume_hiring_stage` | Resume | ✅ | via `send_resume_reminder` |
| `update_vip_hiring_stage` | VIP | ✅ | No reminder tool |

---

## Missing Operations (Not in MCP)

### Cancel Invite
**Backend endpoint exists:** PATCH `/employer/assessment/invite/status-change/{id}`

No MCP tool to cancel an invite. Once sent, the invite can only be reminded (not cancelled) via MCP.

### Check Bulk Invite Status
**Backend endpoint exists:** POST `/employer/assessment/invite/check/bulk/{id}`

After bulk inviting, there's no way in MCP to verify which invites sent successfully and which failed.

### Resend Invite
The backend tracks `invitedCount` and `resendInvitedAt` - resending is possible but no explicit MCP tool exists beyond `send_reminder`.

---

## Hiring Stage Definitions

| Stage | Action | Next Steps |
|-------|--------|-----------|
| `QUALIFIED` | Shortlisted for next round | Schedule further interviews |
| `NOT_QUALIFIED` | Rejected | No further action |
| `ON_HOLD` | Keeping in consideration | Review again later |

---

## Key IDs to Track

| ID | Type | Where Used |
|----|------|-----------|
| `assessmentId` | UUID string | Most API calls |
| `statusId` | Integer | Fetching reports, updating hiring stage |
| `inviteId` | Integer | Sending reminders |
| `employerId` | Integer | Extracted from JWT token |
