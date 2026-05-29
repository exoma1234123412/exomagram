"use client";

import type { TimeEntry } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { ShieldAlert, ShieldCheck, ShieldX, AlertTriangle, CheckCircle2 } from "lucide-react";

// ============================================================
// Quality Scoring Types
// ============================================================

export interface EntryQualityReport {
 score: number; // 0-100
 grade:"A"|"B"|"C"|"D"|"F";
 issues: string[];
 details: {
 titleLength: number;
 titleScore: number; // 0-20
 descriptionLength: number;
 descriptionWordCount: number;
 descriptionScore: number; // 0-30
 hasProof: boolean;
 proofScore: number; // 0-25
 isLate: boolean;
 timelinessScore: number; // 0-15
 hasProject: boolean;
 projectScore: number; // 0-5
 hasMood: boolean;
 moodScore: number; // 0-5
 descriptionSimilarity: number; // 0-1
 suspiciousCopypaste: boolean;
 };
}

type Grade = EntryQualityReport["grade"];

// ============================================================
// Scoring Rubric
// ============================================================

function scoreTitle(title: string): { score: number; issues: string[] } {
 const len = title.trim().length;
 const issues: string[] = [];

 if (len < 10) {
 issues.push(`Titulo muy corto (${len} chars, minimo 10)`);
 return { score: 0, issues };
 }
 if (len < 20) {
 return { score: 10, issues };
 }
 if (len < 30) {
 return { score: 15, issues };
 }
 return { score: 20, issues };
}

function scoreDescription(description: string | null): {
 score: number;
 wordCount: number;
 charCount: number;
 issues: string[];
} {
 const issues: string[] = [];
 if (!description || description.trim().length === 0) {
 issues.push("Sin descripcion");
 return { score: 0, wordCount: 0, charCount: 0, issues };
 }

 const trimmed = description.trim();
 const words = trimmed.split(/\s+/).filter(Boolean);
 const wordCount = words.length;
 const charCount = trimmed.length;

 if (wordCount < 20) {
 issues.push(`Descripcion corta (${wordCount} palabras, recomendado 20+)`);
 return { score: 10, wordCount, charCount, issues };
 }
 if (wordCount < 50) {
 return { score: 20, wordCount, charCount, issues };
 }
 return { score: 30, wordCount, charCount, issues };
}

function scoreProof(proofUrls: string[] | null): { score: number; issues: string[] } {
 const issues: string[] = [];
 if (!proofUrls || proofUrls.length === 0) {
 issues.push("Sin evidencia adjunta");
 return { score: 0, issues };
 }
 return { score: 25, issues };
}

function scoreTimeliness(isLate: boolean, minutesLate: number): {
 score: number;
 issues: string[];
} {
 const issues: string[] = [];
 if (!isLate) {
 return { score: 15, issues };
 }
 if (minutesLate <= 30) {
 issues.push(`Entrada tardia (${minutesLate}min)`);
 return { score: 10, issues };
 }
 if (minutesLate <= 60) {
 issues.push(`Entrada tardia (${minutesLate}min)`);
 return { score: 5, issues };
 }
 issues.push(`Entrada muy tardia (${minutesLate}min)`);
 return { score: 0, issues };
}

function scoreProject(project: string | null): { score: number; issues: string[] } {
 if (project && project.trim().length > 0) {
 return { score: 5, issues: [] };
 }
 return { score: 0, issues: ["Sin proyecto asignado"] };
}

function scoreMood(mood: number | null, energy: number | null): {
 score: number;
 issues: string[];
} {
 if (mood !== null || energy !== null) {
 return { score: 5, issues: [] };
 }
 return { score: 0, issues: ["Sin estado de animo/energia"] };
}

/**
 * Compute similarity between a description and recent entries.
 * Uses a simple Jaccard coefficient on word sets.
 */
function computeSimilarity(
 description: string | null,
 recentDescriptions: string[]
): { similarity: number; suspicious: boolean } {
 if (!description || description.trim().length === 0 || recentDescriptions.length === 0) {
 return { similarity: 0, suspicious: false };
 }

 const normalize = (s: string) =>
 s
 .toLowerCase()
 .replace(/[^a-z0-9\u00e0-\u00ff\s]/g,"")
 .split(/\s+/)
 .filter((w) => w.length > 2);

 const targetWords = new Set(normalize(description));
 if (targetWords.size === 0) return { similarity: 0, suspicious: false };

 let maxSimilarity = 0;
 for (const recent of recentDescriptions) {
 const recentWords = new Set(normalize(recent));
 if (recentWords.size === 0) continue;

 const intersection = new Set([...targetWords].filter((w) => recentWords.has(w)));
 const union = new Set([...targetWords, ...recentWords]);
 const jaccard = intersection.size / union.size;

 if (jaccard > maxSimilarity) {
 maxSimilarity = jaccard;
 }
 }

 return {
 similarity: Math.round(maxSimilarity * 100) / 100,
 suspicious: maxSimilarity > 0.8,
 };
}

// ============================================================
// Main Analysis Function
// ============================================================

/**
 * Analyze the quality of a time entry and return a detailed report.
 *
 * @param entry - The time entry to analyze
 * @param recentDescriptions - Optional array of recent descriptions for copy-paste detection
 */
export function analyzeEntryQuality(
 entry: Pick<
 TimeEntry,
 |"title"|"description"|"proof_urls"|"is_late"|"minutes_late"|"project"|"mood"|"energy">,
 recentDescriptions: string[] = []
): EntryQualityReport {
 const titleResult = scoreTitle(entry.title);
 const descResult = scoreDescription(entry.description);
 const proofResult = scoreProof(entry.proof_urls);
 const timeResult = scoreTimeliness(entry.is_late, entry.minutes_late);
 const projectResult = scoreProject(entry.project);
 const moodResult = scoreMood(entry.mood, entry.energy);
 const similarity = computeSimilarity(entry.description, recentDescriptions);

 const allIssues = [
 ...titleResult.issues,
 ...descResult.issues,
 ...proofResult.issues,
 ...timeResult.issues,
 ...projectResult.issues,
 ...moodResult.issues,
 ];

 if (similarity.suspicious) {
 allIssues.push("Descripcion sospechosamente similar a entradas recientes");
 }

 const totalScore =
 titleResult.score +
 descResult.score +
 proofResult.score +
 timeResult.score +
 projectResult.score +
 moodResult.score;

 let grade: Grade;
 if (totalScore >= 85) grade ="A";
 else if (totalScore >= 70) grade ="B";
 else if (totalScore >= 55) grade ="C";
 else if (totalScore >= 40) grade ="D";
 else grade ="F";

 return {
 score: totalScore,
 grade,
 issues: allIssues,
 details: {
 titleLength: entry.title.trim().length,
 titleScore: titleResult.score,
 descriptionLength: descResult.charCount,
 descriptionWordCount: descResult.wordCount,
 descriptionScore: descResult.score,
 hasProof: (entry.proof_urls?.length ?? 0) > 0,
 proofScore: proofResult.score,
 isLate: entry.is_late,
 timelinessScore: timeResult.score,
 hasProject: !!entry.project && entry.project.trim().length > 0,
 projectScore: projectResult.score,
 hasMood: entry.mood !== null || entry.energy !== null,
 moodScore: moodResult.score,
 descriptionSimilarity: similarity.similarity,
 suspiciousCopypaste: similarity.suspicious,
 },
 };
}

// ============================================================
// Grade Configuration
// ============================================================

const GRADE_CONFIG: Record<
 Grade,
 {
 bg: string;
 text: string;
 border: string;
 label: string;
 pulse: boolean;
 }
> = {
 A: {
 bg:"bg-green-500/10",
 text:"text-green-600 dark:text-green-400",
 border:"border-green-500/30",
 label:"Excelente",
 pulse: false,
 },
 B: {
 bg:"bg-blue-500/10",
 text:"text-blue-600 dark:text-blue-400",
 border:"border-blue-500/30",
 label:"Buena",
 pulse: false,
 },
 C: {
 bg:"bg-amber-500/10",
 text:"text-amber-600 dark:text-amber-400",
 border:"border-amber-500/30",
 label:"Aceptable",
 pulse: false,
 },
 D: {
 bg:"bg-orange-500/10",
 text:"text-orange-600 dark:text-orange-400",
 border:"border-orange-500/30",
 label:"Deficiente",
 pulse: false,
 },
 F: {
 bg:"bg-red-500/10",
 text:"text-red-600 dark:text-red-400",
 border:"border-red-500/30",
 label:"Insuficiente",
 pulse: true,
 },
};

// ============================================================
// EntryQualityBadge — Inline grade indicator
// ============================================================

interface EntryQualityBadgeProps {
 entry: Pick<
 TimeEntry,
 |"title"|"description"|"proof_urls"|"is_late"|"minutes_late"|"project"|"mood"|"energy">;
 recentDescriptions?: string[];
 showScore?: boolean;
 className?: string;
}

export function EntryQualityBadge({
 entry,
 recentDescriptions = [],
 showScore = false,
 className,
}: EntryQualityBadgeProps) {
 const report = analyzeEntryQuality(entry, recentDescriptions);
 const config = GRADE_CONFIG[report.grade];

 return (
 <span
 className={cn(
"inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider px-1.5 py-0.5 border",
 config.bg,
 config.text,
 config.border,
 config.pulse &&"animate-pulse",
 className
 )}
 title={`Calidad: ${report.score}/100 — ${config.label}`}
 >
 {report.grade}
 {showScore && (
 <span className="font-mono tabular-nums opacity-70">{report.score}</span>
 )}
 </span>
 );
}

// ============================================================
// EntryQualityBreakdown — Full scoring breakdown
// ============================================================

interface EntryQualityBreakdownProps {
 report: EntryQualityReport;
 className?: string;
}

export function EntryQualityBreakdown({ report, className }: EntryQualityBreakdownProps) {
 const config = GRADE_CONFIG[report.grade];

 const rows: { label: string; score: number; max: number; icon: React.ReactNode }[] = [
 {
 label:"TITULO",
 score: report.details.titleScore,
 max: 20,
 icon: report.details.titleScore >= 15 ? (
 <CheckCircle2 className="w-3 h-3 text-green-500"/>
 ) : (
 <AlertTriangle className="w-3 h-3 text-amber-500"/>
 ),
 },
 {
 label:"DESCRIPCION",
 score: report.details.descriptionScore,
 max: 30,
 icon: report.details.descriptionScore >= 20 ? (
 <CheckCircle2 className="w-3 h-3 text-green-500"/>
 ) : (
 <AlertTriangle className="w-3 h-3 text-amber-500"/>
 ),
 },
 {
 label:"EVIDENCIA",
 score: report.details.proofScore,
 max: 25,
 icon: report.details.hasProof ? (
 <ShieldCheck className="w-3 h-3 text-green-500"/>
 ) : (
 <ShieldX className="w-3 h-3 text-red-500"/>
 ),
 },
 {
 label:"PUNTUALIDAD",
 score: report.details.timelinessScore,
 max: 15,
 icon: report.details.timelinessScore >= 15 ? (
 <CheckCircle2 className="w-3 h-3 text-green-500"/>
 ) : (
 <AlertTriangle className="w-3 h-3 text-amber-500"/>
 ),
 },
 {
 label:"PROYECTO",
 score: report.details.projectScore,
 max: 5,
 icon: report.details.hasProject ? (
 <CheckCircle2 className="w-3 h-3 text-green-500"/>
 ) : (
 <AlertTriangle className="w-3 h-3 text-muted-foreground"/>
 ),
 },
 {
 label:"ANIMO",
 score: report.details.moodScore,
 max: 5,
 icon: report.details.hasMood ? (
 <CheckCircle2 className="w-3 h-3 text-green-500"/>
 ) : (
 <AlertTriangle className="w-3 h-3 text-muted-foreground"/>
 ),
 },
 ];

 return (
 <div className={cn("border border-border", className)}>
 {/* Header */}
 <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-accent/30">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Quality Gate
 </span>
 <div className="flex items-center gap-2">
 <span
 className={cn(
"font-mono text-lg font-bold tabular-nums",
 config.text,
 config.pulse &&"animate-pulse")}
 >
 {report.grade}
 </span>
 <span className="font-mono text-xs tabular-nums text-muted-foreground">
 {report.score}/100
 </span>
 </div>
 </div>

 {/* Score bars */}
 <div className="divide-y divide-border">
 {rows.map((row) => {
 const pct = row.max > 0 ? (row.score / row.max) * 100 : 0;
 return (
 <div key={row.label} className="flex items-center gap-2 px-3 py-1.5">
 {row.icon}
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60 w-24">
 {row.label}
 </span>
 <div className="flex-1 h-1.5 bg-accent/40 overflow-hidden">
 <div
 className={cn(
"h-full transition-all duration-500",
 pct >= 80 ?"bg-green-500": pct >= 50 ?"bg-amber-500":"bg-red-500")}
 style={{ width:`${pct}%`}}
 />
 </div>
 <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-10 text-right">
 {row.score}/{row.max}
 </span>
 </div>
 );
 })}
 </div>

 {/* Issues */}
 {report.issues.length > 0 && (
 <div className="border-t border-border px-3 py-2">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Problemas
 </span>
 <ul className="mt-1 space-y-0.5">
 {report.issues.map((issue, i) => (
 <li
 key={i}
 className="flex items-start gap-1.5 text-[11px] font-mono text-muted-foreground">
 <ShieldAlert className="w-3 h-3 mt-0.5 text-red-400 shrink-0"/>
 {issue}
 </li>
 ))}
 </ul>
 </div>
 )}

 {/* Copy-paste warning */}
 {report.details.suspiciousCopypaste && (
 <div className="border-t border-destructive/20 bg-destructive/5 px-3 py-2">
 <div className="flex items-center gap-1.5 text-[11px] font-mono text-destructive">
 <ShieldAlert className="w-3.5 h-3.5"/>
 Descripcion sospechosamente similar a entradas recientes (
 {Math.round(report.details.descriptionSimilarity * 100)}% similitud)
 </div>
 </div>
 )}
 </div>
 );
}
