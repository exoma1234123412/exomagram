/**
 * Anti-Gaming Detection Module
 *
 * Pure utility functions for detecting cheating, gaming, and low-effort
 * time entries. No external dependencies. Every cheat is detected.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Tokenize a string into lowercase words, stripping punctuation */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sáéíóúñü]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Unique set from an array */
function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// ---------------------------------------------------------------------------
// 1. Copy-Paste Detection
// ---------------------------------------------------------------------------

/** Jaccard similarity: |A ∩ B| / |A ∪ B| */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Bigram-based character similarity.
 * Creates character bigrams and computes Dice coefficient: 2|A ∩ B| / (|A| + |B|)
 */
function bigramSimilarity(a: string, b: string): number {
  const bigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    const lower = s.toLowerCase().replace(/\s+/g, "");
    for (let i = 0; i < lower.length - 1; i++) {
      const bg = lower.substring(i, i + 2);
      map.set(bg, (map.get(bg) || 0) + 1);
    }
    return map;
  };

  const bgA = bigrams(a);
  const bgB = bigrams(b);

  let intersection = 0;
  for (const [bg, countA] of bgA) {
    const countB = bgB.get(bg) || 0;
    intersection += Math.min(countA, countB);
  }

  let totalA = 0;
  for (const c of bgA.values()) totalA += c;
  let totalB = 0;
  for (const c of bgB.values()) totalB += c;

  const denominator = totalA + totalB;
  return denominator === 0 ? 0 : (2 * intersection) / denominator;
}

export function detectCopyPaste(
  description: string,
  recentDescriptions: string[]
): { isCopy: boolean; similarity: number; matchedEntry: string | null } {
  if (!description || recentDescriptions.length === 0) {
    return { isCopy: false, similarity: 0, matchedEntry: null };
  }

  const tokensA = tokenize(description);
  let maxSimilarity = 0;
  let matchedEntry: string | null = null;

  for (const recent of recentDescriptions) {
    if (!recent) continue;

    const tokensB = tokenize(recent);
    const jaccard = jaccardSimilarity(tokensA, tokensB);
    const bigram = bigramSimilarity(description, recent);

    // Weighted combination: 60% Jaccard (semantic), 40% bigram (structural)
    const combined = jaccard * 0.6 + bigram * 0.4;

    if (combined > maxSimilarity) {
      maxSimilarity = combined;
      matchedEntry = recent;
    }
  }

  // Exact match override — if strings are identical, similarity is 1
  for (const recent of recentDescriptions) {
    if (
      recent &&
      description.trim().toLowerCase() === recent.trim().toLowerCase()
    ) {
      return { isCopy: true, similarity: 1, matchedEntry: recent };
    }
  }

  return {
    isCopy: maxSimilarity >= 0.75,
    similarity: Math.round(maxSimilarity * 100) / 100,
    matchedEntry: maxSimilarity >= 0.75 ? matchedEntry : null,
  };
}

// ---------------------------------------------------------------------------
// 2. Vagueness Detection
// ---------------------------------------------------------------------------

const GENERIC_PHRASES: string[] = [
  "trabajé en",
  "avancé con",
  "hice",
  "lo de siempre",
  "seguí con",
  "continué",
  "varias cosas",
  "revisé cosas",
  "trabajo normal",
  "tareas varias",
  "lo mismo de ayer",
  "igual que siempre",
  "nada especial",
  "rutina",
  "cosas del trabajo",
  "pendientes",
  "seguimiento",
  "avance",
  "lo habitual",
  "cosas pendientes",
  "lo de siempre",
  "más de lo mismo",
  "cositas",
  "cosas",
  "algo de",
  "un poco de",
  "trabajando",
  "estuve trabajando",
  "estuve viendo",
  "estuve haciendo",
  "haciendo cosas",
  "viendo cosas",
  "revisando cosas",
  "avanzando",
];

/**
 * Check if a word looks like a specific noun/proper noun or technical term.
 * Specifics: has uppercase (proper nouns), contains numbers, dashes, dots,
 * or is longer than 7 chars (likely a technical/domain term).
 */
function hasSpecificTerms(description: string): boolean {
  const words = description.split(/\s+/);
  // Look for: proper nouns (uppercase mid-sentence), numbers, technical patterns
  for (const word of words) {
    // Skip first word (always capitalized)
    const stripped = word.replace(/[^\w\sáéíóúñü]/g, "");
    if (!stripped) continue;
    // Contains numbers
    if (/\d/.test(stripped)) return true;
    // CamelCase or contains uppercase mid-word (technical terms)
    if (/[a-záéíóúñü][A-ZÁÉÍÓÚÑÜ]/.test(stripped)) return true;
    // Known code/tech patterns
    if (/[_.\-/]/.test(word) && word.length > 3) return true;
  }
  // URLs
  if (/https?:\/\//.test(description)) return true;
  // File paths or extensions
  if (/\.\w{2,4}\b/.test(description)) return true;
  // Version numbers
  if (/v?\d+\.\d+/.test(description)) return true;

  return false;
}

export function detectVagueness(
  description: string
): { isVague: boolean; score: number; genericPhrases: string[] } {
  if (!description || description.trim().length === 0) {
    return { isVague: true, score: 100, genericPhrases: [] };
  }

  const lower = description.toLowerCase().trim();
  const words = tokenize(description);
  const wordCount = words.length;

  let score = 0;
  const foundGeneric: string[] = [];

  // Check for generic phrases
  for (const phrase of GENERIC_PHRASES) {
    if (lower.includes(phrase)) {
      foundGeneric.push(phrase);
      score += 15;
    }
  }

  // Word count penalty
  if (wordCount <= 3) {
    score += 40;
  } else if (wordCount <= 5) {
    score += 25;
  } else if (wordCount <= 8) {
    score += 10;
  }

  // No specifics penalty
  if (!hasSpecificTerms(description)) {
    score += 15;
  }

  // Unique words ratio — if most words repeat, it's low effort
  const uniqueCount = unique(words).length;
  const uniqueRatio = wordCount > 0 ? uniqueCount / wordCount : 0;
  if (uniqueRatio < 0.5 && wordCount > 3) {
    score += 10;
  }

  // Entire description is just one generic phrase
  if (
    GENERIC_PHRASES.some(
      (p) => lower === p || lower === p + "."
    )
  ) {
    score = Math.max(score, 90);
  }

  // Cap at 100
  score = Math.min(score, 100);

  return {
    isVague: score >= 50,
    score,
    genericPhrases: unique(foundGeneric),
  };
}

// ---------------------------------------------------------------------------
// 3. Backfill Detection
// ---------------------------------------------------------------------------

export function detectBackfill(
  entries: { logged_at: string; hour: number; date: string }[]
): { isBackfilling: boolean; burstCount: number; burstWindow: number } {
  if (entries.length < 3) {
    return { isBackfilling: false, burstCount: 0, burstWindow: 0 };
  }

  // Sort by logged_at timestamp
  const sorted = [...entries].sort(
    (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
  );

  let maxBurstCount = 0;
  let maxBurstWindow = 0;

  // Sliding window: find the largest cluster of entries within 15 minutes
  for (let i = 0; i < sorted.length; i++) {
    const startTime = new Date(sorted[i].logged_at).getTime();

    let count = 1;
    let windowEnd = startTime;

    for (let j = i + 1; j < sorted.length; j++) {
      const entryTime = new Date(sorted[j].logged_at).getTime();
      const diffMinutes = (entryTime - startTime) / (1000 * 60);

      if (diffMinutes <= 15) {
        count++;
        windowEnd = entryTime;
      } else {
        break;
      }
    }

    if (count > maxBurstCount) {
      maxBurstCount = count;
      maxBurstWindow = Math.round((windowEnd - startTime) / (1000 * 60));
    }
  }

  // 3+ entries within 5 minutes = backfill burst
  // 5+ entries within 15 minutes = heavy backfill
  // We check both conditions
  let isBackfilling = false;

  // Check 5-minute bursts
  for (let i = 0; i < sorted.length; i++) {
    const startTime = new Date(sorted[i].logged_at).getTime();
    let count = 1;
    for (let j = i + 1; j < sorted.length; j++) {
      const entryTime = new Date(sorted[j].logged_at).getTime();
      if ((entryTime - startTime) / (1000 * 60) <= 5) {
        count++;
      } else {
        break;
      }
    }
    if (count >= 3) {
      isBackfilling = true;
      break;
    }
  }

  // Also flag 5+ entries within 15 minutes
  if (maxBurstCount >= 5) {
    isBackfilling = true;
  }

  return {
    isBackfilling,
    burstCount: maxBurstCount,
    burstWindow: maxBurstWindow,
  };
}

// ---------------------------------------------------------------------------
// 4. Impossible Claims Detection
// ---------------------------------------------------------------------------

export function detectImpossible(
  category: string,
  hour: number,
  description: string
): { isSuspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const lower = (description || "").toLowerCase();

  // Deep work at very late/early hours (midnight to 4am)
  if (category === "deep_work" && (hour >= 0 && hour <= 4)) {
    reasons.push(
      `Deep Work a las ${hour}:00 — horario inusual para trabajo concentrado`
    );
  }

  // Meeting on weekend at very early hour (before 7am)
  // We can't check day of week without a date, but we detect 6am meetings
  if (category === "meeting" && hour < 7) {
    reasons.push(
      `Reunión a las ${hour}:00 — ¿reunión antes de las 7am?`
    );
  }

  // Break logged as deep_work
  const breakTerms = [
    "descanso",
    "break",
    "almuerzo",
    "comida",
    "lunch",
    "café",
    "coffee",
    "siesta",
    "relax",
    "descansar",
    "pausa",
    "recreo",
  ];
  if (category === "deep_work") {
    for (const term of breakTerms) {
      if (lower.includes(term)) {
        reasons.push(
          `"${term}" registrado como Deep Work — debería ser Descanso`
        );
        break;
      }
    }
  }

  // Meeting-related terms logged as deep_work
  const meetingTerms = [
    "reunión",
    "reunion",
    "meeting",
    "call",
    "llamada",
    "junta",
    "standup",
    "stand-up",
    "daily",
    "sync",
    "retro",
    "retrospectiva",
  ];
  if (category === "deep_work") {
    for (const term of meetingTerms) {
      if (lower.includes(term)) {
        reasons.push(
          `"${term}" registrado como Deep Work — debería ser Reunión`
        );
        break;
      }
    }
  }

  // Learning/studying logged as meeting
  const learningTerms = [
    "estudiar",
    "estudiando",
    "curso",
    "tutorial",
    "aprendiendo",
    "learning",
    "estudio",
    "capacitación",
    "reading",
    "leyendo",
    "artículo",
  ];
  if (category === "meeting") {
    for (const term of learningTerms) {
      if (lower.includes(term)) {
        reasons.push(
          `"${term}" registrado como Reunión — debería ser Aprendizaje`
        );
        break;
      }
    }
  }

  // Admin tasks logged as deep_work
  const adminTerms = [
    "correo",
    "email",
    "emails",
    "slack",
    "mensajes",
    "inbox",
    "bandeja",
    "notificaciones",
  ];
  if (category === "deep_work") {
    for (const term of adminTerms) {
      if (lower.includes(term)) {
        reasons.push(
          `"${term}" registrado como Deep Work — debería ser Admin`
        );
        break;
      }
    }
  }

  // Suspiciously short descriptions for deep_work (should be detailed)
  if (category === "deep_work" && description && description.length < 15) {
    reasons.push(
      "Descripción muy corta para Deep Work — se espera mayor detalle"
    );
  }

  return {
    isSuspicious: reasons.length > 0,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// 5. Description Quality Score
// ---------------------------------------------------------------------------

const DELIVERABLE_WORDS = [
  "implementé",
  "implemente",
  "creé",
  "cree",
  "diseñé",
  "diseñe",
  "completé",
  "complete",
  "entregué",
  "entregue",
  "publiqué",
  "publique",
  "lancé",
  "lance",
  "desplegué",
  "despliegue",
  "deployed",
  "shipped",
  "built",
  "created",
  "implemented",
  "developed",
  "resolved",
  "fixed",
  "merged",
  "pushed",
  "released",
  "configuré",
  "configure",
  "actualicé",
  "actualice",
  "migré",
  "migre",
  "refactoricé",
  "refactorice",
  "optimicé",
  "optimice",
  "automaticé",
  "automatice",
  "integré",
  "integre",
  "documenté",
  "documente",
  "escribí",
  "escribi",
  "programé",
  "programe",
  "corregí",
  "corregi",
];

const OUTCOME_WORDS = [
  "resultado",
  "logré",
  "logre",
  "terminé",
  "termine",
  "listo",
  "funciona",
  "funcionando",
  "resuelto",
  "solucionado",
  "aprobado",
  "completado",
  "finalizado",
  "exitoso",
  "exitosa",
  "producción",
  "produccion",
  "production",
  "done",
  "finished",
  "working",
  "passing",
  "live",
  "deployed",
  "merged",
  "approved",
  "success",
  "funcional",
  "operativo",
  "estable",
  "lanzado",
  "entregado",
  "terminado",
];

export function scoreDescription(
  description: string
): {
  score: number;
  wordCount: number;
  uniqueWords: number;
  hasSpecifics: boolean;
  hasDeliverable: boolean;
  hasOutcome: boolean;
} {
  if (!description || description.trim().length === 0) {
    return {
      score: 0,
      wordCount: 0,
      uniqueWords: 0,
      hasSpecifics: false,
      hasDeliverable: false,
      hasOutcome: false,
    };
  }

  const words = tokenize(description);
  const wordCount = words.length;
  const uniqueWords = unique(words).length;
  const lower = description.toLowerCase();

  // Check specifics
  const hasSpecifics = hasSpecificTerms(description);

  // Check deliverables
  const hasDeliverable = DELIVERABLE_WORDS.some((w) => lower.includes(w));

  // Check outcomes
  const hasOutcome = OUTCOME_WORDS.some((w) => lower.includes(w));

  // Score calculation (0–100)
  let score = 0;

  // Word count contribution (up to 30 points)
  if (wordCount >= 20) {
    score += 30;
  } else if (wordCount >= 15) {
    score += 25;
  } else if (wordCount >= 10) {
    score += 18;
  } else if (wordCount >= 5) {
    score += 10;
  } else {
    score += Math.max(0, wordCount * 2);
  }

  // Unique words ratio (up to 15 points)
  const uniqueRatio = wordCount > 0 ? uniqueWords / wordCount : 0;
  if (uniqueRatio >= 0.7) {
    score += 15;
  } else if (uniqueRatio >= 0.5) {
    score += 10;
  } else {
    score += 5;
  }

  // Specifics (up to 20 points)
  if (hasSpecifics) {
    score += 20;
  }

  // Deliverable (up to 20 points)
  if (hasDeliverable) {
    score += 20;
  }

  // Outcome (up to 15 points)
  if (hasOutcome) {
    score += 15;
  }

  // Cap at 100
  score = Math.min(score, 100);

  return {
    score,
    wordCount,
    uniqueWords,
    hasSpecifics,
    hasDeliverable,
    hasOutcome,
  };
}

// ---------------------------------------------------------------------------
// 6. Pattern Gaming Detection
// ---------------------------------------------------------------------------

export function detectPatternGaming(
  entries: {
    hour: number;
    category: string;
    title: string;
    description: string;
  }[]
): { isGaming: boolean; patterns: string[] } {
  const patterns: string[] = [];

  if (entries.length < 5) {
    return { isGaming: false, patterns: [] };
  }

  // Check 1: Same hour distribution in consecutive day blocks
  // Group entries into day-like chunks of work hours
  // If the hour set repeats identically across 3+ "days", suspicious
  const hourSets: string[] = [];
  const chunkSize = Math.min(8, Math.floor(entries.length / 2));
  if (chunkSize >= 3) {
    for (let i = 0; i + chunkSize <= entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      const hours = chunk.map((e) => e.hour).sort((a, b) => a - b);
      hourSets.push(hours.join(","));
    }

    if (hourSets.length >= 2) {
      const allSame = hourSets.every((s) => s === hourSets[0]);
      if (allSame) {
        patterns.push(
          `Mismo patrón de horas repetido ${hourSets.length} veces: [${hourSets[0]}]`
        );
      }
    }
  }

  // Check 2: Titles too similar across entries
  const titles = entries.map((e) => e.title.toLowerCase().trim()).filter(Boolean);
  if (titles.length >= 5) {
    // Pairwise similarity check on last 5 titles
    const last5 = titles.slice(-5);
    let similarPairs = 0;
    const totalPairs = (last5.length * (last5.length - 1)) / 2;

    for (let i = 0; i < last5.length; i++) {
      for (let j = i + 1; j < last5.length; j++) {
        const tokA = tokenize(last5[i]);
        const tokB = tokenize(last5[j]);
        if (jaccardSimilarity(tokA, tokB) > 0.6) {
          similarPairs++;
        }
      }
    }

    // If more than 60% of pairs are similar
    if (similarPairs / totalPairs > 0.6) {
      patterns.push(
        `${similarPairs}/${totalPairs} pares de títulos son muy similares — posible copy-paste`
      );
    }
  }

  // Check 3: Perfectly evenly spaced hours (0 variation)
  if (entries.length >= 5) {
    const hours = entries.slice(-Math.min(entries.length, 10)).map((e) => e.hour);
    const sortedHours = [...hours].sort((a, b) => a - b);
    const diffs: number[] = [];
    for (let i = 1; i < sortedHours.length; i++) {
      diffs.push(sortedHours[i] - sortedHours[i - 1]);
    }

    if (diffs.length >= 4) {
      const allEqual = diffs.every((d) => d === diffs[0]);
      if (allEqual && diffs[0] === 1) {
        patterns.push(
          `${diffs.length + 1} horas consecutivas perfectamente espaciadas — sin variación natural`
        );
      }
    }
  }

  // Check 4: Same category for all entries (no variety)
  if (entries.length >= 5) {
    const last5 = entries.slice(-5);
    const categories = last5.map((e) => e.category);
    const allSameCat = categories.every((c) => c === categories[0]);
    if (allSameCat && categories[0] !== "deep_work") {
      // Deep work streaks can be legitimate, but other categories always same is suspicious
      patterns.push(
        `Últimas 5 entradas todas con categoría "${categories[0]}" — falta variación`
      );
    }
  }

  // Check 5: Descriptions too similar across entries
  const descriptions = entries
    .map((e) => e.description || "")
    .filter((d) => d.length > 0);
  if (descriptions.length >= 5) {
    const last5 = descriptions.slice(-5);
    let similarDesc = 0;
    const totalDescPairs = (last5.length * (last5.length - 1)) / 2;

    for (let i = 0; i < last5.length; i++) {
      for (let j = i + 1; j < last5.length; j++) {
        const tokA = tokenize(last5[i]);
        const tokB = tokenize(last5[j]);
        if (jaccardSimilarity(tokA, tokB) > 0.5) {
          similarDesc++;
        }
      }
    }

    if (similarDesc / totalDescPairs > 0.6) {
      patterns.push(
        `${similarDesc}/${totalDescPairs} pares de descripciones son muy similares — contenido repetitivo`
      );
    }
  }

  // Check 6: All descriptions have nearly identical word count (robotic uniformity)
  if (descriptions.length >= 5) {
    const last5 = descriptions.slice(-5);
    const wordCounts = last5.map((d) => tokenize(d).length);
    const mean = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
    const variance =
      wordCounts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) /
      wordCounts.length;
    const stdDev = Math.sqrt(variance);

    // If standard deviation is < 1 and mean > 3, suspiciously uniform
    if (stdDev < 1 && mean > 3) {
      patterns.push(
        `Todas las descripciones tienen ~${Math.round(mean)} palabras (σ=${stdDev.toFixed(1)}) — uniformidad robótica`
      );
    }
  }

  return {
    isGaming: patterns.length > 0,
    patterns,
  };
}
