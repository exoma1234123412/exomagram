import type { WorkCategory, VerificationStatus, ReactionType, FlagType, LiveStatusType } from "@/lib/types/database";

export const CATEGORIES: Record<
  WorkCategory,
  { label: string; color: string; bgColor: string; emoji: string }
> = {
  deep_work: {
    label: "Deep Work",
    color: "text-violet-700 dark:text-violet-400",
    bgColor: "bg-violet-100 dark:bg-violet-900/40",
    emoji: "🎯",
  },
  meeting: {
    label: "Reunión",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/40",
    emoji: "🤝",
  },
  review: {
    label: "Code Review",
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/40",
    emoji: "👀",
  },
  admin: {
    label: "Admin",
    color: "text-slate-700 dark:text-slate-400",
    bgColor: "bg-slate-100 dark:bg-slate-800/40",
    emoji: "📋",
  },
  planning: {
    label: "Planning",
    color: "text-emerald-700 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/40",
    emoji: "🗺️",
  },
  learning: {
    label: "Aprendizaje",
    color: "text-pink-700 dark:text-pink-400",
    bgColor: "bg-pink-100 dark:bg-pink-900/40",
    emoji: "📚",
  },
  break: {
    label: "Descanso",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/40",
    emoji: "☕",
  },
  blocked: {
    label: "Bloqueado",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/40",
    emoji: "🚫",
  },
};

export const VERIFICATION_STATUS: Record<
  VerificationStatus,
  { label: string; color: string; icon: string }
> = {
  unverified: { label: "Sin verificar", color: "text-yellow-600", icon: "⚠️" },
  verified: { label: "Verificado", color: "text-green-600", icon: "✅" },
  flagged: { label: "Sospechoso", color: "text-red-600", icon: "🚩" },
  disputed: { label: "Disputado", color: "text-orange-600", icon: "⚡" },
};

export const REACTIONS: Record<
  ReactionType,
  { label: string; emoji: string; description: string }
> = {
  verified: { label: "Confirmo", emoji: "✅", description: "Confirmo que esto pasó" },
  suspicious: { label: "Sospechoso", emoji: "🤔", description: "Esto no me cuadra" },
  impressive: { label: "Impresionante", emoji: "🔥", description: "Gran trabajo" },
  helped_me: { label: "Me ayudó", emoji: "🙏", description: "Esto me ayudó directamente" },
};

export const FLAG_TYPES: Record<
  FlagType,
  { label: string; emoji: string; severity: "low" | "medium" | "high" }
> = {
  missing_hours: { label: "Horas faltantes", emoji: "🕳️", severity: "high" },
  no_proof: { label: "Sin evidencia", emoji: "📭", severity: "medium" },
  late_entries: { label: "Entradas tardías", emoji: "⏰", severity: "medium" },
  no_closeout: { label: "Sin cierre del día", emoji: "📝", severity: "high" },
  low_detail: { label: "Bajo detalle", emoji: "💤", severity: "low" },
  suspicious_pattern: { label: "Patrón sospechoso", emoji: "🔍", severity: "high" },
  idle_long: { label: "Idle prolongado", emoji: "💤", severity: "medium" },
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
  5: "En llamas",
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
  team_player: { label: "Team Player", emoji: "💪", description: "Verificar 20 entradas de companeros" },
};
