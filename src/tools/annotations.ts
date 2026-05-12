import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: true };
const ADD: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
const DESTRUCTIVE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  request_otp:               { ...ADD,         title: "Send Sign-in OTP" },
  verify_otp:                { ...ADD,         title: "Verify Sign-in OTP" },
  whoami:                    { ...READ,        title: "Show Signed-in User" },
  logout:                    { ...DESTRUCTIVE, title: "Sign Out" },
  token_status:              { ...READ,        title: "Check Session Status" },

  // ── Assessments (shared) ────────────────────────────────────────────────────
  list_assessments:          { ...READ, title: "List Assessments" },
  get_assessment:            { ...READ, title: "Get Assessment Details" },
  get_assessment_stats:      { ...READ, title: "Get Assessment Statistics" },

  // ── Candidates (shared: fixed / dynamic / coding / verbal) ──────────────────
  list_candidates:           { ...READ,        title: "List Candidates" },
  list_attended_candidates:  { ...READ,        title: "List Completed Candidates" },
  update_hiring_stage:       { ...DESTRUCTIVE, title: "Update Candidate Hiring Stage" },
  send_reminder:             { ...ADD,         title: "Send Candidate Reminder" },
  invite_candidate:          { ...ADD,         title: "Invite Candidate" },
  bulk_invite:               { ...ADD,         title: "Bulk Invite Candidates" },

  // ── Reports ─────────────────────────────────────────────────────────────────
  get_fixed_report:          { ...READ, title: "Get AI Video Interviewer (One-Way) Report" },
  get_dynamic_report:        { ...READ, title: "Get AI Video Interviewer (Two-Way) Report" },
  get_coding_report:         { ...READ, title: "Get AI Coding Interviewer Report" },
  get_verbal_report:         { ...READ, title: "Get English Proficiency Test Report" },

  // ── AI Phone Screener ──────────────────────────────────────────────────────
  list_phone_assessments:    { ...READ, title: "List AI Phone Screener Assessments" },
  get_phone_assessment_stats:{ ...READ, title: "Get AI Phone Screener Statistics" },
  list_phone_candidates:     { ...READ, title: "List AI Phone Screener Candidates" },
  get_phone_report:          { ...READ, title: "Get AI Phone Screener Report" },
  send_phone_reminder:       { ...ADD,  title: "Send AI Phone Screener Reminder" },

  // ── AI Resume Screener ─────────────────────────────────────────────────────
  list_resume_assessments:   { ...READ, title: "List AI Resume Screener Assessments" },
  get_resume_assessment_stats:{ ...READ, title: "Get AI Resume Screener Statistics" },
  list_resume_candidates:    { ...READ, title: "List AI Resume Screener Candidates" },
  get_resume_report:         { ...READ, title: "Get AI Resume Screener Report" },
  send_resume_reminder:      { ...ADD,  title: "Send AI Resume Screener Reminder" },

  // ── Virtual Interview Platform ─────────────────────────────────────────────
  list_vip_assessments:      { ...READ,        title: "List Virtual Interview Platform Roles" },
  get_vip_assessment_stats:  { ...READ,        title: "Get Virtual Interview Platform Statistics" },
  list_vip_interviews:       { ...READ,        title: "List Virtual Interview Platform Interviews" },
  get_vip_report:            { ...READ,        title: "Get Virtual Interview Platform Report" },
  update_vip_hiring_stage:   { ...DESTRUCTIVE, title: "Update VIP Candidate Stage" },

  // ── Assessment builders (create) ───────────────────────────────────────────
  create_fixed_assessment:   { ...ADD, title: "Create AI Video Interviewer (One-Way) Assessment" },
  create_dynamic_assessment: { ...ADD, title: "Create AI Video Interviewer (Two-Way) Assessment" },
  create_coding_assessment:  { ...ADD, title: "Create AI Coding Interviewer Assessment" },
  create_verbal_assessment:  { ...ADD, title: "Create English Proficiency Test Assessment" },
  create_phone_assessment:   { ...ADD, title: "Create AI Phone Screener Assessment" },
  create_resume_assessment:  { ...ADD, title: "Create AI Resume Screener Assessment" },
  create_vip_assessment:     { ...ADD, title: "Create Virtual Interview Platform Role" },

  // ── Assessment configuration & publishing (shared) ─────────────────────────
  configure_assessment:      { ...ADD, title: "Configure Assessment Settings" },
  publish_assessment:        { ...ADD, title: "Publish Assessment" },
  review_assessment:         { ...READ, title: "Review Assessment Before Publishing" },

  // ── Questions ──────────────────────────────────────────────────────────────
  add_question:              { ...ADD,         title: "Add Question" },
  list_questions:            { ...READ,        title: "List Assessment Questions" },
  edit_question:             { ...DESTRUCTIVE, title: "Edit Question" },
  delete_question:           { ...DESTRUCTIVE, title: "Delete Question" },
  add_coding_question:       { ...ADD,         title: "Add Coding Question" },
  add_phone_question:        { ...ADD,         title: "Add Phone Screening Question" },
  list_phone_questions:      { ...READ,        title: "List Phone Screening Questions" },
  edit_phone_question:       { ...DESTRUCTIVE, title: "Edit Phone Screening Question" },
  delete_phone_question:     { ...DESTRUCTIVE, title: "Delete Phone Screening Question" },
  generate_ai_questions:     { ...ADD,         title: "Generate AI Interview Questions" },
  generate_phone_questions:  { ...ADD,         title: "Generate Phone Screening Questions" },

  // ── Per-product configuration setters ──────────────────────────────────────
  set_interview_context:     { ...ADD, title: "Set Interview Context (AI Two-Way)" },
  set_verbal_context:        { ...ADD, title: "Set English Proficiency Test Topic" },
  set_screening_criteria:    { ...ADD, title: "Set Resume Screening Criteria" },
  set_coding_language:       { ...ADD, title: "Set Coding Language" },
  get_criteria_suggestions:  { ...READ, title: "Get Screening Criteria Suggestions" },
};

/**
 * Look up annotations for a tool by name. Returns a default safe annotation
 * (non-read, non-destructive) if the tool isn't in the map, with a warning to
 * stderr so missing entries are noticed during dev.
 */
export function getAnnotations(name: string): ToolAnnotations {
  const a = TOOL_ANNOTATIONS[name];
  if (!a) {
    process.stderr.write(`[hyring-mcp] missing annotations for tool "${name}"\n`);
    return { title: name, readOnlyHint: false, destructiveHint: false, openWorldHint: true };
  }
  return a;
}
