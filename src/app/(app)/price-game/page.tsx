"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getInitials, cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory, Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
 DollarSign,
 Plus,
 Clock,
 Target,
 Trophy,
 Users,
 ChevronRight,
 Check,
 Star,
 TrendingDown,
 TrendingUp,
 Timer,
 Sparkles,
 X,
 BarChart3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Estimate {
 userId: string;
 hours: number;
}

interface PriceRound {
 id: string;
 task: string;
 assigneeId: string;
 category: WorkCategory;
 estimates: Estimate[];
 actualHours: number | null;
 status:"voting"|"in_progress"|"completed";
 createdAt: string;
}

interface TeamMember {
 user_id: string;
 profile: Profile;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
 return`${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getStorageKey(orgId: string): string {
 return`exomagram_price_${orgId}`;
}

function loadRounds(orgId: string): PriceRound[] {
 if (typeof window ==="undefined") return [];
 try {
 const raw = localStorage.getItem(getStorageKey(orgId));
 return raw ? JSON.parse(raw) : [];
 } catch {
 return [];
 }
}

function saveRounds(orgId: string, rounds: PriceRound[]) {
 if (typeof window ==="undefined") return;
 localStorage.setItem(getStorageKey(orgId), JSON.stringify(rounds));
}

function calcAvgEstimate(estimates: Estimate[]): number {
 if (estimates.length === 0) return 0;
 const sum = estimates.reduce((acc, e) => acc + e.hours, 0);
 return sum / estimates.length;
}

function calcAccuracy(estimated: number, actual: number): number {
 if (actual === 0) return estimated === 0 ? 100 : 0;
 const diff = Math.abs(estimated - actual);
 return Math.max(0, Math.round((1 - diff / actual) * 100));
}

const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

const CATEGORY_OPTIONS = Object.entries(CATEGORIES).map(([key, val]) => ({
 value: key as WorkCategory,
 label: val.label,
 emoji: val.emoji,
}));

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PriceGamePage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [rounds, setRounds] = useState<PriceRound[]>([]);
 const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
 const [profileMap, setProfileMap] = useState<Map<string, Profile>>(new Map());
 const [loading, setLoading] = useState(true);
 const [activeTab, setActiveTab] = useState("active");

 // New round form
 const [showForm, setShowForm] = useState(false);
 const [newTask, setNewTask] = useState("");
 const [newCategory, setNewCategory] = useState<WorkCategory>("deep_work");
 const [newAssignee, setNewAssignee] = useState("");

 // Reveal animation
 const [revealingRound, setRevealingRound] = useState<string | null>(null);
 const [revealStep, setRevealStep] = useState(0);

 // Actual hours input
 const [actualInput, setActualInput] = useState<Record<string, string>>({});

 // -----------------------------------------------------------------------
 // Load team members
 // -----------------------------------------------------------------------

 const loadTeam = useCallback(async () => {
 if (!orgId) return;

 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 const pMap = new Map<string, Profile>();
 const team: TeamMember[] = [];
 for (const m of members ?? []) {
 if (m.profiles) {
 const p = m.profiles as unknown as Profile;
 pMap.set(m.user_id, p);
 team.push({ user_id: m.user_id, profile: p });
 }
 }
 setProfileMap(pMap);
 setTeamMembers(team);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (orgLoading || !orgId) return;
 loadTeam().then(() => {
 setRounds(loadRounds(orgId));
 setLoading(false);
 });
 }, [orgId, orgLoading, loadTeam]);

 // Persist rounds to localStorage
 useEffect(() => {
 if (!orgId || loading) return;
 saveRounds(orgId, rounds);
 }, [rounds, orgId, loading]);

 // -----------------------------------------------------------------------
 // Actions
 // -----------------------------------------------------------------------

 function createRound() {
 if (!orgId || !newTask.trim() || !newAssignee) return;

 const round: PriceRound = {
 id: generateId(),
 task: newTask.trim(),
 assigneeId: newAssignee,
 category: newCategory,
 estimates: [],
 actualHours: null,
 status:"voting",
 createdAt: new Date().toISOString(),
 };

 setRounds((prev) => [round, ...prev]);
 setNewTask("");
 setNewCategory("deep_work");
 setNewAssignee("");
 setShowForm(false);
 }

 function submitEstimate(roundId: string, hours: number) {
 if (!userId) return;
 setRounds((prev) =>
 prev.map((r) => {
 if (r.id !== roundId) return r;
 // Replace existing estimate from this user
 const filtered = r.estimates.filter((e) => e.userId !== userId);
 return { ...r, estimates: [...filtered, { userId, hours }] };
 })
 );
 }

 function startWork(roundId: string) {
 setRounds((prev) =>
 prev.map((r) => (r.id === roundId ? { ...r, status:"in_progress"} : r))
 );
 }

 function completeRound(roundId: string) {
 const hours = parseFloat(actualInput[roundId] ??"0");
 if (hours <= 0 || hours > 24) return;

 // Start reveal animation
 setRevealingRound(roundId);
 setRevealStep(0);

 const steps = [1, 2, 3];
 steps.forEach((step, i) => {
 setTimeout(() => setRevealStep(step), (i + 1) * 800);
 });

 setTimeout(() => {
 setRounds((prev) =>
 prev.map((r) =>
 r.id === roundId
 ? { ...r, actualHours: hours, status:"completed"}
 : r
 )
 );
 setActualInput((prev) => {
 const copy = { ...prev };
 delete copy[roundId];
 return copy;
 });
 setTimeout(() => {
 setRevealingRound(null);
 setRevealStep(0);
 }, 2000);
 }, 3000);
 }

 function deleteRound(roundId: string) {
 setRounds((prev) => prev.filter((r) => r.id !== roundId));
 }

 // -----------------------------------------------------------------------
 // Computed
 // -----------------------------------------------------------------------

 const activeRounds = rounds.filter((r) => r.status !=="completed");
 const completedRounds = rounds.filter((r) => r.status ==="completed");

 // Leaderboard: estimation accuracy
 const estimatorStats = new Map<string, { total: number; accuracySum: number }>();
 for (const r of completedRounds) {
 if (r.actualHours === null) continue;
 for (const est of r.estimates) {
 const entry = estimatorStats.get(est.userId) ?? { total: 0, accuracySum: 0 };
 entry.total++;
 entry.accuracySum += calcAccuracy(est.hours, r.actualHours);
 estimatorStats.set(est.userId, entry);
 }
 }

 const leaderboard = Array.from(estimatorStats.entries())
 .map(([uid, stats]) => ({
 profile: profileMap.get(uid),
 userId: uid,
 totalRounds: stats.total,
 avgAccuracy: stats.total > 0 ? Math.round(stats.accuracySum / stats.total) : 0,
 }))
 .filter((u) => u.profile)
 .sort((a, b) => b.avgAccuracy - a.avgAccuracy || b.totalRounds - a.totalRounds);

 // -----------------------------------------------------------------------
 // Render helpers
 // -----------------------------------------------------------------------

 function getProfile(uid: string): Profile | undefined {
 return profileMap.get(uid);
 }

 function getCatConfig(cat: WorkCategory) {
 return CATEGORIES[cat] ?? CATEGORIES.deep_work;
 }

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 // -----------------------------------------------------------------------
 // Main render
 // -----------------------------------------------------------------------

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="font-mono font-bold uppercase tracking-tight text-2xl flex items-center gap-2">
 <DollarSign className="w-6 h-6 text-primary"/>
 El Precio es Correcto
 </h1>
 <p className="text-muted-foreground text-sm mt-1 font-mono">
 Estimen cuanto tarda una tarea. Si terminas antes que el promedio, ganas XP. Si tardas mas, pierdes.
 </p>
 </div>

 {/* New round button */}
 {!showForm && (
 <Button
 onClick={() => setShowForm(true)}
 className="mb-6 bg-primary font-mono text-xs">
 <Plus className="w-4 h-4 mr-1.5"/>
 Nueva Ronda
 </Button>
 )}

 {/* New round form */}
 {showForm && (
 <Card className="mb-8 border border-amber-500/30 bg-amber-500/5">
 <CardContent className="p-5">
 <div className="flex items-center justify-between mb-4">
 <h2 className="font-mono font-bold uppercase tracking-tight text-sm flex items-center gap-2">
 <Target className="w-4 h-4 text-primary"/>
 Nueva Ronda
 </h2>
 <button
 onClick={() => setShowForm(false)}
 className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
 <X className="w-4 h-4"/>
 </button>
 </div>

 <div className="space-y-4">
 {/* Task description */}
 <div>
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2 block">
 Tarea
 </label>
 <Input
 value={newTask}
 onChange={(e) => setNewTask(e.target.value)}
 placeholder="Describe la tarea a estimar..."className="font-mono text-sm"/>
 </div>

 {/* Category selection */}
 <div>
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2 block">
 Categoria
 </label>
 <div className="flex flex-wrap gap-1.5">
 {CATEGORY_OPTIONS.map((cat) => {
 const catConfig = getCatConfig(cat.value);
 return (
 <button
 key={cat.value}
 onClick={() => setNewCategory(cat.value)}
 className={cn(
"flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono transition-colors duration-200 border",
 newCategory === cat.value
 ?`${catConfig.bgColor} ${catConfig.color} border-current/20`:"bg-accent/20 text-muted-foreground border-border/30 hover:border-primary/30")}
 >
 <span>{cat.emoji}</span>
 <span>{cat.label}</span>
 </button>
 );
 })}
 </div>
 </div>

 {/* Assignee selection */}
 <div>
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2 block">
 Responsable
 </label>
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
 {teamMembers.map((m) => (
 <button
 key={m.user_id}
 onClick={() => setNewAssignee(m.user_id)}
 className={cn(
"flex items-center gap-2 p-2.5 transition-colors duration-200 text-left border",
 newAssignee === m.user_id
 ?"bg-primary/10 border-primary/30":"bg-accent/20 border-border/30 hover:border-primary/30")}
 >
 <Avatar className="w-7 h-7 ring-1 ring-border">
 <AvatarImage src={m.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[9px] font-mono">
 {getInitials(m.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-mono font-medium truncate">
 {m.profile.full_name ?? m.profile.email}
 </span>
 {newAssignee === m.user_id && (
 <Check className="w-3 h-3 text-primary ml-auto shrink-0"/>
 )}
 </button>
 ))}
 </div>
 </div>

 <Button
 onClick={createRound}
 disabled={!newTask.trim() || !newAssignee}
 className="w-full bg-primary font-mono text-xs">
 Crear Ronda
 </Button>
 </div>
 </CardContent>
 </Card>
 )}

 {/* Tabs */}
 <Tabs defaultValue="active"value={activeTab} onValueChange={(v) => setActiveTab(v as string)}>
 <TabsList className="mb-6">
 <TabsTrigger value="active"className="gap-1.5 text-xs sm:text-sm font-mono">
 <Timer className="w-3.5 h-3.5"/>
 Rondas Activas
 {activeRounds.length > 0 && (
 <Badge className="ml-1 text-[9px] px-1.5 py-0 bg-amber-500/20 text-amber-600 border-amber-500/30">
 {activeRounds.length}
 </Badge>
 )}
 </TabsTrigger>
 <TabsTrigger value="history"className="gap-1.5 text-xs sm:text-sm font-mono">
 <BarChart3 className="w-3.5 h-3.5"/>
 Historial
 </TabsTrigger>
 <TabsTrigger value="leaderboard"className="gap-1.5 text-xs sm:text-sm font-mono">
 <Trophy className="w-3.5 h-3.5"/>
 Mejores Estimadores
 </TabsTrigger>
 </TabsList>

 {/* Active rounds */}
 <TabsContent value="active">
 {activeRounds.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 text-center">
 <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
 <DollarSign className="w-8 h-8 text-muted-foreground"/>
 </div>
 <p className="text-sm font-mono text-muted-foreground">
 No hay rondas activas
 </p>
 <p className="text-xs text-muted-foreground/60 font-mono mt-1">
 Crea una ronda para que el equipo estime
 </p>
 </div>
 ) : (
 <div className="space-y-4">
 {activeRounds.map((round) => (
 <ActiveRoundCard
 key={round.id}
 round={round}
 userId={userId}
 getProfile={getProfile}
 getCatConfig={getCatConfig}
 teamMembers={teamMembers}
 onEstimate={submitEstimate}
 onStartWork={startWork}
 onComplete={completeRound}
 onDelete={deleteRound}
 actualInput={actualInput}
 setActualInput={setActualInput}
 isRevealing={revealingRound === round.id}
 revealStep={revealStep}
 />
 ))}
 </div>
 )}
 </TabsContent>

 {/* History */}
 <TabsContent value="history">
 {completedRounds.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 text-center">
 <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
 <BarChart3 className="w-8 h-8 text-muted-foreground"/>
 </div>
 <p className="text-sm font-mono text-muted-foreground">
 Sin historial todavía
 </p>
 <p className="text-xs text-muted-foreground/60 font-mono mt-1">
 Las rondas completadas aparecen aqui
 </p>
 </div>
 ) : (
 <div className="space-y-4">
 {completedRounds.map((round) => (
 <CompletedRoundCard
 key={round.id}
 round={round}
 getProfile={getProfile}
 getCatConfig={getCatConfig}
 onDelete={deleteRound}
 />
 ))}
 </div>
 )}
 </TabsContent>

 {/* Leaderboard */}
 <TabsContent value="leaderboard">
 {leaderboard.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 text-center">
 <div className="w-16 h-16 border border-border flex items-center justify-center mb-4">
 <Trophy className="w-8 h-8 text-muted-foreground"/>
 </div>
 <p className="text-sm font-mono text-muted-foreground">
 Sin datos todavía
 </p>
 <p className="text-xs text-muted-foreground/60 font-mono mt-1">
 Completa rondas para ver quien estima mejor
 </p>
 </div>
 ) : (
 <div className="space-y-2">
 {leaderboard.map((entry, idx) => {
 const medal = idx === 0 ?"text-amber-500": idx === 1 ?"text-gray-400": idx === 2 ?"text-amber-700":"";
 return (
 <Card
 key={entry.userId}
 className={cn(
"border border-border transition-colors duration-200 hover:border-primary/30",
 idx === 0 &&"border-amber-500/30 bg-amber-500/5")}
 >
 <CardContent className="p-4 flex items-center gap-4">
 <div className={cn("font-mono font-bold text-xl tabular-nums w-8 text-center", medal ||"text-muted-foreground")}>
 {idx + 1}
 </div>
 <Avatar className="w-9 h-9 ring-1 ring-border">
 <AvatarImage src={entry.profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[10px] font-mono">
 {getInitials(entry.profile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-mono font-medium truncate">
 {entry.profile?.full_name ??"Usuario"}
 </p>
 <p className="text-xs text-muted-foreground font-mono">
 {entry.totalRounds} ronda{entry.totalRounds !== 1 ?"s":""}
 </p>
 </div>
 <div className="text-right">
 <div className={cn(
"font-mono tabular-nums text-2xl font-bold tracking-tight",
 entry.avgAccuracy >= 80 ?"text-emerald-500": entry.avgAccuracy >= 50 ?"text-amber-500":"text-red-500")}>
 {entry.avgAccuracy}%
 </div>
 <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
 precision
 </p>
 </div>
 {idx === 0 && (
 <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 font-mono text-[9px]">
 MEJOR
 </Badge>
 )}
 </CardContent>
 </Card>
 );
 })}
 </div>
 )}
 </TabsContent>
 </Tabs>
 </div>
 );
}

// ---------------------------------------------------------------------------
// Active Round Card
// ---------------------------------------------------------------------------

interface ActiveRoundCardProps {
 round: PriceRound;
 userId: string | null;
 getProfile: (uid: string) => Profile | undefined;
 getCatConfig: (cat: WorkCategory) => { label: string; color: string; bgColor: string; emoji: string };
 teamMembers: TeamMember[];
 onEstimate: (roundId: string, hours: number) => void;
 onStartWork: (roundId: string) => void;
 onComplete: (roundId: string) => void;
 onDelete: (roundId: string) => void;
 actualInput: Record<string, string>;
 setActualInput: React.Dispatch<React.SetStateAction<Record<string, string>>>;
 isRevealing: boolean;
 revealStep: number;
}

function ActiveRoundCard({
 round,
 userId,
 getProfile,
 getCatConfig,
 teamMembers,
 onEstimate,
 onStartWork,
 onComplete,
 onDelete,
 actualInput,
 setActualInput,
 isRevealing,
 revealStep,
}: ActiveRoundCardProps) {
 const assigneeProfile = getProfile(round.assigneeId);
 const catConfig = getCatConfig(round.category);
 const myEstimate = round.estimates.find((e) => e.userId === userId);
 const isAssignee = userId === round.assigneeId;
 const estimateCount = round.estimates.length;
 const avgEstimate = calcAvgEstimate(round.estimates);

 return (
 <Card className={cn(
"border border-border transition-colors duration-200 hover:border-primary/30 overflow-hidden",
 isRevealing &&"border-amber-500/50 animate-jackpot-glow")}>
 <CardContent className="p-5">
 {/* Round header */}
 <div className="flex items-start justify-between gap-3 mb-4">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1.5">
 <Badge className={cn(catConfig.bgColor, catConfig.color,"border-0 font-mono text-[9px]")}>
 {catConfig.emoji} {catConfig.label}
 </Badge>
 <Badge
 className={cn(
"font-mono text-[9px] border",
 round.status ==="voting"?"bg-amber-500/10 text-amber-600 border-amber-500/30":"bg-blue-500/10 text-blue-600 border-blue-500/30")}
 >
 {round.status ==="voting"?"VOTANDO":"EN PROGRESO"}
 </Badge>
 </div>
 <h3 className="font-mono font-bold text-sm tracking-tight">
 {round.task}
 </h3>
 </div>
 <button
 onClick={() => onDelete(round.id)}
 className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0">
 <X className="w-3.5 h-3.5"/>
 </button>
 </div>

 {/* Assignee */}
 <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-accent/30 border border-border">
 <Avatar className="w-6 h-6 ring-1 ring-border">
 <AvatarImage src={assigneeProfile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px] font-mono">
 {getInitials(assigneeProfile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-mono text-muted-foreground">
 Responsable:
 </span>
 <span className="text-xs font-mono font-medium">
 {assigneeProfile?.full_name ??"Usuario"}
 </span>
 </div>

 {/* Voting interface */}
 {round.status ==="voting"&& (
 <>
 {/* Estimate buttons */}
 {!isAssignee && (
 <div className="mb-4">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Tu estimacion (horas)
 </p>
 <div className="flex flex-wrap gap-1.5">
 {HOUR_OPTIONS.map((h) => (
 <button
 key={h}
 onClick={() => onEstimate(round.id, h)}
 className={cn(
"w-11 h-11 flex items-center justify-center font-mono font-bold text-lg tabular-nums border transition-all duration-200",
 myEstimate?.hours === h
 ?"bg-amber-500/20 text-amber-600 border-amber-500/50 scale-110":"bg-accent/20 text-muted-foreground border-border hover:border-amber-500/30 hover:text-amber-600")}
 >
 {h}
 </button>
 ))}
 </div>
 {myEstimate && (
 <p className="text-xs font-mono text-amber-600 mt-2 flex items-center gap-1">
 <Check className="w-3 h-3"/>
 Estimaste {myEstimate.hours}h
 </p>
 )}
 </div>
 )}

 {isAssignee && (
 <div className="mb-4 px-3 py-3 bg-primary/5 border border-primary/20">
 <p className="text-xs font-mono text-primary">
 Eres el responsable. No puedes votar en tu propia tarea. Espera las estimaciones del equipo.
 </p>
 </div>
 )}

 {/* Who has voted */}
 <div className="flex items-center justify-between mb-3">
 <div className="flex items-center gap-1.5">
 <Users className="w-3.5 h-3.5 text-muted-foreground"/>
 <span className="text-xs font-mono text-muted-foreground">
 {estimateCount} estimacion{estimateCount !== 1 ?"es":""}
 </span>
 </div>
 <div className="flex -space-x-1.5">
 {round.estimates.map((est) => {
 const p = getProfile(est.userId);
 return (
 <Avatar key={est.userId} className="w-5 h-5 ring-1 ring-background">
 <AvatarImage src={p?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[7px] font-mono">
 {getInitials(p?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 );
 })}
 </div>
 </div>

 {/* Start work button */}
 {estimateCount > 0 && (
 <Button
 onClick={() => onStartWork(round.id)}
 className="w-full bg-primary font-mono text-xs">
 <ChevronRight className="w-4 h-4 mr-1"/>
 Cerrar votacion e iniciar tarea
 </Button>
 )}
 </>
 )}

 {/* In progress: enter actual hours */}
 {round.status ==="in_progress"&& !isRevealing && (
 <div>
 {/* Hidden estimates summary */}
 <div className="mb-4 px-3 py-3 bg-amber-500/5 border border-amber-500/20">
 <div className="flex items-center gap-2 mb-1">
 <Clock className="w-3.5 h-3.5 text-amber-600"/>
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-amber-600">
 Estimaciones bloqueadas
 </span>
 </div>
 <p className="text-xs font-mono text-muted-foreground">
 {estimateCount} persona{estimateCount !== 1 ?"s":""} estimaron. Los resultados se revelan al completar.
 </p>
 </div>

 {isAssignee ? (
 <div className="space-y-3">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Horas reales
 </p>
 <div className="flex gap-2">
 <Input
 type="number"min="0.5"max="24"step="0.5"value={actualInput[round.id] ??""}
 onChange={(e) =>
 setActualInput((prev) => ({ ...prev, [round.id]: e.target.value }))
 }
 placeholder="Ej: 3.5"className="font-mono text-lg tabular-nums max-w-[120px]"/>
 <Button
 onClick={() => onComplete(round.id)}
 disabled={!actualInput[round.id] || parseFloat(actualInput[round.id]) <= 0}
 className="flex-1 bg-primary font-mono text-xs">
 <Sparkles className="w-4 h-4 mr-1"/>
 Revelar Resultado
 </Button>
 </div>
 </div>
 ) : (
 <div className="px-3 py-3 bg-accent/30 border border-border">
 <p className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
 <Timer className="w-3.5 h-3.5"/>
 Esperando a que {assigneeProfile?.full_name ??"el responsable"} complete la tarea...
 </p>
 </div>
 )}
 </div>
 )}

 {/* Reveal animation */}
 {isRevealing && (
 <div className="py-6 text-center space-y-4">
 {revealStep >= 1 && (
 <div className="animate-slide-up-bounce">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
 Promedio estimado
 </p>
 <div className="font-mono tabular-nums text-4xl font-bold text-amber-500 tracking-tight">
 {avgEstimate.toFixed(1)}h
 </div>
 </div>
 )}

 {revealStep >= 2 && (
 <div className="animate-slide-up-bounce">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
 Tiempo real
 </p>
 <div className="font-mono tabular-nums text-4xl font-bold text-primary tracking-tight">
 {actualInput[round.id]}h
 </div>
 </div>
 )}

 {revealStep >= 3 && (
 <div className="animate-slide-up-bounce">
 {parseFloat(actualInput[round.id] ??"0") < avgEstimate ? (
 <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 font-mono text-sm px-4 py-1.5 animate-jackpot-glow">
 <TrendingDown className="w-4 h-4 mr-1.5"/>
 +XP BONUS
 </Badge>
 ) : parseFloat(actualInput[round.id] ??"0") > avgEstimate ? (
 <Badge className="bg-red-500/20 text-red-600 border-red-500/30 font-mono text-sm px-4 py-1.5">
 <TrendingUp className="w-4 h-4 mr-1.5"/>
 XP PENALIDAD
 </Badge>
 ) : (
 <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 font-mono text-sm px-4 py-1.5">
 <Target className="w-4 h-4 mr-1.5"/>
 EXACTO
 </Badge>
 )}
 </div>
 )}
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// ---------------------------------------------------------------------------
// Completed Round Card
// ---------------------------------------------------------------------------

interface CompletedRoundCardProps {
 round: PriceRound;
 getProfile: (uid: string) => Profile | undefined;
 getCatConfig: (cat: WorkCategory) => { label: string; color: string; bgColor: string; emoji: string };
 onDelete: (roundId: string) => void;
}

function CompletedRoundCard({ round, getProfile, getCatConfig, onDelete }: CompletedRoundCardProps) {
 const assigneeProfile = getProfile(round.assigneeId);
 const catConfig = getCatConfig(round.category);
 const avgEstimate = calcAvgEstimate(round.estimates);
 const actual = round.actualHours ?? 0;
 const diff = actual - avgEstimate;
 const isWin = actual < avgEstimate;
 const isExact = actual === avgEstimate;

 return (
 <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
 <CardContent className="p-5">
 {/* Header */}
 <div className="flex items-start justify-between gap-3 mb-3">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <Badge className={cn(catConfig.bgColor, catConfig.color,"border-0 font-mono text-[9px]")}>
 {catConfig.emoji} {catConfig.label}
 </Badge>
 {isWin ? (
 <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-mono text-[9px]">
 +XP
 </Badge>
 ) : isExact ? (
 <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 font-mono text-[9px]">
 EXACTO
 </Badge>
 ) : (
 <Badge className="bg-red-500/10 text-red-600 border-red-500/30 font-mono text-[9px]">
 -XP
 </Badge>
 )}
 </div>
 <h3 className="font-mono font-bold text-sm tracking-tight">{round.task}</h3>
 </div>
 <button
 onClick={() => onDelete(round.id)}
 className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0">
 <X className="w-3.5 h-3.5"/>
 </button>
 </div>

 {/* Assignee */}
 <div className="flex items-center gap-2 mb-4">
 <Avatar className="w-5 h-5 ring-1 ring-border">
 <AvatarImage src={assigneeProfile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[7px] font-mono">
 {getInitials(assigneeProfile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-mono text-muted-foreground">
 {assigneeProfile?.full_name ??"Usuario"}
 </span>
 </div>

 {/* Big numbers: estimate vs actual */}
 <div className="grid grid-cols-3 gap-3 mb-4">
 <div className="bg-accent/30 border border-border p-3 text-center">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-0.5">
 Estimado
 </p>
 <p className="font-mono tabular-nums text-2xl font-bold tracking-tight text-amber-500">
 {avgEstimate.toFixed(1)}h
 </p>
 </div>
 <div className="bg-accent/30 border border-border p-3 text-center">
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-0.5">
 Real
 </p>
 <p className="font-mono tabular-nums text-2xl font-bold tracking-tight text-primary">
 {actual}h
 </p>
 </div>
 <div className={cn(
"border p-3 text-center",
 isWin ?"bg-emerald-500/5 border-emerald-500/20": isExact ?"bg-amber-500/5 border-amber-500/20":"bg-red-500/5 border-red-500/20")}>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-0.5">
 Diferencia
 </p>
 <p className={cn(
"font-mono tabular-nums text-2xl font-bold tracking-tight",
 isWin ?"text-emerald-500": isExact ?"text-amber-500":"text-red-500")}>
 {diff > 0 ?"+":""}{diff.toFixed(1)}h
 </p>
 </div>
 </div>

 {/* Individual estimates */}
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
 Estimaciones individuales
 </p>
 <div className="space-y-1.5">
 {round.estimates.map((est) => {
 const p = getProfile(est.userId);
 const accuracy = calcAccuracy(est.hours, actual);
 return (
 <div
 key={est.userId}
 className="flex items-center gap-2 px-2.5 py-1.5 bg-accent/20 border border-border">
 <Avatar className="w-5 h-5 ring-1 ring-border">
 <AvatarImage src={p?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[7px] font-mono">
 {getInitials(p?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>
 <span className="text-xs font-mono truncate flex-1">
 {p?.full_name ??"Usuario"}
 </span>
 <span className="font-mono tabular-nums text-sm font-bold">
 {est.hours}h
 </span>
 <Badge
 className={cn(
"font-mono text-[9px] tabular-nums border",
 accuracy >= 80
 ?"bg-emerald-500/10 text-emerald-600 border-emerald-500/30": accuracy >= 50
 ?"bg-amber-500/10 text-amber-600 border-amber-500/30":"bg-red-500/10 text-red-600 border-red-500/30")}
 >
 {accuracy}%
 </Badge>
 {accuracy >= 90 && (
 <Star className="w-3.5 h-3.5 text-amber-500"/>
 )}
 </div>
 );
 })}
 </div>
 </div>
 </CardContent>
 </Card>
 );
}
