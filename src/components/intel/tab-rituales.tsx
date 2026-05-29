"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Standup, DailyPromise, WeeklyContract } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { MOOD_LABELS } from "@/lib/constants";
import { format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Target, CheckCircle2, XCircle, Clock, Loader2, Plus, FileSignature, MessageSquare } from "lucide-react";
import { TabLoading, gradeStyle } from "./shared";

function getWeekStart(date: Date = new Date()): string {
 return format(startOfWeek(date, { weekStartsOn: 1 }),"yyyy-MM-dd");
}

interface StandupWithProfile extends Standup { profiles?: Profile }
interface PromiseWithProfile extends DailyPromise { profiles?: { full_name: string | null; avatar_url: string | null } }
interface ContractWithProfile extends WeeklyContract { profiles?: Profile }

export function TabRituales({ orgId, userId }: { orgId: string; userId: string }) {
 const supabase = createClient();
 const today = getTodayMTY();
 const weekStart = getWeekStart();

 const [standups, setStandups] = useState<StandupWithProfile[]>([]);
 const [myStandup, setMyStandup] = useState<StandupWithProfile | null>(null);
 const [yesterday, setYesterday] = useState("");
 const [todayPlan, setTodayPlan] = useState("");
 const [blockers, setBlockers] = useState("");
 const [mood, setMood] = useState<number | null>(null);
 const [standupSubmitting, setStandupSubmitting] = useState(false);

 const [promises, setPromises] = useState<PromiseWithProfile[]>([]);
 const [myPromises, setMyPromises] = useState<PromiseWithProfile[]>([]);
 const [newPromise, setNewPromise] = useState("");
 const [promiseSubmitting, setPromiseSubmitting] = useState(false);

 const [myContract, setMyContract] = useState<ContractWithProfile | null>(null);
 const [newCommitments, setNewCommitments] = useState<string[]>([""]);
 const [contractSubmitting, setContractSubmitting] = useState(false);

 const [loading, setLoading] = useState(true);

 const loadData = useCallback(async () => {
 const [{ data: standupData }, { data: promiseData }, { data: contractData }] = await Promise.all([
 supabase.from("standups").select("*, profiles(*)").eq("org_id", orgId).eq("date", today).order("submitted_at", { ascending: true }),
 supabase.from("daily_promises").select("*, profiles(full_name, avatar_url)").eq("org_id", orgId).eq("date", today).order("created_at"),
 supabase.from("weekly_contracts").select("*, profiles(*)").eq("org_id", orgId).eq("week_start", weekStart).eq("user_id", userId).maybeSingle(),
 ]);

 setStandups((standupData ?? []) as StandupWithProfile[]);
 const mine = (standupData ?? []).find((s) => s.user_id === userId);
 if (mine) setMyStandup(mine as StandupWithProfile);

 const allPromises = (promiseData ?? []) as PromiseWithProfile[];
 setPromises(allPromises);
 setMyPromises(allPromises.filter((p) => p.user_id === userId));
 setMyContract((contractData as ContractWithProfile) ?? null);
 setLoading(false);
 }, [orgId, userId, today, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => { loadData(); }, [loadData]);

 async function submitStandup(e: React.FormEvent) {
 e.preventDefault();
 if (!yesterday.trim() || !todayPlan.trim()) return;
 setStandupSubmitting(true);
 const { data } = await supabase.from("standups").upsert({
 user_id: userId, org_id: orgId, date: today, yesterday, today_plan: todayPlan,
 blockers: blockers || null, mood: mood as 1 | 2 | 3 | 4 | 5 | null,
 }, { onConflict:"user_id,org_id,date"}).select("*, profiles(*)").single();
 if (data) { setMyStandup(data as unknown as StandupWithProfile); loadData(); }
 setStandupSubmitting(false);
 }

 async function addPromise(e: React.FormEvent) {
 e.preventDefault();
 if (!newPromise.trim()) return;
 setPromiseSubmitting(true);
 await supabase.from("daily_promises").insert({ user_id: userId, org_id: orgId, date: today, title: newPromise.trim(), status:"pending"});
 setNewPromise(""); setPromiseSubmitting(false); loadData();
 }

 async function togglePromise(id: string, current: string) {
 const next = current ==="pending"?"delivered": current ==="delivered"?"broken":"pending";
 await supabase.from("daily_promises").update({ status: next }).eq("id", id);
 loadData();
 }

 async function submitContract(e: React.FormEvent) {
 e.preventDefault();
 const filtered = newCommitments.filter((c) => c.trim());
 if (filtered.length === 0) return;
 setContractSubmitting(true);
 await supabase.from("weekly_contracts").upsert({
 user_id: userId, org_id: orgId, week_start: weekStart,
 commitments: filtered.map((text) => ({ text, delivered: false })), status:"active",
 }, { onConflict:"user_id,org_id,week_start"});
 setContractSubmitting(false); loadData();
 }

 async function toggleCommitment(idx: number) {
 if (!myContract) return;
 const updated = [...myContract.commitments];
 updated[idx] = { ...updated[idx], delivered: !updated[idx].delivered };
 await supabase.from("weekly_contracts").update({ commitments: updated }).eq("id", myContract.id);
 loadData();
 }

 if (loading) return <TabLoading />;

 return (
 <div className="space-y-8">
 {/* STANDUP */}
 <section>
 <div className="palantir-divider text-muted-foreground mb-4">
 <MessageSquare className="w-3 h-3"/>
 Standup — {format(new Date(today +"T12:00:00"),"d MMM", { locale: es })}
 </div>

 {!myStandup ? (
 <form onSubmit={submitStandup} className="card-palantir p-4 space-y-3 mb-4">
 <div>
 <label className="label-mono text-muted-foreground/60 mb-1 block">Ayer</label>
 <Textarea value={yesterday} onChange={(e) => setYesterday(e.target.value)} placeholder="Qué lograste ayer..."className="font-mono text-xs min-h-[60px]"required />
 </div>
 <div>
 <label className="label-mono text-muted-foreground/60 mb-1 block">Hoy</label>
 <Textarea value={todayPlan} onChange={(e) => setTodayPlan(e.target.value)} placeholder="Qué harás hoy..."className="font-mono text-xs min-h-[60px]"required />
 </div>
 <div>
 <label className="label-mono text-muted-foreground/60 mb-1 block">Blockers</label>
 <Input value={blockers} onChange={(e) => setBlockers(e.target.value)} placeholder="Opcional"className="font-mono text-xs"/>
 </div>
 <div>
 <label className="label-mono text-muted-foreground/60 mb-1 block">Mood</label>
 <div className="flex gap-1">
 {[1, 2, 3, 4, 5].map((v) => (
 <button key={v} type="button"onClick={() => setMood(v)} className={cn(
"w-8 h-8 font-mono text-xs border transition-colors",
 mood === v ?"bg-primary text-primary-foreground border-primary":"border-border hover:border-primary/30")}>{v}</button>
 ))}
 </div>
 </div>
 <Button type="submit"disabled={standupSubmitting} className="font-mono text-xs bg-primary text-primary-foreground">
 {standupSubmitting ? <Loader2 className="w-3 h-3 animate-spin mr-1"/> : null}
 Enviar Standup
 </Button>
 </form>
 ) : (
 <div className="card-palantir p-4 mb-4 corner-marks">
 <div className="flex items-center gap-2 mb-2">
 <CheckCircle2 className="w-3.5 h-3.5 text-green-500"/>
 <span className="font-mono text-[10px] uppercase tracking-wide text-green-600 dark:text-green-400">Standup enviado</span>
 {myStandup.mood && <span className="font-mono text-[9px] text-muted-foreground/60 ml-auto">Mood: {MOOD_LABELS[myStandup.mood]}</span>}
 </div>
 <div className="space-y-2 text-xs font-mono">
 <div><span className="text-muted-foreground">Ayer:</span> <span className="text-foreground">{myStandup.yesterday}</span></div>
 <div><span className="text-muted-foreground">Hoy:</span> <span className="text-foreground">{myStandup.today_plan}</span></div>
 {myStandup.blockers && <div><span className="text-muted-foreground">Blockers:</span> <span className="text-red-600 dark:text-red-400">{myStandup.blockers}</span></div>}
 </div>
 </div>
 )}

 {standups.filter((s) => s.user_id !== userId).length > 0 && (
 <div className="space-y-2">
 <span className="label-mono text-muted-foreground">Equipo</span>
 {standups.filter((s) => s.user_id !== userId).map((s) => (
 <div key={s.id} className="card-palantir p-3">
 <div className="flex items-center gap-2 mb-1.5">
 <Avatar className="w-5 h-5 ring-1 ring-border">
 <AvatarImage src={(s.profiles as Profile | undefined)?.avatar_url ?? undefined} />
 <AvatarFallback className="text-[7px] font-mono">{getInitials((s.profiles as Profile | undefined)?.full_name ?? null)}</AvatarFallback>
 </Avatar>
 <span className="font-mono text-[10px] font-semibold">{(s.profiles as Profile | undefined)?.full_name ??"?"}</span>
 {s.mood && <span className="text-[9px] font-mono text-muted-foreground ml-auto">{MOOD_LABELS[s.mood]}</span>}
 </div>
 <div className="text-[10px] font-mono space-y-1 text-muted-foreground">
 <p><span className="text-muted-foreground">Hoy:</span> {s.today_plan}</p>
 {s.blockers && <p className="text-red-500">{s.blockers}</p>}
 </div>
 </div>
 ))}
 </div>
 )}
 </section>

 {/* PROMESAS */}
 <section>
 <div className="palantir-divider text-muted-foreground mb-4">
 <Target className="w-3 h-3"/>
 Promesas — Hoy
 </div>

 <form onSubmit={addPromise} className="flex gap-2 mb-4">
 <Input value={newPromise} onChange={(e) => setNewPromise(e.target.value)} placeholder="Nueva promesa..."className="font-mono text-xs flex-1"/>
 <Button type="submit"disabled={promiseSubmitting} className="font-mono text-xs bg-primary text-primary-foreground"><Plus className="w-3 h-3"/></Button>
 </form>

 {myPromises.length > 0 && (
 <div className="space-y-1.5 mb-4">
 <span className="label-mono text-muted-foreground">Mis promesas</span>
 {myPromises.map((p) => (
 <div key={p.id} className="card-palantir p-3 flex items-center gap-3">
 <button onClick={() => togglePromise(p.id, p.status)} className="shrink-0">
 {p.status ==="delivered"? <CheckCircle2 className="w-4 h-4 text-green-500"/> : p.status ==="broken"? <XCircle className="w-4 h-4 text-red-500"/> : <Clock className="w-4 h-4 text-muted-foreground"/>}
 </button>
 <span className={cn("font-mono text-xs flex-1",
 p.status ==="delivered"&&"line-through text-muted-foreground/60",
 p.status ==="broken"&&"text-red-500 line-through")}>{p.title}</span>
 <Badge variant="outline"className={cn("text-[8px] font-mono h-4",
 p.status ==="delivered"&&"border-green-400 text-green-600",
 p.status ==="broken"&&"border-red-400 text-red-600",
 p.status ==="pending"&&"border-border text-muted-foreground")}>{p.status ==="delivered"?"Cumplida": p.status ==="broken"?"Rota":"Pendiente"}</Badge>
 </div>
 ))}
 </div>
 )}

 {promises.filter((p) => p.user_id !== userId).length > 0 && (
 <div className="space-y-1.5">
 <span className="label-mono text-muted-foreground">Equipo</span>
 {promises.filter((p) => p.user_id !== userId).map((p) => (
 <div key={p.id} className="card-palantir p-2.5 flex items-center gap-2 text-[10px] font-mono">
 {p.status ==="delivered"? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0"/> : p.status ==="broken"? <XCircle className="w-3 h-3 text-red-500 shrink-0"/> : <Clock className="w-3 h-3 text-muted-foreground shrink-0"/>}
 <span className="text-muted-foreground/60">{p.profiles?.full_name ??"?"}</span>
 <span className={cn("flex-1 truncate", p.status ==="broken"&&"text-red-500")}>{p.title}</span>
 </div>
 ))}
 </div>
 )}
 </section>

 {/* PACTO SEMANAL */}
 <section>
 <div className="palantir-divider text-muted-foreground mb-4">
 <FileSignature className="w-3 h-3"/>
 Pacto Semanal — Semana del {format(new Date(weekStart +"T12:00:00"),"d MMM", { locale: es })}
 </div>

 {myContract ? (
 <div className="card-palantir p-4 corner-marks">
 <div className="flex items-center gap-2 mb-3">
 <span className="label-mono text-muted-foreground">Compromisos</span>
 {myContract.overall_grade && <span className={cn("font-mono text-sm font-bold ml-auto", gradeStyle(myContract.overall_grade).color)}>{myContract.overall_grade}</span>}
 <Badge variant="outline"className="text-[8px] font-mono h-4 ml-1">{myContract.status ==="graded"?"Calificado":"Activo"}</Badge>
 </div>
 <div className="space-y-2">
 {myContract.commitments.map((c, i) => (
 <div key={i} className="flex items-center gap-2">
 <button onClick={() => toggleCommitment(i)} className="shrink-0">
 {c.delivered ? <CheckCircle2 className="w-4 h-4 text-green-500"/> : <Clock className="w-4 h-4 text-muted-foreground"/>}
 </button>
 <span className={cn("font-mono text-xs", c.delivered &&"line-through text-muted-foreground/60")}>{c.text}</span>
 {c.grade && <span className={cn("font-mono text-[10px] font-bold ml-auto", gradeStyle(c.grade).color)}>{c.grade}</span>}
 </div>
 ))}
 </div>
 {myContract.ai_assessment && (
 <div className="mt-3 pt-3 border-t border-border text-[10px] font-mono text-muted-foreground">
 <span className="label-mono text-primary/40 mb-1 block">AI Assessment</span>
 {myContract.ai_assessment}
 </div>
 )}
 </div>
 ) : (
 <form onSubmit={submitContract} className="card-palantir p-4 space-y-3">
 <span className="label-mono text-muted-foreground/60">Crear pacto semanal</span>
 {newCommitments.map((c, i) => (
 <div key={i} className="flex gap-2">
 <Input value={c} onChange={(e) => { const upd = [...newCommitments]; upd[i] = e.target.value; setNewCommitments(upd); }} placeholder={`Compromiso ${i + 1}...`} className="font-mono text-xs"/>
 </div>
 ))}
 <div className="flex gap-2">
 <Button type="button"variant="outline"size="sm"onClick={() => setNewCommitments([...newCommitments,""])} className="font-mono text-[10px]">
 <Plus className="w-3 h-3 mr-1"/>Agregar
 </Button>
 <Button type="submit"disabled={contractSubmitting} className="font-mono text-xs bg-primary text-primary-foreground">
 {contractSubmitting ? <Loader2 className="w-3 h-3 animate-spin mr-1"/> : null}
 Crear Pacto
 </Button>
 </div>
 </form>
 )}
 </section>
 </div>
 );
}
