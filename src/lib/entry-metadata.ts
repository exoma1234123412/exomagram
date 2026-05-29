// V15 — Entry metadata helpers for all entry surfaces

const TRACKABLE_FIELDS = [
  "category", "title", "description", "mood", "energy", "proof_urls", "project",
  "difficulty", "focus_quality", "value_rating", "stress_level", "confidence",
  "interruptions", "context_switches", "output_type", "location", "tools_used",
  "collaborators", "client_facing", "could_be_async", "blocker_detail",
  "skills_tags", "learning_notes",
] as const;

export function computeCompleteness(entry: Record<string, unknown>): { fieldsFilled: number; completenessScore: number } {
  let filled = 0;
  for (const field of TRACKABLE_FIELDS) {
    const val = entry[field];
    if (val === null || val === undefined || val === "" || val === false) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === "number" && val === 0 && field !== "interruptions" && field !== "context_switches") continue;
    filled++;
  }
  const score = Math.round((filled / TRACKABLE_FIELDS.length) * 100);
  return { fieldsFilled: filled, completenessScore: score };
}

/**
 * Compute quality_score (0-100) for a time entry.
 * Scores specificity, evidence, completeness, and effort signals.
 */
export function computeQualityScore(entry: {
  title: string;
  description?: string | null;
  proof_urls?: string[] | null;
  mood?: number | null;
  energy?: number | null;
  project?: string | null;
  project_id?: string | null;
  difficulty?: number | null;
  focus_quality?: number | null;
  value_rating?: number | null;
  output_type?: string | null;
  tools_used?: string[];
  skills_tags?: string[];
  location?: string | null;
  collaborators?: string[];
}): number {
  let score = 0;

  // Title quality (0-25)
  const titleLen = entry.title.length;
  if (titleLen >= 50) score += 25;
  else if (titleLen >= 30) score += 20;
  else if (titleLen >= 15) score += 12;
  else score += 5;

  // Description (0-20)
  const descLen = entry.description?.length ?? 0;
  if (descLen >= 100) score += 20;
  else if (descLen >= 50) score += 15;
  else if (descLen >= 20) score += 8;
  // no description = 0

  // Proof (0-25)
  const proofCount = entry.proof_urls?.length ?? 0;
  if (proofCount >= 2) score += 25;
  else if (proofCount === 1) score += 20;
  // no proof = 0

  // Self-assessment data (0-10)
  let assessmentPoints = 0;
  if (entry.mood != null) assessmentPoints += 2;
  if (entry.energy != null) assessmentPoints += 2;
  if (entry.difficulty != null) assessmentPoints += 2;
  if (entry.focus_quality != null) assessmentPoints += 2;
  if (entry.value_rating != null) assessmentPoints += 2;
  score += Math.min(assessmentPoints, 10);

  // Context data (0-10)
  let contextPoints = 0;
  if (entry.project || entry.project_id) contextPoints += 3;
  if (entry.output_type) contextPoints += 2;
  if (entry.location) contextPoints += 1;
  if (entry.tools_used && entry.tools_used.length > 0) contextPoints += 2;
  if (entry.skills_tags && entry.skills_tags.length > 0) contextPoints += 1;
  if (entry.collaborators && entry.collaborators.length > 0) contextPoints += 1;
  score += Math.min(contextPoints, 10);

  // Effort signal bonus (0-10)
  // Title contains specific artifacts (file names, PR numbers, function names)
  const hasSpecificArtifact = /[A-Z][a-z]+[A-Z]|#\d+|\.tsx?|\.py|\.sql|PR\s*\d|v\d|api|endpoint|migration|component|hook|route/i.test(entry.title);
  if (hasSpecificArtifact) score += 5;
  // Description has line breaks or lists (structured thought)
  if (entry.description && /\n/.test(entry.description)) score += 3;
  // Multiple tools = real work context
  if (entry.tools_used && entry.tools_used.length >= 2) score += 2;

  return Math.min(score, 100);
}

export function detectDeviceType(): "desktop" | "mobile" | "tablet" {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua)) return "mobile";
  return "desktop";
}
