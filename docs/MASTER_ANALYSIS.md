# Hyring MCP - Master Analysis Document

**Date:** 2026-04-23
**Scope:** Full analysis of all repos - MCP, AI Screener, Mono Backend, Phone Screener, Resume Screener, VIP UI

---

## 1. System Architecture Overview

Hyring is a multi-product HR screening platform. The MCP server exposes tools that allow AI agents (Claude) to operate as a fully functional hiring workflow manager.

### Products

| Product | Frontend Repo | Backend Port | Assessment Type Key |
|---------|--------------|-------------|-------------------|
| One-Way Interview | ai-screener-frontend | 5000 | `fixed` |
| Two-Way AI Interview | ai-screener-frontend | 5000 | `dynamic` |
| Coding Interview | ai-screener-frontend | 5000 | `coding` |
| English Proficiency Test | ai-screener-frontend | 5000 | `verbal` |
| Phone Screener | phone-screener-frontend | 5003 | `phone` |
| Resume Screener | hyring-resume-screener | 5000 | `resume` |
| VIP Live Interview | VIP-UI | 5005 | `vip` |

### Three Backend APIs

| API | Base URL (Prod) | Port (Local) |
|-----|----------------|-------------|
| Main Screener | `https://api-screener.hyring.com/api/v1` | 5000 |
| Phone Screener | `https://phonescreener.hyring.com/api/v1` | 5003 |
| VIP | `https://api-vip.hyring.com/api/v1` | 5005 |

---

## 2. MCP Architecture

### Entry Points (`src/bin/`)

| Binary | Server Name | Tools Included |
|--------|------------|---------------|
| `full.ts` | All tools | Every tool across all products |
| `fixed.ts` | One-Way only | Auth + Assessment + Fixed Build + Shared + Invite |
| `dynamic.ts` | Two-Way only | Auth + Assessment + Dynamic Build + Shared + Invite |
| `coding.ts` | Coding only | Auth + Assessment + Coding Build + Shared + Invite |
| `verbal.ts` | EPT only | Auth + Assessment + Verbal Build + Shared + Invite |
| `phone.ts` | Phone only | Auth + Phone Build + Phone View + Shared + Invite |
| `resume.ts` | Resume only | Auth + Resume Build + Resume View + Shared + Invite |
| `vip.ts` | VIP only | Auth + VIP Build + VIP View |
| `results.ts` | Results only | Auth + Assessment + Candidate Review + Candidate Results |

> ⚠️ **Gap:** The `results.ts` server does NOT include phone/resume/VIP result viewing tools. A recruiter using the results server cannot see phone, resume, or VIP reports.

### API Clients (`src/api/`)

| Client | Target | Auth |
|--------|--------|------|
| `screenerClient` | Main API (port 5000) | Bearer JWT via interceptor |
| `phoneClient` | Phone API (port 5003) | Bearer JWT via interceptor |
| `vipClient` | VIP API (port 5005) | Bearer JWT via interceptor |

### Tool Files

```
src/tools/
├── auth.tools.ts                    # 5 tools
├── assessment.view.tools.ts         # 3 tools
├── candidate.invite.tools.ts        # 2 tools
├── candidate.review.tools.ts        # 3 tools
├── candidate.results.tools.ts       # 5 tools (4 report types + 1 list)
├── phone.view.tools.ts              # 5 tools (removed update_phone_hiring_stage)
├── resume.view.tools.ts             # 5 tools (removed update_resume_hiring_stage)
├── vip.view.tools.ts                # 5 tools
└── build/
    ├── shared.tools.ts              # 3 tools (configure, review, publish)
    ├── fixed.tools.ts               # 6 tools
    ├── dynamic.tools.ts             # 2 tools
    ├── coding.tools.ts              # 3 tools
    ├── verbal.tools.ts              # 2 tools
    ├── phone.tools.ts               # 6 tools
    ├── resume.tools.ts              # 3 tools
    └── vip.tools.ts                 # 1 tool
```

**Total: ~57 tools** across all files.

---

## 3. Complete Tool Inventory

### Authentication (5 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `request_otp` | POST | `/employer/cat/sign-in/initiate-otp` |
| `verify_otp` | POST | `/employer/cat/sign-in/verify-otp` |
| `whoami` | GET | `/employer/cat/me` |
| `logout` | local | removes `~/.hyring/credentials.json` |
| `token_status` | local | reads credentials file + JWT decode |

### Assessment Viewing (3 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `list_assessments` | GET | `/assessment/{status}/{employerId}` |
| `get_assessment` | GET | `/employer/assessment/review/{id}` |
| `get_assessment_stats` | GET | `/assessment/assessment-stats/{id}` |

### Candidate Invitations (2 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `invite_candidate` | POST | `/employer/assessment/invite/{employerId}` |
| `bulk_invite` | POST | `/employer/assessment/invite/bulk/{employerId}` |

### Candidate Review (3 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `list_candidates` | GET | `/assessment/view/{status}/{assessmentId}` |
| `update_hiring_stage` | PATCH | `/assessment/result-change` |
| `send_reminder` | PATCH | `/assessment/send-reminder/{inviteId}` |

### Candidate Results (5 tools)
> ℹ️ EPT/Verbal has NO hiring stage — candidates are AI-determined Qualified/Not Qualified only (score ≥ qualificationCriteria min).

| Tool | Method | Endpoint |
|------|--------|---------|
| `list_attended_candidates` | GET | `/assessment/view/attended/{assessmentId}` |
| `get_fixed_report` | POST | `/assessment/result` |
| `get_dynamic_report` | POST | `/assessment/result` |
| `get_coding_report` | POST | `/assessment/result/coding` |
| `get_verbal_report` | POST | `/assessment/result` |

### Phone Screener View (5 tools)
> ℹ️ Phone Screener has NO hiring stage — candidates are AI-determined Qualified/Not Qualified only.

| Tool | Method | Endpoint |
|------|--------|---------|
| `list_phone_assessments` | GET | `phoneApi/report/view/stats/{employerId}` |
| `get_phone_assessment_stats` | GET | `phoneApi/report/view/stats/{id}` |
| `list_phone_candidates` | GET | `phoneApi/report/view/{status}/{id}` |
| `get_phone_report` | GET | `phoneApi/report/view/...` |
| `send_phone_reminder` | PATCH | `phoneApi/report/send-reminder/{employerId}` |

### Resume Screener View (5 tools)
> ℹ️ Resume Screener has NO hiring stage — candidates are AI-determined Qualified/Not Qualified only.

| Tool | Method | Endpoint |
|------|--------|---------|
| `list_resume_assessments` | GET | `/assessment/{status}/{employerId}?resume=true` |
| `get_resume_assessment_stats` | GET | `/details/employer/view/assessment-stats/{id}` |
| `list_resume_candidates` | GET | `/details/employer/view/{status}/{id}` |
| `get_resume_report` | GET | `/screener/rs-report/{employerId}?status={statusId}` |
| `send_resume_reminder` | PATCH | `/details/employer/resume/invite/send-reminder/{employerId}` |

### VIP View (5 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `list_vip_assessments` | GET | `vipApi/vip/interview/assessments/{status}/{employerId}` |
| `get_vip_assessment_stats` | GET | `vipApi/details/interview/stats/{employerId}` |
| `list_vip_interviews` | GET | `vipApi/details/interview/{status}/{employerId}` |
| `get_vip_report` | GET | `vipApi/vip/interview/report/{statusId}` |
| `update_vip_hiring_stage` | POST | `vipApi/details/change/hyring-stage/{employerId}` |

### Build Tools - Shared (3 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `configure_assessment` | PATCH | `/employer/assessment/job-configuration/{employerId}` |
| `review_assessment` | GET | `/employer/assessment/review/{id}` |
| `publish_assessment` | PATCH | `/employer/assessment/status/{employerId}` |

### Build Tools - One-Way Fixed (6 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `create_fixed_assessment` | POST + POST + PATCH | 3-step creation flow |
| `list_questions` | GET | `/employer/assessment/questions/{employerId}` |
| `add_question` | POST | `/employer/assessment/add-question/{employerId}` |
| `edit_question` | PATCH | `/employer/assessment/edit-question/{employerId}` |
| `delete_question` | DELETE | `/employer/assessment/delete-question/{employerId}` |
| `generate_ai_questions` | POST | `/employer/assessment/ai-questions/{employerId}` |

### Build Tools - Two-Way Dynamic (2 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `create_dynamic_assessment` | POST + POST + PATCH | 3-step creation flow |
| `set_interview_context` | POST | `/employer/assessment/create-context/{employerId}` |

### Build Tools - Coding (3 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `create_coding_assessment` | POST + POST + PATCH | 3-step creation flow |
| `set_coding_language` | PATCH | `/employer/assessment/coding-language/{employerId}` |
| `add_coding_question` | POST | `/employer/assessment/add-coding-questions/{employerId}` |

### Build Tools - Verbal/EPT (2 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `create_verbal_assessment` | POST + POST + PATCH | 3-step creation flow |
| `set_verbal_context` | POST | `/employer/assessment/create-verbal-context/{employerId}` |

### Build Tools - Phone (6 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `create_phone_assessment` | POST + POST + PATCH | 3-step creation flow |
| `generate_phone_questions` | POST | `phoneApi/employer/questions/generate/{id}` |
| `list_phone_questions` | GET | `phoneApi/employer/questions/{id}` |
| `add_phone_question` | POST | `phoneApi/employer/questions/{id}` |
| `edit_phone_question` | PATCH | `phoneApi/employer/questions/{id}` |
| `delete_phone_question` | DELETE | `phoneApi/employer/questions/{id}` |

### Build Tools - Resume (3 tools)
| Tool | Method | Endpoint |
|------|--------|---------|
| `create_resume_assessment` | POST + POST + PATCH | 3-step creation flow |
| `get_criteria_suggestions` | POST | screener API |
| `set_screening_criteria` | PATCH | screener API |

### Build Tools - VIP (1 tool)
| Tool | Method | Endpoint |
|------|--------|---------|
| `create_vip_assessment` | POST + PATCH | 2-step creation (auto-published) |

---

## 4. Score Label System (Built in MCP)

### Fit Score Labels (0-100%)
| Range | Label |
|-------|-------|
| 0-25 | WEAK FIT |
| 26-50 | MODERATE FIT |
| 51-75 | GOOD FIT |
| 76-100 | STRONG FIT |

### General Score Labels
| Range | Label |
|-------|-------|
| ≤30 | POOR |
| ≤50 | BELOW AVG. |
| ≤70 | AVERAGE |
| ≤90 | GOOD |
| >90 | EXCELLENT |

### Per-Question Score Labels (0-10)
| Score | Label |
|-------|-------|
| 0 | Completely Incorrect |
| 1 | Very Poor |
| 2 | Poor |
| 3 | Weak |
| 4 | Below Average |
| 5 | Average |
| 6 | Fair |
| 7 | Good |
| 8 | Very Good |
| 9 | Excellent |
| 10 | Perfect |

### CEFR Levels (Verbal/EPT)
| Range | Level |
|-------|-------|
| 90-100 | C2 - Mastery |
| 80-89 | C1 - Advanced |
| 70-79 | B2 - Upper-Intermediate |
| 60-69 | B1 - Intermediate |
| 50-59 | A2 - Elementary |
| <50 | A1 - Beginner |

---

## 5. Frontend vs MCP Score Alignment

The frontend does calculations on raw backend data before rendering. The MCP must replicate those calculations to present meaningful data to the AI agent.

| Calculation | Frontend Location | MCP Coverage |
|-------------|-------------------|-------------|
| Fit Score label (WEAK/MODERATE/GOOD/STRONG) | `common-helper.jsx` | ✅ Done |
| General score label (POOR/BELOW AVG/AVERAGE/GOOD/EXCELLENT) | `common-helper.jsx` | ✅ Done |
| Per-question score label (0-10 text) | `common-helper.jsx` | ✅ Done |
| CEFR level mapping | `common-helper.jsx` | ✅ Done |
| Phone score comment (color+label) | `phone-report-helper.jsx` | ✅ Done in `get_phone_report` |
| Phone "Interview Worthy" (all MUST_HAVE matched) | `technical-score-card.jsx` | ⚠️ Needs verification |
| VIP fit score weighted calc | `communication-helper.js` | ⚠️ Needs verification |
| VIP skill score averaging | `vip-report-helper.jsx` | ⚠️ Needs verification |
| Resume fit score | `fitscore-resume.jsx` | ⚠️ Needs verification |
| Completion rate (answered/total * 100) | Multiple pages | ✅ Done |
| Show/hide communication (≥30% completion) | Report page | ✅ Done |

---

## 6. Backend Data Flow

### Standard Assessment Lifecycle
```
Employer creates → Assessment (DRAFT)
               ↓
         Add content (questions/skills/criteria)
               ↓
         Configure (availability, expiry, proctoring)
               ↓
         Publish → Assessment (PUBLISHED)
               ↓
         Invite candidates
               ↓
         Candidates take assessment → Status records created
               ↓
         Results scored by AI
               ↓
         Employer reviews → Update hiring stage
```

### Key IDs
- **`assessmentId`** = UUID (used in most API calls)
- **`statusId`** = Integer (identifies a specific candidate's attempt)
- **`inviteId`** = Integer (identifies a specific invite sent to candidate)
- **`employerId`** = Integer (employer's ID, extracted from JWT)

---

## 7. Credentials & Auth

- **Token storage:** `~/.hyring/credentials.json`
- **Format:** `{ token, email, savedAt }`
- **Permissions:** `0o600`
- **Token type:** JWT (decoded locally for expiry + employerId extraction)
- **Header:** `Authorization: Bearer {token}`

---

## 8. Bugs Fixed (2026-04-23)

| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | `candidate.review.tools.ts` | Retake endpoint wrong path: `/assessment/view/retake/` | Fixed to `/assessment/view/retake-request/` |
| 2 | `vip.view.tools.ts` | VIP hiring stage enum values wrong: `SHORTLISTED/REJECTED/ON_HOLD/NOT_APPLICABLE` | Fixed to `SHORTLIST/REJECT/HOLD` (backend enum values) |
| 3 | `build/shared.tools.ts` | `configure_assessment` payload incorrectly included `availability` field | Removed — frontend only sends `scheduleAssessment: boolean` |
| 4 | `build/shared.tools.ts` | `scheduleAssessment` hardcoded to `true` | Fixed to `scheduleAssessment: isSchedule` |
| 5 | `resume.view.tools.ts` | `send_resume_reminder` sent `seekerIds: number[]` array | Fixed to `seekerId: number` (single, matching frontend) |
| 6 | `resume.view.tools.ts` | `update_resume_hiring_stage` tool existed — resume has no hiring stage | Removed entirely |
| 7 | `phone.view.tools.ts` | `update_phone_hiring_stage` tool existed — phone has no hiring stage | Removed entirely |
| 8 | `candidate.results.tools.ts` | EPT/Verbal report showed `Hiring Stage` line — EPT uses Qualified/Not Qualified | Removed hiring stage line |
| 9 | `build/fixed.tools.ts` | `edit_question` had wrong `answerType` enum: `Voice/Video/Mcq` | Fixed to `Video/Mcq/Text` (matching `add_question`) |

## 9. Qualification Logic by Product

| Product | Hiring Stage? | Qualified Status? |
|---------|--------------|------------------|
| One-Way (fixed) | ✅ SHORTLISTED/HIRED/REJECTED/ON_HOLD | ❌ |
| Two-Way (dynamic) | ✅ SHORTLISTED/HIRED/REJECTED/ON_HOLD | ❌ |
| Coding | ✅ SHORTLISTED/HIRED/REJECTED/ON_HOLD | ❌ |
| EPT/Verbal | ❌ | ✅ AI-determined (score ≥ qualificationCriteria min) |
| Phone Screener | ❌ | ✅ AI-determined (MUST_HAVE criteria match) |
| Resume Screener | ❌ | ✅ AI-determined (MUST_HAVE criteria match) |
| VIP Live Interview | ✅ SHORTLIST/REJECT/HOLD | ❌ |
