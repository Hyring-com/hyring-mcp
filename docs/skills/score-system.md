# Skill: Score System & Labels

**Applies to:** All assessment types
**Purpose:** Document how raw backend scores map to user-facing labels and colors.

---

## Overview

Backend APIs return raw numeric scores. The frontend (and MCP) must apply label mappings to make these meaningful. This document is the single source of truth for all score label systems used across Hyring products.

---

## 1. Fit Score Labels (Universal)

Applies to the overall fit score (0-100) across ALL products.

| Range | Label | Color (Frontend) |
|-------|-------|-----------------|
| 0-25 | WEAK FIT | Red #FD3636 (1 bar) |
| 26-50 | MODERATE FIT | Orange #F5A544 (2 bars) |
| 51-75 | GOOD FIT | Green #84DC49 (3 bars) |
| 76-100 | STRONG FIT | Dark Green #2E931E (4 bars) |

---

## 2. General Score Labels (Subscores)

Applies to technical, communication, and dimensional scores (0-100).

| Range | Label | Color (Frontend) |
|-------|-------|-----------------|
| ≤30 | POOR | Red #EB3939 |
| ≤50 | BELOW AVG. | Orange #E17425 |
| ≤70 | AVERAGE | Blue #198FD1 |
| ≤90 | GOOD | Green #53B43B |
| >90 | EXCELLENT | Dark Green #05692F |

---

## 3. Per-Question Score Labels (0-10 scale)

Applies to individual question scores in one-way and two-way interviews.

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

---

## 4. VIP Individual Skill Score Labels (0-10 scale)

Used specifically for VIP skill ratings.

| Range | Label | Color |
|-------|-------|-------|
| null | N/A | Gray |
| ≤2 | Poor | Red #CC1919 |
| ≤4 | Average | Orange #E17425 |
| ≤6 | Fair | Blue #0479BA |
| ≤8 | Good | Green #3A9201 |
| >8 | Perfect | Dark Green #05692F |

---

## 5. CEFR Levels (EPT/Verbal Only)

Applies to English Proficiency Test overall score.

| Range | CEFR Level | Description |
|-------|-----------|-------------|
| 90-100 | C2 | Mastery |
| 80-89 | C1 | Advanced |
| 70-79 | B2 | Upper-Intermediate |
| 60-69 | B1 | Intermediate |
| 50-59 | A2 | Elementary |
| <50 | A1 | Beginner |

---

## 6. Phone Screener Score Labels

Same as general score labels but specifically for phone screener total score.

| Range | Label | Color |
|-------|-------|-------|
| 0 or N/A | N/A | Gray #6F7D71 |
| 1-30 | Poor | Red #EB3939 |
| 31-50 | Below Avg. | Orange #E17425 |
| 51-70 | Average | Blue #198FD1 |
| 71-90 | Good | Green #53B43B |
| 91-100 | Excellent | Dark Green #05692F |

---

## 7. Behavioral/Engagement Labels (Body Language)

Used in proctoring and integrity reports.

| Value | Category | Color |
|-------|----------|-------|
| upright | Posture | Green #05692F |
| slouched | Posture | Orange #BE7C2D |
| leaning | Posture | Red #CC1919 |
| consistent | Eye Contact | Green #05692F |
| occasional | Eye Contact | Orange #BE7C2D |
| avoiding | Eye Contact | Red #CC1919 |
| engaged | Engagement | Green #05692F |
| neutral | Engagement | Blue #0479BA |
| unresponsive | Engagement | Red #CC1919 |

---

## 8. Communication Analysis Labels

| Value | Color |
|-------|-------|
| poor | Red #CC1919 |
| average | Orange #BE7C2D |
| good | Green #3A9201 |
| excellent | Dark Green #05692F |

---

## 9. Cognitive/Knowledge Labels

| Value | Color |
|-------|-------|
| weak | Red #CC1919 |
| basic | Orange #BE7C2D |
| strong | Green #3A9201 |
| expert | Dark Green #05692F |

---

## 10. Response Structure Labels

| Value | Color |
|-------|-------|
| unstructured | Red #CC1919 |
| moderate | Blue #0479BA |
| structured | Green #05692F |

---

## Score Color Bands (General)

| Range | Background Color |
|-------|----------------|
| 0-50% | Red #FF9595 |
| 51-75% | Orange #FFB65E |
| 76-100% | Green #B0EA8B |

---

## Fit Score Calculation (How It's Computed)

For products with both technical and communication scores:

```
fit_score = (technical_score × technical_weight%)
          + (communication_score × communication_weight%)

Default: 50% technical + 50% communication
```

Employers can configure different weights in `configure_assessment`.

---

## Score Override (Manual Override)

Employers can manually override AI-assigned scores. The backend tracks:
- `isOverwritten: boolean`
- `overWrittenScore: number`
- `overWrittenDate: timestamp`
- `overWrittenBy: string`

**Rule:** If `isOverwritten === true`, always use `overWrittenScore` instead of the AI's `score`.

This applies to:
- One-way interview questions
- Two-way interview skill conversations
- VIP skill conversations

---

## "Interview Worthy" (Phone Screener Only)

This is a binary determination unique to phone screening:

```
interviewWorthy = ALL questions with priority="MUST_HAVE" have matched=true
```

If any MUST_HAVE question has `matched=false` → NOT Interview Worthy.

This is the primary qualification signal for phone screener reports.
