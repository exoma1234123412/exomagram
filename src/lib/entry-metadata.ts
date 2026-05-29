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

export function detectDeviceType(): "desktop" | "mobile" | "tablet" {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua)) return "mobile";
  return "desktop";
}
