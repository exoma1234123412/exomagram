"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { cn, getTodayMTY } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
 FileWarning,
 Eye,
 EyeOff,
 Send,
 Lock,
 Unlock,
 Shield,
 Loader2,
 Star,
 CheckCircle2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnvelopeReport {
 trabajoMenos: string;
 razonTrabajoMenos: string;
 masSospechoso: string;
 patronNotado: string;
 calificacion: number;
 weekStart: string;
 submittedAt: string;
}

interface StoredEnvelopeData {
 reports: Record<string, EnvelopeReport>; // keyed by weekStart
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWeekStart(dateStr: string): string {
 const d = new Date(dateStr +"T12:00:00");
 const day = d.getDay();
 const diff = day === 0 ? 6 : day - 1; // Monday = start
 d.setDate(d.getDate() - diff);
 return d.toISOString().split("T")[0];
}

function getWeeklyAuditor(
 weekStart: string,
 orgId: string,
 memberIds: string[]
): string {
 let hash = 0;
 const seed = weekStart + orgId;
 for (let i = 0; i < seed.length; i++) {
 hash = ((hash << 5) - hash) + seed.charCodeAt(i);
 hash |= 0;
 }
 return memberIds[Math.abs(hash) % memberIds.length];
}

function isFridayOrLater(): boolean {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 return now.getDay() === 5 || now.getDay() === 6 || now.getDay() === 0;
}

function getDayOfWeek(): number {
 const now = new Date(
 new Date().toLocaleString("en-US", { timeZone:"America/Monterrey"})
 );
 return now.getDay();
}

function formatWeekLabel(weekStart: string): string {
 const d = new Date(weekStart +"T12:00:00");
 const end = new Date(d);
 end.setDate(end.getDate() + 4); // Friday
 const startDay = d.getDate();
 const endDay = end.getDate();
 const months = [
"Ene","Feb","Mar","Abr","May","Jun",
"Jul","Ago","Sep","Oct","Nov","Dic",
 ];
 const startMonth = months[d.getMonth()];
 const endMonth = months[end.getMonth()];
 if (startMonth === endMonth) {
 return`${startDay}-${endDay} ${startMonth}`;
 }
 return`${startDay} ${startMonth} - ${endDay} ${endMonth}`;
}

function getStorageKey(userId: string, orgId: string): string {
 return`exoma_envelope_${userId}_${orgId}`;
}

function loadEnvelopeData(
 userId: string,
 orgId: string
): StoredEnvelopeData {
 try {
 const raw = localStorage.getItem(getStorageKey(userId, orgId));
 if (raw) return JSON.parse(raw);
 } catch {
 // ignore
 }
 return { reports: {} };
}

function saveEnvelopeData(
 userId: string,
 orgId: string,
 data: StoredEnvelopeData
): void {
 localStorage.setItem(getStorageKey(userId, orgId), JSON.stringify(data));
}

// Past weeks for simulated history
function getPastWeekStarts(currentWeekStart: string, count: number): string[] {
 const weeks: string[] = [];
 const d = new Date(currentWeekStart +"T12:00:00");
 for (let i = 1; i <= count; i++) {
 const past = new Date(d);
 past.setDate(past.getDate() - 7 * i);
 weeks.push(past.toISOString().split("T")[0]);
 }
 return weeks;
}

// ---------------------------------------------------------------------------
// Wax Seal Component
// ---------------------------------------------------------------------------

function WaxSeal({ broken }: { broken: boolean }) {
 return (
 <div
 className={cn(
"relative w-16 h-16 flex items-center justify-center transition-all duration-700",
 broken &&"opacity-40 scale-90")}
 >
 {/* Seal body */}
 <div
 className={cn(
"absolute inset-0 rounded-full border-2 transition-all duration-700",
 broken
 ?"border-red-400/30 bg-red-950/20":"border-red-700/60 bg-gradient-to-br from-red-800 to-red-950 shadow-[0_0_20px_rgba(220,38,38,0.3)]")}
 />
 {/* Inner ring */}
 <div
 className={cn(
"absolute inset-2 rounded-full border transition-all duration-700",
 broken
 ?"border-red-400/10":"border-red-600/40")}
 />
 {/* Icon */}
 {broken ? (
 <Unlock className="w-5 h-5 text-red-400/40 relative z-10"/>
 ) : (
 <Lock className="w-5 h-5 text-red-300/80 relative z-10 animate-pulse"/>
 )}
 {/* Drip effect for unbroken seal */}
 {!broken && (
 <>
 <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-4 bg-red-900/60 rounded-b-full"/>
 <div className="absolute -bottom-0.5 left-1/3 w-2 h-3 bg-red-900/40 rounded-b-full"/>
 </>
 )}
 </div>
 );
}

// ---------------------------------------------------------------------------
// Star Rating Component
// ---------------------------------------------------------------------------

function StarRating({
 value,
 onChange,
 readonly = false,
}: {
 value: number;
 onChange?: (v: number) => void;
 readonly?: boolean;
}) {
 return (
 <div className="flex gap-1">
 {[1, 2, 3, 4, 5].map((n) => (
 <button
 key={n}
 type="button"disabled={readonly}
 onClick={() => onChange?.(n)}
 className={cn(
"transition-all duration-200",
 readonly ?"cursor-default":"cursor-pointer hover:scale-110",
 )}
 >
 <Star
 className={cn(
"w-5 h-5 transition-colors duration-200",
 n <= value
 ?"text-amber-500 fill-amber-500":"text-muted-foreground/20")}
 />
 </button>
 ))}
 </div>
 );
}

// ---------------------------------------------------------------------------
// Eye Animation
// ---------------------------------------------------------------------------

function WatchingEye() {
 const [offsetX, setOffsetX] = useState(0);
 const [offsetY, setOffsetY] = useState(0);

 useEffect(() => {
 const interval = setInterval(() => {
 setOffsetX(Math.random() * 4 - 2);
 setOffsetY(Math.random() * 2 - 1);
 }, 2000);
 return () => clearInterval(interval);
 }, []);

 return (
 <div className="relative w-10 h-6 flex items-center justify-center">
 {/* Eye shape */}
 <div className="absolute inset-0 border border-muted-foreground/20 rounded-[50%] overflow-hidden">
 {/* Iris */}
 <div
 className="absolute w-3 h-3 rounded-full bg-primary/60 top-1/2 left-1/2 transition-all duration-1000 ease-in-out"style={{
 transform:`translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
 }}
 >
 {/* Pupil */}
 <div className="absolute w-1.5 h-1.5 rounded-full bg-foreground/80 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"/>
 </div>
 </div>
 </div>
 );
}

// ---------------------------------------------------------------------------
// Sealed Envelope Card
// ---------------------------------------------------------------------------

function SealedEnvelopeCard({
 weekStart,
 isRevealed,
 report,
 auditorName,
 isCurrentWeek,
}: {
 weekStart: string;
 isRevealed: boolean;
 report: EnvelopeReport | null;
 auditorName: string | null;
 isCurrentWeek: boolean;
}) {
 const [animateOpen, setAnimateOpen] = useState(false);

 useEffect(() => {
 if (isRevealed && report) {
 const timer = setTimeout(() => setAnimateOpen(true), 300);
 return () => clearTimeout(timer);
 }
 }, [isRevealed, report]);

 return (
 <Card
 className={cn(
"relative overflow-hidden border transition-colors duration-200",
 isCurrentWeek
 ?"border-primary/30":"border-border",
 !isRevealed &&"hover:border-red-500/20")}
 >
 <CardContent className="p-0">
 {/* Envelope header */}
 <div
 className={cn(
"px-5 py-4 flex items-center justify-between",
 !isRevealed &&"bg-muted/30")}
 >
 <div className="flex items-center gap-3">
 <WaxSeal broken={isRevealed} />
 <div>
 <p className="font-mono text-xs tracking-[0.18em] uppercase text-muted-foreground">
 {isCurrentWeek ?"ESTA SEMANA":"SEMANA"}
 </p>
 <p className="font-mono font-bold text-sm tracking-tight">
 {formatWeekLabel(weekStart)}
 </p>
 </div>
 </div>

 {!isRevealed ? (
 <div className="flex items-center gap-2">
 <Lock className="w-3.5 h-3.5 text-red-500/50"/>
 <span className="font-mono text-[10px] tracking-wider uppercase text-red-500/50">
 SELLADO
 </span>
 </div>
 ) : (
 <div className="flex items-center gap-2">
 <Unlock className="w-3.5 h-3.5 text-primary/50"/>
 <span className="font-mono text-[10px] tracking-wider uppercase text-primary/50">
 ABIERTO
 </span>
 </div>
 )}
 </div>

 {/* Sealed state */}
 {!isRevealed && (
 <div className="px-5 py-6 text-center border-t border-border">
 <p className="font-mono text-xs text-muted-foreground/60">
 Este sobre se abrirá el viernes
 </p>
 <div className="flex items-center justify-center gap-2 mt-2">
 <div className="w-1.5 h-1.5 rounded-full bg-red-500/50 animate-pulse"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/40">
 CONFIDENCIAL
 </span>
 </div>
 </div>
 )}

 {/* Revealed state */}
 {isRevealed && report && (
 <div
 className={cn(
"border-t border-border overflow-hidden transition-all duration-700",
 animateOpen ?"max-h-[600px] opacity-100":"max-h-0 opacity-0")}
 >
 <div className="px-5 py-4 space-y-4">
 {/* Who worked least */}
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
 TRABAJÓ MENOS
 </p>
 <p className="text-sm font-medium">{report.trabajoMenos ||"No especificado"}</p>
 {report.razonTrabajoMenos && (
 <p className="text-xs text-muted-foreground mt-0.5 italic">
 {`\u201C${report.razonTrabajoMenos}\u201D`}
 </p>
 )}
 </div>

 {/* Most suspicious */}
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
 MÁS SOSPECHOSO
 </p>
 <p className="text-sm font-medium">{report.masSospechoso ||"No especificado"}</p>
 </div>

 {/* Pattern noticed */}
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
 PATRÓN DETECTADO
 </p>
 <p className="text-sm text-muted-foreground">
 {report.patronNotado ||"Ninguno reportado"}
 </p>
 </div>

 {/* Rating */}
 <div className="flex items-center justify-between">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 CALIFICACIÓN DEL EQUIPO
 </p>
 <StarRating value={report.calificacion} readonly />
 </div>
 </div>

 {/* Auditor reveal */}
 <div className="px-5 py-3 bg-muted/20 border-t border-border flex items-center justify-between">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 AUDITOR
 </span>
 <Badge variant="outline"className="font-mono text-[10px]">
 <EyeOff className="w-3 h-3 mr-1"/>
 Anónimo
 </Badge>
 </div>
 </div>
 )}

 {/* Revealed but no report */}
 {isRevealed && !report && (
 <div className="px-5 py-6 text-center border-t border-border">
 <p className="font-mono text-xs text-muted-foreground">
 El auditor no envió reporte esta semana
 </p>
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EnvelopePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
 const [memberIds, setMemberIds] = useState<string[]>([]);
 const [loading, setLoading] = useState(true);

 // Form state
 const [trabajoMenos, setTrabajoMenos] = useState("");
 const [razonTrabajoMenos, setRazonTrabajoMenos] = useState("");
 const [masSospechoso, setMasSospechoso] = useState("");
 const [patronNotado, setPatronNotado] = useState("");
 const [calificacion, setCalificacion] = useState(3);
 const [submitted, setSubmitted] = useState(false);
 const [submitting, setSubmitting] = useState(false);

 const today = getTodayMTY();
 const weekStart = getWeekStart(today);

 // Load members
 const loadMembers = useCallback(async () => {
 if (!orgId) return;

 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const pMap = new Map<string, Profile>();
 const ids: string[] = [];

 for (const m of members ?? []) {
 if (m.profiles) {
 const p = m.profiles as unknown as Profile;
 pMap.set(m.user_id, p);
 ids.push(m.user_id);
 }
 }

 // Sort IDs deterministically for consistent auditor selection
 ids.sort();

 setProfiles(pMap);
 setMemberIds(ids);
 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (!orgId) return;
 loadMembers();
 }, [orgId, loadMembers]);

 // Load saved report from localStorage
 useEffect(() => {
 if (!userId || !orgId) return;
 const data = loadEnvelopeData(userId, orgId);
 const existing = data.reports[weekStart];
 if (existing) {
 setSubmitted(true);
 setTrabajoMenos(existing.trabajoMenos);
 setRazonTrabajoMenos(existing.razonTrabajoMenos);
 setMasSospechoso(existing.masSospechoso);
 setPatronNotado(existing.patronNotado);
 setCalificacion(existing.calificacion);
 }
 }, [userId, orgId, weekStart]);

 // Computed values
 const auditorId = useMemo(() => {
 if (memberIds.length === 0 || !orgId) return null;
 return getWeeklyAuditor(weekStart, orgId, memberIds);
 }, [weekStart, orgId, memberIds]);

 const isAuditor = userId === auditorId;
 const fridayRevealed = isFridayOrLater();
 const dayOfWeek = getDayOfWeek();

 // Past weeks for history
 const pastWeeks = useMemo(() => getPastWeekStarts(weekStart, 4), [weekStart]);

 // Get report for a week from localStorage
 function getReport(week: string): EnvelopeReport | null {
 if (!userId || !orgId) return null;
 const data = loadEnvelopeData(userId, orgId);
 return data.reports[week] ?? null;
 }

 // Days until Friday
 const daysUntilFriday = useMemo(() => {
 // 0=Sun,1=Mon...5=Fri,6=Sat
 if (dayOfWeek === 5) return 0;
 if (dayOfWeek === 6) return 6;
 if (dayOfWeek === 0) return 5;
 return 5 - dayOfWeek;
 }, [dayOfWeek]);

 // Weeks of active surveillance (simulated)
 const activeWeeks = useMemo(() => {
 if (!userId || !orgId) return 0;
 const data = loadEnvelopeData(userId, orgId);
 return Object.keys(data.reports).length + pastWeeks.length;
 }, [userId, orgId, pastWeeks]);

 // Submit report
 async function submitReport() {
 if (!userId || !orgId) return;
 if (!trabajoMenos.trim() && !masSospechoso.trim()) return;
 setSubmitting(true);

 const report: EnvelopeReport = {
 trabajoMenos: trabajoMenos.trim(),
 razonTrabajoMenos: razonTrabajoMenos.trim(),
 masSospechoso: masSospechoso.trim(),
 patronNotado: patronNotado.trim(),
 calificacion,
 weekStart,
 submittedAt: new Date().toISOString(),
 };

 const data = loadEnvelopeData(userId, orgId);
 data.reports[weekStart] = report;
 saveEnvelopeData(userId, orgId, data);

 setSubmitted(true);
 setSubmitting(false);
 }

 // Loading
 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <div className="flex items-center gap-3 mb-2">
 <FileWarning className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Sobre Sellado
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground">
 Cada semana, un auditor secreto observa al equipo y envía un reporte anónimo
 </p>
 </div>

 {/* Paranoid tension banner */}
 <div className="mb-8">
 <Card className="border border-red-500/20 bg-red-950/5">
 <CardContent className="px-5 py-4">
 <div className="flex items-center gap-4">
 <div className="shrink-0">
 <WatchingEye />
 </div>
 <div className="flex-1 min-w-0">
 {isAuditor ? (
 <>
 <p className="font-mono text-sm font-bold text-red-500 tracking-tight">
 Eres el auditor secreto esta semana
 </p>
 <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
 Nadie sabe que eres tú. Observa. Documenta. Reporta.
 </p>
 </>
 ) : (
 <>
 <p className="font-mono text-sm font-bold tracking-tight">
 Un miembro del equipo te está observando
 </p>
 <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
 Alguien fue designado como auditor secreto. No sabes quién.
 </p>
 </>
 )}
 </div>
 <div className="shrink-0 flex items-center gap-1.5">
 <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-red-500/60">
 ACTIVO
 </span>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Stats row */}
 <div className="grid grid-cols-3 gap-3 mb-8">
 <div className="bg-accent/30 border border-border px-4 py-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 SEMANAS VIGILANCIA
 </p>
 <p className="font-mono text-2xl font-bold tabular-nums tracking-tight mt-1">
 {activeWeeks}
 </p>
 </div>
 <div className="bg-accent/30 border border-border px-4 py-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 DÍAS PARA APERTURA
 </p>
 <p className={cn(
"font-mono text-2xl font-bold tabular-nums tracking-tight mt-1",
 daysUntilFriday <= 1 &&"text-red-500")}>
 {fridayRevealed ? 0 : daysUntilFriday}
 </p>
 </div>
 <div className="bg-accent/30 border border-border px-4 py-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 OBSERVADORES
 </p>
 <p className="font-mono text-2xl font-bold tabular-nums tracking-tight mt-1">
 {memberIds.length}
 </p>
 </div>
 </div>

 {/* Auditor form — only visible to the designated auditor */}
 {isAuditor && (
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 REPORTE DEL AUDITOR
 </p>

 {submitted ? (
 <Card className="border border-primary/20">
 <CardContent className="px-5 py-6">
 <div className="flex items-center gap-3 mb-4">
 <CheckCircle2 className="w-5 h-5 text-primary"/>
 <p className="font-mono text-sm font-bold tracking-tight">
 Reporte enviado
 </p>
 </div>
 <p className="font-mono text-xs text-muted-foreground">
 Tu reporte será revelado el viernes. Tu identidad permanecerá anónima.
 </p>

 {/* Preview of submitted report */}
 <div className="mt-4 space-y-3 pt-4 border-t border-border">
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 TRABAJÓ MENOS
 </p>
 <p className="text-sm mt-0.5">{trabajoMenos ||"---"}</p>
 </div>
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 MÁS SOSPECHOSO
 </p>
 <p className="text-sm mt-0.5">{masSospechoso ||"---"}</p>
 </div>
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 PATRÓN
 </p>
 <p className="text-sm mt-0.5">{patronNotado ||"---"}</p>
 </div>
 <div className="flex items-center justify-between">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 CALIFICACIÓN
 </p>
 <StarRating value={calificacion} readonly />
 </div>
 </div>
 </CardContent>
 </Card>
 ) : (
 <Card className="border border-red-500/20">
 <CardContent className="px-5 py-5 space-y-5">
 {/* Quien trabajo menos */}
 <div>
 <label className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground block mb-1.5">
 ¿Quién trabajó menos?
 </label>
 <Input
 value={trabajoMenos}
 onChange={(e) => setTrabajoMenos(e.target.value)}
 placeholder="Nombre del miembro"className="font-mono text-sm"autoComplete="off"/>
 <Input
 value={razonTrabajoMenos}
 onChange={(e) => setRazonTrabajoMenos(e.target.value)}
 placeholder="Razón"className="font-mono text-sm mt-2"autoComplete="off"/>
 </div>

 {/* Mas sospechoso */}
 <div>
 <label className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground block mb-1.5">
 ¿Quién fue más sospechoso?
 </label>
 <Input
 value={masSospechoso}
 onChange={(e) => setMasSospechoso(e.target.value)}
 placeholder="Nombre y comportamiento sospechoso"className="font-mono text-sm"autoComplete="off"/>
 </div>

 {/* Patron */}
 <div>
 <label className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground block mb-1.5">
 ¿Qué patrón notaste?
 </label>
 <Textarea
 value={patronNotado}
 onChange={(e) => setPatronNotado(e.target.value)}
 placeholder="Describe patrones, anomalías, o comportamiento inusual..."className="font-mono text-sm min-h-[80px]"autoComplete="off"/>
 </div>

 {/* Calificacion */}
 <div>
 <label className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground block mb-2">
 Calificación del equipo
 </label>
 <StarRating value={calificacion} onChange={setCalificacion} />
 </div>

 {/* Submit */}
 <div className="flex items-center justify-between pt-2">
 <div className="flex items-center gap-1.5">
 <Shield className="w-3.5 h-3.5 text-muted-foreground"/>
 <span className="font-mono text-[9px] text-muted-foreground">
 100% ANÓNIMO
 </span>
 </div>
 <Button
 onClick={submitReport}
 disabled={
 submitting ||
 (!trabajoMenos.trim() && !masSospechoso.trim())
 }
 className="bg-primary text-primary-foreground font-mono text-xs gap-2">
 {submitting ? (
 <Loader2 className="w-3.5 h-3.5 animate-spin"/>
 ) : (
 <Send className="w-3.5 h-3.5"/>
 )}
 {submitting ?"Enviando...":"Sellar y enviar"}
 </Button>
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 )}

 {/* Current week envelope */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 SOBRE DE ESTA SEMANA
 </p>
 <SealedEnvelopeCard
 weekStart={weekStart}
 isRevealed={fridayRevealed}
 report={isAuditor ? getReport(weekStart) : null}
 auditorName={null}
 isCurrentWeek
 />
 {fridayRevealed && !isAuditor && (
 <div className="mt-3 px-4 py-3 border border-border bg-muted/20">
 <div className="flex items-center gap-2">
 <EyeOff className="w-3.5 h-3.5 text-muted-foreground"/>
 <p className="font-mono text-[10px] text-muted-foreground/60">
 Solo el auditor designado puede ver el contenido del reporte
 </p>
 </div>
 </div>
 )}
 </div>

 {/* Past weeks */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 SOBRES ANTERIORES
 </p>
 <div className="space-y-3">
 {pastWeeks.map((pw) => {
 const pastAuditor =
 memberIds.length > 0 && orgId
 ? getWeeklyAuditor(pw, orgId, memberIds)
 : null;
 const wasAuditor = pastAuditor === userId;
 return (
 <SealedEnvelopeCard
 key={pw}
 weekStart={pw}
 isRevealed
 report={wasAuditor ? getReport(pw) : null}
 auditorName={null}
 isCurrentWeek={false}
 />
 );
 })}
 </div>
 </div>

 {/* Paranoia footer */}
 <div className="mb-8">
 <Card className="border border-border bg-muted/10">
 <CardContent className="px-5 py-6">
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 border border-border flex items-center justify-center shrink-0">
 <Eye className="w-6 h-6 text-primary/30"/>
 </div>
 <div>
 <p className="font-mono text-xs font-bold tracking-tight mb-1">
 Alguien te está observando. No sabes quién.
 </p>
 <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
 Cada semana se selecciona un auditor de forma aleatoria y determinista.
 Su identidad permanece secreta. El reporte se revela el viernes.
 Nunca sabrás quién te estuvo vigilando.
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* How it works */}
 <div className="mb-8">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
 CÓMO FUNCIONA
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 {[
 {
 icon: Eye,
 title:"Selecci\u00f3n secreta",
 desc:"Cada lunes se designa un auditor al azar. Solo esa persona lo sabe.",
 },
 {
 icon: FileWarning,
 title:"Reporte sellado",
 desc:"El auditor observa toda la semana y env\u00eda su reporte de forma an\u00f3nima.",
 },
 {
 icon: Unlock,
 title:"Apertura viernes",
 desc:"El sobre se abre el viernes. Los hallazgos se revelan. El autor nunca.",
 },
 ].map((step, i) => (
 <div
 key={i}
 className="border border-border px-4 py-3">
 <step.icon className="w-4 h-4 text-primary/40 mb-2"/>
 <p className="font-mono text-xs font-bold tracking-tight mb-1">
 {step.title}
 </p>
 <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
 {step.desc}
 </p>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}
