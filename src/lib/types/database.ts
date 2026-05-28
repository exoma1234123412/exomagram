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
