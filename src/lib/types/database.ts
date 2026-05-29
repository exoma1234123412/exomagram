export type WorkCategory =
  | "deep_work"
  | "meeting"
  | "review"
  | "admin"
  | "planning"
  | "learning"
  | "break"
  | "blocked";

export type VerificationStatus = "unverified" | "verified" | "flagged" | "disputed";
export type LiveStatusType = "online" | "idle" | "in_meeting" | "deep_work" | "break" | "offline";
export type ReactionType = "verified" | "suspicious" | "impressive" | "helped_me";
export type FlagType =
  | "missing_hours"
  | "no_proof"
  | "late_entries"
  | "no_closeout"
  | "low_detail"
  | "suspicious_pattern"
  | "idle_long";

export type MoodLevel = 1 | 2 | 3 | 4 | 5;
export type EnergyLevel = 1 | 2 | 3 | 4 | 5;

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  org_id: string;
  date: string;
  hour: number;
  category: WorkCategory;
  title: string;
  description: string | null;
  mood: MoodLevel | null;
  energy: EnergyLevel | null;
  links: string[] | null;
  auto_captured: boolean;
  verification_status: VerificationStatus;
  proof_urls: string[] | null;
  is_late: boolean;
  minutes_late: number;
  logged_at: string;
  verification_note: string | null;
  verified_by: string | null;
  project: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveStatus {
  user_id: string;
  org_id: string;
  status: LiveStatusType;
  current_task: string | null;
  started_at: string;
  last_heartbeat: string;
}

export interface DailyCloseout {
  id: string;
  user_id: string;
  org_id: string;
  date: string;
  summary: string;
  blockers: string | null;
  tomorrow_plan: string | null;
  mood: MoodLevel | null;
  hours_logged: number;
  hours_with_proof: number;
  submitted_at: string;
}

export interface EntryReaction {
  id: string;
  entry_id: string;
  user_id: string;
  reaction: ReactionType;
  comment: string | null;
  created_at: string;
}

export interface ActivityStreak {
  user_id: string;
  org_id: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  total_days_logged: number;
  updated_at: string;
}

export interface AccountabilityFlag {
  id: string;
  user_id: string;
  org_id: string;
  flag_type: FlagType;
  date: string;
  details: string | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_note: string | null;
  created_at: string;
}

export interface Achievement {
  id: string;
  user_id: string;
  org_id: string;
  achievement_type: string;
  unlocked_at: string;
}

export interface TrustScoreHistory {
  id: string;
  user_id: string;
  org_id: string;
  date: string;
  score: number;
  hours_logged: number;
  hours_with_proof: number;
  late_entries: number;
  has_closeout: boolean;
  suspicious_reactions: number;
  created_at: string;
}

export interface OrgSettings {
  org_id: string;
  expected_daily_hours: number;
  work_hour_start: number;
  work_hour_end: number;
  proof_requirement: "none" | "encouraged" | "required";
  max_backfill_hours: number;
  min_title_length: number;
  weekend_logging: boolean;
  auto_flag_missing_hours: boolean;
  auto_flag_no_proof: boolean;
  auto_flag_late: boolean;
  require_closeout: boolean;
  trust_hours_weight: number;
  trust_proof_weight: number;
  trust_closeout_weight: number;
  trust_late_penalty: number;
  trust_suspicious_penalty: number;
  daily_digest_email: boolean;
  slack_webhook_url: string | null;
  flag_notifications: boolean;
  closeout_reminder: boolean;
  closeout_reminder_hour: number;
  updated_at: string;
}

export interface Invitation {
  id: string;
  org_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  token: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  invited_by: string;
  accepted_by: string | null;
  created_at: string;
  expires_at: string;
}

export interface Sprint {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  goal_hours_per_person: number | null;
  goal_category_focus: Record<string, number> | null;
  status: "planning" | "active" | "completed" | "cancelled";
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

export interface SavedReport {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  report_type: "client" | "executive" | "performance" | "project";
  config: Record<string, unknown>;
  created_by: string;
  created_at: string;
  last_run_at: string | null;
}

export interface IntegrationConfig {
  id: string;
  org_id: string;
  provider: "github" | "slack" | "google_calendar" | "linear" | "notion" | "zapier" | "custom_webhook";
  config: Record<string, unknown>;
  status: "connected" | "disconnected" | "error";
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  rate_limit: number;
  created_by: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
}

export interface Subscription {
  org_id: string;
  plan: "free" | "pro" | "enterprise";
  billing_cycle: "monthly" | "annual";
  member_limit: number;
  features: Record<string, boolean>;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  cancelled_at: string | null;
  created_at: string;
}
