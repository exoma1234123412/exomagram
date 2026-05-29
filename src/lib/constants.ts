import type { WorkCategory, VerificationStatus, ReactionType, FlagType, LiveStatusType } from "@/lib/types/database";

export const CATEGORIES: Record<
  WorkCategory,
  { label: string; color: string; bgColor: string; emoji: string }
> = {
  deep_work: {
    label: "Deep Work",
    color: "text-violet-700 dark:text-violet-400",
    bgColor: "bg-violet-100 dark:bg-violet-900/40",
    emoji: "DW",
  },
  meeting: {
    label: "Reunión",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/40",
    emoji: "MT",
  },
  review: {
    label: "Code Review",
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/40",
    emoji: "CR",
  },
  admin: {
    label: "Admin",
    color: "text-slate-700 dark:text-slate-400",
    bgColor: "bg-slate-100 dark:bg-slate-800/40",
    emoji: "AD",
  },
  planning: {
    label: "Planning",
    color: "text-emerald-700 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/40",
    emoji: "PL",
  },
  learning: {
    label: "Aprendizaje",
    color: "text-pink-700 dark:text-pink-400",
    bgColor: "bg-pink-100 dark:bg-pink-900/40",
    emoji: "LR",
  },
  break: {
    label: "Descanso",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/40",
    emoji: "BK",
  },
  blocked: {
    label: "Bloqueado",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/40",
    emoji: "BL",
  },
};

export const VERIFICATION_STATUS: Record<
  VerificationStatus,
  { label: string; color: string; icon: string }
> = {
  unverified: { label: "Sin verificar", color: "text-yellow-600", icon: "--" },
  verified: { label: "Verificado", color: "text-green-600", icon: "OK" },
  flagged: { label: "Sospechoso", color: "text-red-600", icon: "!!" },
  disputed: { label: "Disputado", color: "text-orange-600", icon: "??" },
};

export const REACTIONS: Record<
  ReactionType,
  { label: string; emoji: string; description: string }
> = {
  verified: { label: "Confirmo", emoji: "+1", description: "Confirmo que esto pasó" },
  suspicious: { label: "Sospechoso", emoji: "??", description: "Requiere revisión" },
  impressive: { label: "Notable", emoji: "++", description: "Rendimiento destacado" },
  helped_me: { label: "Asistencia", emoji: ">>", description: "Asistencia directa registrada" },
};

export const FLAG_TYPES: Record<
  FlagType,
  { label: string; emoji: string; severity: "low" | "medium" | "high" }
> = {
  missing_hours: { label: "Horas faltantes", emoji: "!!", severity: "high" },
  no_proof: { label: "Sin evidencia", emoji: "--", severity: "medium" },
  late_entries: { label: "Entradas tardías", emoji: ">>", severity: "medium" },
  no_closeout: { label: "Sin cierre del día", emoji: "!!", severity: "high" },
  no_standup: { label: "Sin standup", emoji: "!!", severity: "high" },
  low_detail: { label: "Bajo detalle", emoji: "..", severity: "low" },
  suspicious_pattern: { label: "Patrón sospechoso", emoji: "!!", severity: "high" },
  idle_long: { label: "Idle prolongado", emoji: "..", severity: "medium" },
  no_health_check: { label: "Sin check de salud", emoji: "!!", severity: "medium" },
  no_weekly_reflection: { label: "Sin reflexión semanal", emoji: "!!", severity: "medium" },
};

export const LIVE_STATUS_CONFIG: Record<
  LiveStatusType,
  { label: string; color: string; dotColor: string }
> = {
  online: { label: "En línea", color: "text-green-600", dotColor: "bg-green-500" },
  idle: { label: "Inactivo", color: "text-yellow-600", dotColor: "bg-yellow-500" },
  in_meeting: { label: "En reunión", color: "text-blue-600", dotColor: "bg-blue-500" },
  deep_work: { label: "Deep Work", color: "text-violet-600", dotColor: "bg-violet-500" },
  break: { label: "Descanso", color: "text-green-400", dotColor: "bg-green-400" },
  offline: { label: "Desconectado", color: "text-gray-400", dotColor: "bg-gray-400" },
};

export const CATEGORY_COLORS: Record<string, string> = {
  deep_work: "bg-violet-500",
  meeting: "bg-blue-500",
  review: "bg-amber-500",
  admin: "bg-slate-400",
  planning: "bg-emerald-500",
  learning: "bg-pink-500",
  break: "bg-green-400",
  blocked: "bg-red-500",
};

export const WORK_HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7am - 6pm

export const MOOD_LABELS: Record<number, string> = {
  1: "Muy mal",
  2: "Mal",
  3: "Normal",
  4: "Bien",
  5: "Excelente",
};

export const ENERGY_LABELS: Record<number, string> = {
  1: "Agotado",
  2: "Bajo",
  3: "Normal",
  4: "Energético",
  5: "Máximo",
};

// ============================================================
// V10 — Extended Data Collection Constants
// ============================================================

export const OUTPUT_TYPES: Record<string, { label: string; emoji: string }> = {
  code: { label: "Código", emoji: "CD" },
  document: { label: "Documento", emoji: "DC" },
  design: { label: "Diseño", emoji: "DS" },
  email: { label: "Email", emoji: "EM" },
  decision: { label: "Decisión", emoji: "DE" },
  analysis: { label: "Análisis", emoji: "AN" },
  presentation: { label: "Presentación", emoji: "PR" },
  communication: { label: "Comunicación", emoji: "CM" },
  review_output: { label: "Review", emoji: "RV" },
  none: { label: "Sin entregable", emoji: "--" },
};

export const TOOLS: Record<string, { label: string; emoji: string }> = {
  vscode: { label: "VS Code", emoji: "VC" },
  figma: { label: "Figma", emoji: "FG" },
  slack: { label: "Slack", emoji: "SL" },
  zoom: { label: "Zoom", emoji: "ZM" },
  meet: { label: "Google Meet", emoji: "GM" },
  notion: { label: "Notion", emoji: "NT" },
  linear: { label: "Linear", emoji: "LN" },
  terminal: { label: "Terminal", emoji: "TM" },
  browser: { label: "Browser", emoji: "BR" },
  excel: { label: "Excel/Sheets", emoji: "XL" },
  github: { label: "GitHub", emoji: "GH" },
  email_client: { label: "Email", emoji: "EM" },
  other: { label: "Otro", emoji: "--" },
};

export const LOCATIONS: Record<string, { label: string; emoji: string }> = {
  office: { label: "Oficina", emoji: "OF" },
  home: { label: "Remoto", emoji: "RM" },
  cafe: { label: "Externo", emoji: "EX" },
  coworking: { label: "Coworking", emoji: "CW" },
  travel: { label: "Viaje", emoji: "VJ" },
  other: { label: "Otro", emoji: "--" },
};

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Trivial",
  2: "Fácil",
  3: "Normal",
  4: "Difícil",
  5: "Extremo",
};

export const FOCUS_LABELS: Record<number, string> = {
  1: "Disperso",
  2: "Distraído",
  3: "Normal",
  4: "Enfocado",
  5: "Flow state",
};

export const VALUE_LABELS: Record<number, string> = {
  1: "Sin valor",
  2: "Bajo valor",
  3: "Valor normal",
  4: "Alto valor",
  5: "Valor crítico",
};

export const STRESS_LABELS: Record<number, string> = {
  1: "Relajado",
  2: "Tranquilo",
  3: "Normal",
  4: "Estresado",
  5: "Máximo estrés",
};

export const CONFIDENCE_LABELS: Record<number, string> = {
  1: "Invento",
  2: "Aproximado",
  3: "Razonable",
  4: "Seguro",
  5: "Exacto",
};

export const INTERRUPTION_SOURCES: Record<string, { label: string; emoji: string }> = {
  slack: { label: "Slack", emoji: "💬" },
  colleague: { label: "Colega", emoji: "🧑" },
  phone: { label: "Teléfono", emoji: "📱" },
  email: { label: "Email", emoji: "📧" },
  meeting: { label: "Reunión", emoji: "📅" },
  self: { label: "Auto-interrupción", emoji: "🧠" },
};

export const EXERCISE_TYPES: Record<string, string> = {
  none: "Ninguno",
  running: "Correr",
  gym: "Gimnasio",
  yoga: "Yoga",
  walk: "Caminar",
  cycling: "Ciclismo",
  swimming: "Natación",
  sports: "Deporte",
  other: "Otro",
};

// Anti-gaming: máximo de horas hacia atrás que se puede registrar
export const MAX_BACKFILL_HOURS = 24;

// Mínimo de caracteres para el título (evitar entradas vagas)
export const MIN_TITLE_LENGTH = 10;

// Horas mínimas esperadas por día laboral
export const EXPECTED_DAILY_HOURS = 8;

// Achievement definitions
export const ACHIEVEMENTS: Record<
  string,
  { label: string; emoji: string; description: string }
> = {
  streak_7: { label: "7 dias seguidos", emoji: "🔥", description: "Racha de 7 dias registrando horas" },
  streak_30: { label: "30 dias seguidos", emoji: "💎", description: "Racha de 30 dias registrando horas" },
  proof_100: { label: "100% evidencia", emoji: "🛡️", description: "Semana completa con 100% de entradas con evidencia" },
  zero_late: { label: "Siempre a tiempo", emoji: "⏱️", description: "Semana sin entradas tardias" },
  first_logger: { label: "Madrugador", emoji: "🌅", description: "Primero en registrar 5 veces" },
  helpful: { label: "Servicial", emoji: "🤝", description: "Recibir 10 reacciones de 'me ayudo'" },
  impressive_10: { label: "Estrella", emoji: "⭐", description: "Recibir 10 reacciones de 'impresionante'" },
  closeout_streak: { label: "Disciplina", emoji: "📋", description: "5 cierres de dia consecutivos" },
  high_trust: { label: "Confiable", emoji: "🏆", description: "Trust score >90 por 7 dias" },
  team_player: { label: "Team Player", emoji: "💪", description: "Verificar 20 entradas de compañeros" },
  madrugador: { label: "Madrugador Secreto", emoji: "🌄", description: "3 entradas antes de las 9am en una semana" },
  maquina: { label: "Máquina", emoji: "🤖", description: "8+ horas con 100% evidencia en 1 día" },
  imparable: { label: "Imparable", emoji: "⚡", description: "Racha de 10 días sin fallar" },
  primer_sangre: { label: "Primer sangre", emoji: "🗡️", description: "Primera entrada del día para el equipo, 5 veces" },
  sin_excusas: { label: "Sin excusas", emoji: "🎯", description: "0 entradas tardías en una semana completa" },
  cumplidor: { label: "Cumplidor", emoji: "🤝", description: "10 promesas cumplidas con 0 rotas" },
};
