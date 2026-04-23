# MCP Quick Reference

## All 52 Tools At a Glance

### Authentication
| Tool | Purpose |
|------|---------|
| `request_otp` | Send OTP to employer email |
| `verify_otp` | Verify OTP & save session |
| `whoami` | Get current employer profile |
| `logout` | Sign out |
| `token_status` | Check session status |

### Assessment Viewing (Screener)
| Tool | Purpose |
|------|---------|
| `list_assessments` | List by status (active/inactive/drafts/archived) |
| `get_assessment` | Full assessment details |
| `get_assessment_stats` | Candidate counts by status |

### Invitations
| Tool | Purpose |
|------|---------|
| `invite_candidate` | Send single invite |
| `bulk_invite` | Send bulk invites |

### Candidate Review
| Tool | Purpose |
|------|---------|
| `list_candidates` | List by status with pagination |
| `update_hiring_stage` | Set QUALIFIED/NOT_QUALIFIED/ON_HOLD |
| `send_reminder` | Email reminder to invited candidate |

### Candidate Results
| Tool | Purpose |
|------|---------|
| `list_attended_candidates` | Completed candidates with scores |
| `get_fixed_report` | One-way interview full report |
| `get_dynamic_report` | Two-way interview full report |
| `get_coding_report` | Coding interview full report |
| `get_verbal_report` | EPT/Verbal full report with CEFR |

### Phone Screener
| Tool | Purpose |
|------|---------|
| `list_phone_assessments` | List phone assessments |
| `get_phone_assessment_stats` | Candidate counts |
| `list_phone_candidates` | Candidates by status |
| `get_phone_report` | Full call report |
| `update_phone_hiring_stage` | Update stage |
| `send_phone_reminder` | Send reminder |

### Resume Screener
| Tool | Purpose |
|------|---------|
| `list_resume_assessments` | List resume assessments |
| `get_resume_assessment_stats` | Candidate counts |
| `list_resume_candidates` | Candidates by status |
| `get_resume_report` | Full resume screening report |
| `update_resume_hiring_stage` | Update stage |
| `send_resume_reminder` | Send reminder |

### VIP Live Interview
| Tool | Purpose |
|------|---------|
| `list_vip_assessments` | List VIP job roles |
| `get_vip_assessment_stats` | Interview counts |
| `list_vip_interviews` | Interviews by status |
| `get_vip_report` | Full interview report |
| `update_vip_hiring_stage` | Update stage |

### Assessment Configuration
| Tool | Purpose |
|------|---------|
| `configure_assessment` | Set availability, scoring, proctoring |
| `review_assessment` | Preview before publishing |
| `publish_assessment` | Change status (PUBLISHED/PAUSED/CLOSED/ARCHIVED) |

### Build: One-Way Interview
| Tool | Purpose |
|------|---------|
| `create_fixed_assessment` | Create (3 steps) |
| `list_questions` | List all questions |
| `add_question` | Add question (video/MCQ/text) |
| `edit_question` | Edit question |
| `delete_question` | Delete question |
| `generate_ai_questions` | AI-suggested questions from JD |

### Build: Two-Way Interview
| Tool | Purpose |
|------|---------|
| `create_dynamic_assessment` | Create (3 steps) |
| `set_interview_context` | Set 3-5 skills for AI to probe |

### Build: Coding Interview
| Tool | Purpose |
|------|---------|
| `create_coding_assessment` | Create (3 steps) |
| `set_coding_language` | Set programming language |
| `add_coding_question` | Add coding problem |

### Build: EPT/Verbal
| Tool | Purpose |
|------|---------|
| `create_verbal_assessment` | Create (3 steps) |
| `set_verbal_context` | Set 1-5 conversation topics |

### Build: Phone Screener
| Tool | Purpose |
|------|---------|
| `create_phone_assessment` | Create (3 steps) |
| `generate_phone_questions` | AI-suggested phone questions |
| `list_phone_questions` | List questions |
| `add_phone_question` | Add question (YES_NO/RATING/NUMERIC) |
| `edit_phone_question` | Edit question |
| `delete_phone_question` | Delete question |

### Build: Resume Screener
| Tool | Purpose |
|------|---------|
| `create_resume_assessment` | Create (3 steps) |
| `get_criteria_suggestions` | AI-suggested screening criteria |
| `set_screening_criteria` | Set final criteria list |

### Build: VIP Live Interview
| Tool | Purpose |
|------|---------|
| `create_vip_assessment` | Create (2 steps, auto-published) |

---

## Assessment Type Cheat Sheet

| Type | Key | Duration | Questions | Scoring |
|------|-----|----------|-----------|---------|
| One-Way | `fixed` | Sum of Q times | Pre-written, video/MCQ/text | Technical + Communication |
| Two-Way | `dynamic` | 10 min | AI-generated | Technical + Communication |
| Coding | `coding` | Sum of problem times | Coding problems | Code quality |
| EPT | `verbal` | 4 min | Topic prompts | CEFR level |
| Phone | `phone` | 5 min | YES_NO/RATING/NUMERIC | Match % + "Interview Worthy" |
| Resume | `resume` | 10 min (upload) | Criteria matching | Fit + Match % |
| VIP | `vip` | Live (varies) | Live interview | Technical + Communication + Interviewer |

---

## Key IDs

| ID | Type | Description |
|----|------|-------------|
| `assessmentId` | UUID string | Assessment identifier for most calls |
| `statusId` | Integer | Specific candidate's assessment attempt |
| `inviteId` | Integer | Specific invite sent to candidate |
| `employerId` | Integer | Auto-extracted from JWT token |

---

## API Base URLs

| Client | Production | Local Port |
|--------|-----------|-----------|
| Screener | `https://api-screener.hyring.com/api/v1` | 5000 |
| Phone | `https://phonescreener.hyring.com/api/v1` | 5003 |
| VIP | `https://api-vip.hyring.com/api/v1` | 5005 |

⚠️ **Current code is set to LOCAL. Switch to PRODUCTION before deployment.**

---

## Server Variants

| Binary | Use Case |
|--------|---------|
| `hyring-mcp` | Full featured |
| `hyring-mcp-fixed` | One-Way Interview only |
| `hyring-mcp-dynamic` | Two-Way Interview only |
| `hyring-mcp-coding` | Coding Interview only |
| `hyring-mcp-verbal` | EPT only |
| `hyring-mcp-phone` | Phone Screener only |
| `hyring-mcp-resume` | Resume Screener only |
| `hyring-mcp-vip` | VIP Interview only |
| `hyring-mcp-results` | View results only |
