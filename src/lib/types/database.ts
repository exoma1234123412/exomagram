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
  | "no_standup"
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

// ============================================================
// Creative Features (v7)
// ============================================================

export interface TribunalSession {
  id: string;
  org_id: string;
  date: string;
  entry_id: string;
  nominated_user_id: string;
  reason: string | null;
  status: "voting" | "guilty" | "innocent" | "expired";
  guilty_votes: number;
  innocent_votes: number;
  created_at: string;
}

export interface TribunalVote {
  id: string;
  session_id: string;
  user_id: string;
  vote: "guilty" | "innocent";
  created_at: string;
}

export interface Prediction {
  id: string;
  org_id: string;
  created_by: string;
  question: string;
  type: "yes_no" | "numeric" | "person";
  resolution_date: string;
  status: "open" | "resolved_yes" | "resolved_no" | "cancelled";
  actual_value: string | null;
  created_at: string;
}

export interface PredictionBet {
  id: string;
  prediction_id: string;
  user_id: string;
  bet: string;
  confidence: number;
  is_correct: boolean | null;
  created_at: string;
}

export interface FocusDuel {
  id: string;
  org_id: string;
  challenger_id: string;
  opponent_id: string;
  date: string;
  status: "pending" | "active" | "completed" | "declined";
  challenger_hours: number;
  opponent_hours: number;
  winner_id: string | null;
  loser_confession: string | null;
  created_at: string;
}

export interface MeetingRating {
  id: string;
  entry_id: string;
  user_id: string;
  org_id: string;
  rating: number;
  would_skip: boolean;
  comment: string | null;
  created_at: string;
}

export interface PanicEvent {
  id: string;
  user_id: string;
  org_id: string;
  reason: string | null;
  status: "active" | "rescued" | "resolved";
  rescued_by: string | null;
  rescued_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface WeeklyContract {
  id: string;
  user_id: string;
  org_id: string;
  week_start: string;
  commitments: { text: string; delivered: boolean; grade?: string }[];
  overall_grade: string | null;
  ai_assessment: string | null;
  status: "active" | "graded";
  created_at: string;
  graded_at: string | null;
}

export interface RoulettePairing {
  id: string;
  org_id: string;
  date: string;
  user_a: string;
  user_b: string;
  triggered_at: string | null;
  user_a_verified: boolean;
  user_b_verified: boolean;
  deadline: string | null;
  created_at: string;
}

// ============================================================
// V4 Features
// ============================================================

export interface Standup {
  id: string;
  user_id: string;
  org_id: string;
  date: string;
  yesterday: string;
  today_plan: string;
  blockers: string | null;
  mood: MoodLevel | null;
  submitted_at: string;
}

export interface AuditLogEntry {
  id: string;
  org_id: string;
  user_id: string;
  action:
    | "entry_created"
    | "entry_updated"
    | "entry_deleted"
    | "closeout_submitted"
    | "standup_submitted"
    | "reaction_added"
    | "reaction_removed"
    | "flag_created"
    | "flag_resolved"
    | "profile_updated"
    | "member_joined"
    | "member_removed"
    | "goal_created"
    | "goal_updated"
    | "shoutout_given";
  target_type: string | null;
  target_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export type ShoutoutCategory =
  | "helped_me"
  | "great_work"
  | "team_player"
  | "problem_solver"
  | "above_and_beyond";

export interface Shoutout {
  id: string;
  from_user_id: string;
  to_user_id: string;
  org_id: string;
  message: string;
  category: ShoutoutCategory;
  entry_id: string | null;
  date: string;
  created_at: string;
}

export interface GithubConnection {
  id: string;
  user_id: string;
  org_id: string;
  github_username: string;
  github_token: string | null;
  repos: string[];
  connected_at: string;
}

export type GithubEventType =
  | "commit"
  | "pr_opened"
  | "pr_merged"
  | "pr_reviewed"
  | "issue_opened"
  | "issue_closed";

export interface GithubEvent {
  id: string;
  user_id: string;
  org_id: string;
  event_type: GithubEventType;
  repo: string;
  title: string;
  url: string | null;
  sha: string | null;
  date: string;
  hour: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type AiReviewType = "daily_individual" | "daily_team" | "weekly_retro";

export interface AiReview {
  id: string;
  org_id: string;
  date: string;
  user_id: string | null;
  review_type: AiReviewType;
  findings: Record<string, unknown>;
  summary: string;
  trust_impact: number;
  created_at: string;
}

export interface MeetingVerification {
  id: string;
  entry_id: string;
  requester_id: string;
  verifier_id: string;
  org_id: string;
  status: "pending" | "confirmed" | "denied";
  created_at: string;
  responded_at: string | null;
}

export type NotificationType =
  | "entry_logged"
  | "shoutout_received"
  | "reaction_received"
  | "flag_raised"
  | "standup_reminder"
  | "closeout_reminder"
  | "verification_request"
  | "goal_completed"
  | "streak_milestone";

export interface Notification {
  id: string;
  user_id: string;
  org_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  from_user_id: string | null;
  created_at: string;
}

export interface PomodoroSession {
  id: string;
  user_id: string;
  org_id: string;
  task_title: string;
  category: string | null;
  duration_minutes: number;
  started_at: string;
  completed_at: string | null;
  was_interrupted: boolean;
  entry_id: string | null;
}

export interface PublicDashboard {
  id: string;
  org_id: string;
  token: string;
  label: string;
  show_names: boolean;
  show_details: boolean;
  active: boolean;
  created_by: string;
  created_at: string;
}

export interface EntryComment {
  id: string;
  entry_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export type GoalPeriod = "weekly" | "monthly";
export type GoalStatus = "active" | "completed" | "failed" | "cancelled";

export interface Goal {
  id: string;
  user_id: string;
  org_id: string;
  title: string;
  description: string | null;
  target_hours: number | null;
  target_category: string | null;
  period: GoalPeriod;
  start_date: string;
  end_date: string;
  status: GoalStatus;
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface PulseResponse {
  id: string;
  user_id: string;
  org_id: string;
  week: string;
  question_id: string;
  score: number;
  created_at: string;
}

export interface EntryBookmark {
  id: string;
  user_id: string;
  entry_id: string;
  note: string | null;
  created_at: string;
}

export type AccountabilityPactTargetType =
  | "hours_with_proof"
  | "total_hours"
  | "proof_percent"
  | "closeout_days";

export type AccountabilityPactStatus = "active" | "completed" | "failed";

export interface AccountabilityPact {
  id: string;
  creator_id: string;
  partner_id: string;
  org_id: string;
  title: string;
  target_type: AccountabilityPactTargetType;
  target_value: number;
  duration_days: number;
  start_date: string;
  end_date: string;
  status: AccountabilityPactStatus;
  creator_progress: number;
  partner_progress: number;
  created_at: string;
}

// ============================================================
// V5 SaaS Features
// ============================================================

export interface WebhookDelivery {
  id: string;
  org_id: string;
  url: string;
  event_type: string;
  payload: Record<string, unknown>;
  status_code: number | null;
  response_body: string | null;
  success: boolean;
  created_at: string;
}

// ============================================================
// v6 — Promises, Buddies, Rankings, AI tables, Feed, Summaries
// ============================================================

export type PromiseStatus = "pending" | "delivered" | "broken";

export interface DailyPromise {
  id: string;
  user_id: string;
  org_id: string;
  date: string;
  title: string;
  status: PromiseStatus;
  created_at: string;
}

export interface BuddyPair {
  id: string;
  org_id: string;
  user_a: string;
  user_b: string;
  active: boolean;
  created_at: string;
}

export type MirrorTierLevel = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface MirrorTier {
  id: string;
  user_id: string;
  org_id: string;
  tier: MirrorTierLevel;
  score: number;
  updated_at: string;
}

export interface PowerRanking {
  id: string;
  user_id: string;
  org_id: string;
  rank: number;
  total: number;
  updated_at: string;
}

export interface AiWorkProfile {
  id: string;
  user_id: string;
  org_id: string;
  profile_data: Record<string, unknown>;
  last_updated: string | null;
  created_at: string;
}

export interface AiDailyInsight {
  id: string;
  user_id: string;
  org_id: string;
  date: string;
  insight: Record<string, unknown>;
  predictive: Record<string, unknown> | null;
  relationships: Record<string, unknown> | null;
  recommendation: string | null;
  created_at: string;
}

export type PublicFeedType =
  | "ai_announcement"
  | "achievement"
  | "praise"
  | "milestone"
  | "challenge"
  | "team_update"
  | "warning"
  | "shame";

export type FeedUrgency = "low" | "normal" | "high" | "critical";

export interface PublicFeedItem {
  id: string;
  org_id: string;
  type: PublicFeedType;
  title: string;
  body: string;
  target_user_id: string | null;
  urgency: FeedUrgency;
  emoji: string | null;
  is_ai_generated: boolean;
  created_at: string;
}

export interface WeeklySummary {
  id: string;
  user_id: string;
  org_id: string;
  week_start: string;
  week_end: string;
  summary: Record<string, unknown>;
  ai_narrative: string | null;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  org_id: string;
  week_of: string;
  content: string;
  created_at: string;
  updated_at: string;
}
