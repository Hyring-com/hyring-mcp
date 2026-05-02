// ── Score label helpers ───────────────────────────────────────────────────────

/** Dynamic interview score (0-5 scale) → label — matches getScoreInfo in two.way.helper.js */
export function getDynamicScoreLabel(score: number | null | undefined): string {
  if (score == null) return "Score Not Applicable";
  if (score <= 1) return "Poor";
  if (score <= 2) return "Average";
  if (score <= 3) return "Fair";
  return "Perfect";
}

/** Format seconds as MM:SS - MM:SS range (matches formatTimeRange in TranscriptListPanel) */
export function formatMmSs(start: number | null | undefined, end: number | null | undefined): string | null {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };
  if (start == null && end == null) return null;
  if (start != null && end != null) return `${fmt(start)} - ${fmt(end)}`;
  return start != null ? fmt(start) : fmt(end!);
}

/** Format seconds as "Xm Ys" duration string */
export function formatDuration(secs: number | null | undefined): string {
  if (!secs) return "N/A";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Fit Score: 0-25=Weak Fit, 26-50=Moderate Fit, 51-75=Good Fit, 76+=Strong Fit */
export function getFitLabel(score: number): string {
  if (score <= 25) return "WEAK FIT";
  if (score <= 50) return "MODERATE FIT";
  if (score <= 75) return "GOOD FIT";
  return "STRONG FIT";
}

/** Technical/Communication % score: ≤30=Poor, ≤50=Below Avg., ≤70=Average, ≤90=Good, >90=Excellent */
export function getScoreLabel(score: number | string | null): string {
  if (score == null || score === "N/A") return "N/A";
  const n = parseFloat(String(score));
  if (isNaN(n)) return "N/A";
  if (n <= 30) return "POOR";
  if (n <= 50) return "BELOW AVG.";
  if (n <= 70) return "AVERAGE";
  if (n <= 90) return "GOOD";
  return "EXCELLENT";
}

/** Per-question score (0–10 scale) → label */
export function getQuestionLabel(score: number | null | undefined): string {
  if (score == null) return "Score Not Applicable";
  switch (Math.round(score)) {
    case 0:  return "Completely Incorrect";
    case 1:  return "Very Poor";
    case 2:  return "Poor";
    case 3:  return "Weak";
    case 4:  return "Below Average";
    case 5:  return "Average";
    case 6:  return "Fair";
    case 7:  return "Good";
    case 8:  return "Very Good";
    case 9:  return "Excellent";
    case 10: return "Perfect";
    default: return "Score Not Applicable";
  }
}

/** VIP per-question score (0–4 scale) → label */
export function getQuestionScoreLabel(score: number | null | undefined): string {
  if (score == null) return "N/A";
  if (score <= 0) return "Not Scored";
  if (score <= 1) return "Poor";
  if (score <= 2) return "Average";
  if (score <= 3) return "Fair";
  return "Perfect";
}

/** VIP understand_score (0–10 scale) → label */
export function getUnderstandLabel(score: number | null | undefined): string {
  if (score == null) return "N/A";
  if (score <= 2) return "Poor";
  if (score <= 4) return "Below Average";
  if (score <= 6) return "Average";
  if (score <= 8) return "Good";
  return "Excellent";
}

/** Format fit score line: "38% — MODERATE FIT" */
export function fitLine(score: number | null): string {
  if (score == null || isNaN(score)) return "N/A";
  const pct = Math.round(score);
  return `${pct}% — ${getFitLabel(pct)}`;
}

/** Format score line: "37% — BELOW AVG." */
export function scoreLine(score: number | string | null): string {
  if (score == null || score === "N/A") return "N/A";
  const n = parseFloat(String(score));
  if (isNaN(n)) return "N/A";
  return `${Math.round(n)}% — ${getScoreLabel(n)}`;
}

/** Stars display for 0-5 rating */
export function stars(rating: number | null, max = 5): string {
  if (rating == null) return "N/A";
  const r = Math.round(rating);
  return "★".repeat(r) + "☆".repeat(max - r) + ` (${rating}/${max})`;
}

export function na(v: any): string {
  return v != null && v !== "" ? String(v) : "N/A";
}

// ── Status / stage maps ───────────────────────────────────────────────────────

export const ASSESSMENT_STATUS: Record<string, string> = {
  PUBLISHED:       "Active",
  IN_ACTIVE:       "Inactive",
  ARCHIVED:        "Archived",
  DRAFT:           "Draft",
  LIPSYNC_PENDING: "Live Soon",
  AUDIO_PENDING:   "Live Soon",
  LIPSYNC_ERROR:   "Failed",
};

export const CANDIDATE_STATUS: Record<string, string> = {
  ENDED_ASSESSMENT:        "Completed",
  COMPLETED:               "Completed",
  ENDED_ASSESSMENT_RETAKE: "Completed (Retake)",
  CREATED:                 "Not Completed",
  CREATED_RETAKE:          "Not Completed (Retake)",
  DISQUALIFIED:            "Disqualified",
};

export const HIRING_STAGE: Record<string, string> = {
  NOT_YET_EVALUATED: "Pending Review",
  NOT_APPLICABLE:    "Not Applicable",
  ON_HOLD:           "On Hold",
  SHORTLISTED:       "Shortlisted",
  HIRED:             "Hired",
  REJECTED:          "Rejected",
};

export function mapStatus(v: any): string {
  if (!v) return "N/A";
  return CANDIDATE_STATUS[String(v)] ?? String(v);
}

export function mapStage(v: any): string {
  if (!v) return "N/A";
  return HIRING_STAGE[String(v)] ?? String(v);
}

export function fmtDate(d: any): string {
  if (!d) return "N/A";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return String(d); }
}

/** Parse AI summary: JSON array → bullet list, or plain string */
export function formatAISummary(summary: any): string {
  if (!summary) return "N/A";
  if (Array.isArray(summary)) {
    return summary.map((s: any, i: number) => `  ${i + 1}. ${s}`).join("\n");
  }
  if (typeof summary === "string") {
    try {
      const parsed = JSON.parse(summary);
      if (Array.isArray(parsed)) {
        return parsed.map((s: any, i: number) => `  ${i + 1}. ${s}`).join("\n");
      }
    } catch { /* not JSON */ }
    return summary.trim() || "N/A";
  }
  return JSON.stringify(summary);
}

/** Normalize 0-to-(totalAnswered×10) raw sum → 0-100% */
export function normalizeEngScore(raw: number, totalAnswered: number): number {
  if (!totalAnswered) return 0;
  return Math.round((raw / (totalAnswered * 10)) * 100);
}
