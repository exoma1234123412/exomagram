"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TrustScoreHistory, AiDailyInsight, AccountabilityFlag, AiReview, TimeEntry } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, getTodayMTY } from "@/lib/utils";
import { FLAG_TYPES, CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import { Brain, Shield, AlertTriangle, Users, Ghost, ChevronRight, Loader2, Crosshair, Eye } from "lucide-react";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";

type TabId = "resumen" | "analisis" | "riesgo" | "auditoria";

interface Member extends Profile {
  latestTrust?: number;
  activeFlags: number;
  latestInsight?: Record<string, unknown>;
  isGhost: boolean;
}

interface RiskPrediction { name: string; resignation_risk: number; risk_level: string; signals: string[]; prediction: string; recommended_action: string }
interface RiskData { predictions: RiskPrediction[]; team_summary: string; highest_risk: string; immediate_actions: string[]; model: string }

const TABS: { id: TabId; label: string }[] = [
  { id: "resumen", label: "Resumen" }, { id: "analisis", label: "Analisis" },
  { id: "riesgo", label: "Riesgo" }, { id: "auditoria", label: "Auditoria" },
];

const trustColor = (s: number) => s >= 80 ? "text-green-600" : s >= 60 ? "text-yellow-600" : "text-red-600";
const gradeColor = (g: string) => g === "A" || g === "B" ? "text-green-600 border-green-300 dark:border-green-800" : g === "C" ? "text-yellow-600 border-yellow-300 dark:border-yellow-800" : "text-red-600 border-red-300 dark:border-red-800";

export default function CommandCenterPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const supabase = createClient();
  const [tab, setTab] = useState<TabId>("resumen");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [flags, setFlags] = useState<AccountabilityFlag[]>([]);
  const [insights, setInsights] = useState<AiDailyInsight[]>([]);
  const [reviews, setReviews] = useState<AiReview[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userEntries, setUserEntries] = useState<TimeEntry[]>([]);
  const [userTrust14, setUserTrust14] = useState<TrustScoreHistory[]>([]);
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const d7 = format(subDays(new Date(), 7), "yyyy-MM-dd");
    const d1 = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const [{ data: om }, { data: td }, { data: fd }, { data: id }, { data: rd }] = await Promise.all([
      supabase.from("org_members").select("user_id, profiles(id, full_name, avatar_url, email)").eq("org_id", orgId),
      supabase.from("trust_score_history").select("*").eq("org_id", orgId).gte("date", d7).order("date", { ascending: false }),
      supabase.from("accountability_flags").select("*").eq("org_id", orgId).eq("resolved", false).order("created_at", { ascending: false }).limit(50),
      supabase.from("ai_daily_insights").select("*").eq("org_id", orgId).gte("date", d1).order("date", { ascending: false }),
      supabase.from("ai_reviews").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
    ]);
    setFlags(fd ?? []); setInsights(id ?? []); setReviews(rd ?? []);
    const d3 = format(subDays(new Date(), 3), "yyyy-MM-dd");
    const built: Member[] = (om ?? []).map((m) => {
      const p = m.profiles as unknown as Profile;
      const ut = (td ?? []).filter((t) => t.user_id === m.user_id);
      const ins = (id ?? []).find((i) => i.user_id === m.user_id);
      return { ...p, id: m.user_id, latestTrust: ut[0]?.score, activeFlags: (fd ?? []).filter((f) => f.user_id === m.user_id).length, latestInsight: ins?.insight ?? undefined, isGhost: ut.filter((t) => t.date >= d3).length === 0 };
    });
    setMembers(built);
    if (built.length > 0 && !selectedUser) setSelectedUser(built[0].id);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!orgLoading && orgId) loadData(); }, [orgLoading, orgId, loadData]);

  useEffect(() => {
    if (!orgId || !selectedUser) return;
    Promise.all([
      supabase.from("trust_score_history").select("*").eq("org_id", orgId).eq("user_id", selectedUser).gte("date", format(subDays(new Date(), 14), "yyyy-MM-dd")).order("date"),
      supabase.from("time_entries").select("*").eq("org_id", orgId).eq("user_id", selectedUser).gte("date", format(subDays(new Date(), 7), "yyyy-MM-dd")).order("date"),
    ]).then(([{ data: t }, { data: e }]) => { setUserTrust14(t ?? []); setUserEntries(e ?? []); });
  }, [orgId, selectedUser]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runRisk() {
    if (!orgId) return;
    setRiskLoading(true); setRiskError(null);
    try {
      const res = await fetch("/api/claude-resign-predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org_id: orgId }) });
      const json = await res.json();
      json.error ? setRiskError(json.error) : setRiskData(json as RiskData);
    } catch { setRiskError("Error conectando con Claude"); }
    setRiskLoading(false);
  }

  const withTrust = members.filter((m) => m.latestTrust !== undefined);
  const avgTrust = withTrust.length > 0 ? Math.round(withTrust.reduce((s, m) => s + (m.latestTrust ?? 0), 0) / withTrust.length) : 0;
  const ghostCount = members.filter((m) => m.isGhost).length;
  const sel = members.find((m) => m.id === selectedUser);
  const catH: Record<string, number> = {};
  const moodD: Record<string, number[]> = {};
  const energyD: Record<string, number[]> = {};
  for (const e of userEntries) {
    catH[e.category] = (catH[e.category] ?? 0) + 1;
    if (e.mood) { (moodD[e.date] ??= []).push(e.mood); }
    if (e.energy) { (energyD[e.date] ??= []).push(e.energy); }
  }

  if (loading || orgLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">Cargando...</div></div>;
  if (!orgId) return <div className="flex items-center justify-center h-screen"><div className="text-muted-foreground font-mono text-xs">Sin organizacion</div></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 bg-grid-palantir min-h-screen">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-mono font-bold tracking-tight uppercase">Centro de Mando</h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground">Hub unificado de inteligencia AI &mdash; {format(new Date(), "d MMM yyyy, HH:mm", { locale: es })}</p>
      </div>
      <div className="flex gap-0 border-b border-border mb-8">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("px-4 py-2 font-mono text-xs uppercase tracking-wide transition-colors cursor-pointer", tab === t.id ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>{t.label}</button>
        ))}
      </div>

      {tab === "resumen" && <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Stat label="Equipo" value={members.length} icon={Users} />
          <Stat label="Trust Score Prom." value={avgTrust} icon={Shield} accent={avgTrust >= 70} />
          <Stat label="Flags Activas" value={flags.length} icon={AlertTriangle} danger={flags.length > 0} />
          <Stat label="Fantasmas" value={ghostCount} icon={Ghost} danger={ghostCount > 0} />
        </div>
        <div className="palantir-divider text-muted-foreground/40 mb-4">Inteligencia por persona</div>
        <div className="space-y-2 mb-8">
          {members.map((m) => {
            const ins = insights.find((i) => i.user_id === m.id);
            const g = (ins?.insight as Record<string, unknown>)?.grade as string | undefined;
            const s = (ins?.insight as Record<string, unknown>)?.summary as string | undefined;
            return (
              <button key={m.id} onClick={() => { setSelectedUser(m.id); setTab("analisis"); }} className="w-full card-palantir p-3 flex items-center gap-3 group cursor-pointer text-left">
                <Avatar className="w-8 h-8 ring-1 ring-border"><AvatarImage src={m.avatar_url ?? undefined} /><AvatarFallback className="text-[10px] font-mono">{getInitials(m.full_name)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium truncate">{m.full_name ?? m.email}</span>
                    {m.isGhost && <span className="system-badge text-muted-foreground/60 border-muted-foreground/20">Ghost</span>}
                    {g && <span className={cn("system-badge", gradeColor(g))}>{g}</span>}
                    {m.activeFlags > 0 && <span className="system-badge text-red-600 border-red-300 dark:border-red-800">{m.activeFlags} flag{m.activeFlags > 1 ? "s" : ""}</span>}
                  </div>
                  {s && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{s}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {m.latestTrust !== undefined && <span className={cn("data-number text-lg", trustColor(m.latestTrust))}>{m.latestTrust}</span>}
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
        {flags.length > 0 && <>
          <div className="palantir-divider text-muted-foreground/40 mb-4">Alertas activas</div>
          <div className="space-y-1.5">
            {flags.slice(0, 8).map((f) => { const ft = FLAG_TYPES[f.flag_type]; const mb = members.find((m) => m.id === f.user_id); return (
              <div key={f.id} className="card-palantir p-2.5 flex items-center gap-3">
                <span className="text-sm">{ft?.emoji ?? "?"}</span>
                <span className="font-mono text-[11px] font-medium">{mb?.full_name ?? "?"}</span>
                <span className="text-muted-foreground/50">&mdash;</span>
                <span className="font-mono text-[11px] text-muted-foreground flex-1">{ft?.label ?? f.flag_type}</span>
                <span className="data-cell text-muted-foreground/40">{f.date}</span>
              </div>
            ); })}
            {flags.length > 8 && <p className="text-[10px] font-mono text-muted-foreground/40 text-center pt-1">+{flags.length - 8} mas</p>}
          </div>
        </>}
      </>}

      {tab === "analisis" && <>
        <div className="flex gap-2 flex-wrap mb-6">
          {members.map((m) => (
            <button key={m.id} onClick={() => setSelectedUser(m.id)} className={cn("flex items-center gap-2 px-3 py-1.5 border transition-colors cursor-pointer", selectedUser === m.id ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
              <Avatar className="w-5 h-5 ring-1 ring-border"><AvatarImage src={m.avatar_url ?? undefined} /><AvatarFallback className="text-[8px] font-mono">{getInitials(m.full_name)}</AvatarFallback></Avatar>
              <span className="font-mono text-[11px]">{m.full_name?.split(" ")[0] ?? "?"}</span>
            </button>
          ))}
        </div>
        {sel && <>
          <div className="card-palantir p-4 corner-marks mb-6">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10 ring-1 ring-border"><AvatarImage src={sel.avatar_url ?? undefined} /><AvatarFallback className="font-mono text-xs">{getInitials(sel.full_name)}</AvatarFallback></Avatar>
              <div><h3 className="font-mono text-sm font-bold uppercase">{sel.full_name ?? sel.email}</h3><p className="font-mono text-[10px] text-muted-foreground">{sel.email}</p></div>
              <div className="ml-auto flex items-center gap-4">
                {sel.latestTrust !== undefined && <div className="text-right"><p className="label-mono text-muted-foreground/40">Trust Score</p><p className={cn("data-number text-2xl", trustColor(sel.latestTrust))}>{sel.latestTrust}</p></div>}
                {sel.isGhost && <span className="system-badge text-red-600 border-red-300">GHOST</span>}
              </div>
            </div>
          </div>
          <div className="palantir-divider text-muted-foreground/40 mb-3">Trust Score (14 dias)</div>
          <div className="card-palantir p-4 mb-6">
            {userTrust14.length === 0 ? <p className="text-center text-muted-foreground/40 font-mono text-xs py-6">Sin datos</p> : (
              <div className="flex items-end gap-1 h-28">
                {userTrust14.map((t) => { const mx = Math.max(...userTrust14.map((x) => x.score), 1); return (
                  <div key={t.id} className="flex-1 flex flex-col items-center gap-1">
                    <span className="data-cell text-[8px] text-muted-foreground/50">{t.score}</span>
                    <div className={cn("w-full", t.score >= 80 ? "bg-green-500/70" : t.score >= 60 ? "bg-yellow-500/70" : "bg-red-500/70")} style={{ height: `${Math.max(4, (t.score / mx) * 100)}%` }} />
                    <span className="data-cell text-[7px] text-muted-foreground/30">{t.date.slice(5)}</span>
                  </div>
                ); })}
              </div>
            )}
          </div>
          <div className="palantir-divider text-muted-foreground/40 mb-3">Horas por categoria (7 dias)</div>
          <div className="card-palantir p-4 mb-6">
            {Object.keys(catH).length === 0 ? <p className="text-center text-muted-foreground/40 font-mono text-xs py-6">Sin entradas</p> : (
              <div className="space-y-2">
                {Object.entries(catH).sort(([, a], [, b]) => b - a).map(([cat, hrs]) => {
                  const tot = Object.values(catH).reduce((s, v) => s + v, 0);
                  const ci = CATEGORIES[cat as keyof typeof CATEGORIES];
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="w-16 text-right font-mono text-[10px] text-muted-foreground truncate">{ci?.label ?? cat}</span>
                      <div className="flex-1 h-3 bg-accent/30 border border-border overflow-hidden"><div className={cn("h-full", CATEGORY_COLORS[cat] ?? "bg-slate-400")} style={{ width: `${tot > 0 ? Math.round((hrs / tot) * 100) : 0}%` }} /></div>
                      <span className="data-cell text-muted-foreground w-12 text-right">{hrs}h</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <MiniTrend label="Mood (7 dias)" data={moodD} />
            <MiniTrend label="Energia (7 dias)" data={energyD} />
          </div>
          {flags.filter((f) => f.user_id === selectedUser).length > 0 && <>
            <div className="palantir-divider text-muted-foreground/40 mb-3">Flags activas</div>
            <div className="space-y-1.5 mb-6">
              {flags.filter((f) => f.user_id === selectedUser).map((f) => { const ft = FLAG_TYPES[f.flag_type]; return (
                <div key={f.id} className="card-palantir p-2.5 flex items-center gap-2">
                  <span className="text-sm">{ft?.emoji ?? "?"}</span>
                  <span className="font-mono text-[11px]">{ft?.label ?? f.flag_type}</span>
                  {f.details && <span className="text-[10px] text-muted-foreground truncate flex-1">{f.details}</span>}
                  <span className="data-cell text-muted-foreground/40 shrink-0">{f.date}</span>
                </div>
              ); })}
            </div>
          </>}
          {(() => { const ui = insights.find((i) => i.user_id === selectedUser); if (!ui) return null; const ins = ui.insight as Record<string, unknown>; const grade = ins.grade as string | undefined; const summary = ins.summary as string | undefined; const strengths = ins.strengths as string[] | undefined; const concerns = ins.concerns as string[] | undefined; const rec = ins.recommendation as string | undefined; return <>
            <div className="palantir-divider text-muted-foreground/40 mb-3">Ultimo insight AI</div>
            <div className="card-palantir p-4 corner-marks">
              {grade && <div className="flex items-center gap-2 mb-2"><span className="label-mono text-muted-foreground/40">Grade</span><span className={cn("data-number text-lg", grade <= "B" ? "text-green-600" : grade === "C" ? "text-yellow-600" : "text-red-600")}>{grade}</span></div>}
              {summary && <p className="font-mono text-[11px] leading-relaxed mb-2">{summary}</p>}
              {strengths?.map((s, i) => <p key={i} className="font-mono text-[10px] text-green-600 dark:text-green-400">+ {s}</p>)}
              {concerns?.map((c, i) => <p key={i} className="font-mono text-[10px] text-red-600 dark:text-red-400">- {c}</p>)}
              {rec && <div className="pt-2 mt-2 border-t border-border"><p className="label-mono text-primary/60 mb-1">Recomendacion</p><p className="font-mono text-[11px] text-muted-foreground">{rec}</p></div>}
            </div>
          </>; })()}
        </>}
      </>}

      {tab === "riesgo" && <>
        <div className="card-palantir p-4 flex items-center justify-between mb-6">
          <div><h3 className="font-mono text-xs font-bold uppercase">Prediccion de riesgo de renuncia</h3><p className="font-mono text-[10px] text-muted-foreground mt-0.5">Claude analiza 30 dias de datos y predice quien podria renunciar</p></div>
          <Button onClick={runRisk} disabled={riskLoading} className="font-mono text-xs bg-primary text-primary-foreground">
            {riskLoading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Analizando...</> : <><Crosshair className="w-3.5 h-3.5 mr-1.5" />Ejecutar</>}
          </Button>
        </div>
        {riskLoading && <div className="flex flex-col items-center py-16 gap-3"><Brain className="w-10 h-10 text-primary animate-pulse" /><p className="font-mono text-xs text-muted-foreground">Analizando patrones...</p><p className="font-mono text-[10px] text-muted-foreground/40">15-30 segundos</p></div>}
        {riskError && <div className="card-palantir p-4 border-red-300 dark:border-red-800"><p className="font-mono text-xs text-red-600">{riskError}</p></div>}
        {riskData && !riskLoading && <>
          <div className="card-palantir p-4 corner-marks mb-6">
            <p className="label-mono text-muted-foreground/40 mb-2">Resumen del equipo</p>
            <p className="font-mono text-xs leading-relaxed">{riskData.team_summary}</p>
            {riskData.highest_risk && <div className="mt-3 pt-3 border-t border-border"><p className="label-mono text-red-500/70 mb-1">Mayor riesgo</p><p className="font-mono text-xs text-red-600">{riskData.highest_risk}</p></div>}
          </div>
          {riskData.immediate_actions?.length > 0 && <div className="card-palantir p-4 mb-6"><p className="label-mono text-primary/70 mb-2">Acciones inmediatas</p>{riskData.immediate_actions.map((a, i) => <p key={i} className="font-mono text-[11px]"><span className="text-primary mr-2">{i + 1}.</span>{a}</p>)}</div>}
          <div className="space-y-3">
            {riskData.predictions?.sort((a, b) => b.resignation_risk - a.resignation_risk).map((p, i) => (
              <div key={i} className="card-palantir p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-sm font-bold">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-accent/30 border border-border overflow-hidden"><div className={cn("h-full", p.risk_level === "critical" ? "bg-red-600" : p.risk_level === "high" ? "bg-red-500" : p.risk_level === "medium" ? "bg-yellow-500" : "bg-green-500")} style={{ width: `${Math.min(p.resignation_risk, 100)}%` }} /></div>
                    <span className={cn("data-cell font-bold", p.risk_level === "critical" || p.risk_level === "high" ? "text-red-600" : p.risk_level === "medium" ? "text-yellow-600" : "text-green-600")}>{p.resignation_risk}%</span>
                    <span className="system-badge text-muted-foreground border-border uppercase">{p.risk_level}</span>
                  </div>
                </div>
                <p className="font-mono text-[11px] leading-relaxed mb-3">{p.prediction}</p>
                {p.signals?.length > 0 && <div className="mb-3"><p className="label-mono text-muted-foreground/40 mb-1">Senales</p><div className="flex flex-wrap gap-1.5">{p.signals.map((s, j) => <span key={j} className="system-badge text-muted-foreground border-border">{s}</span>)}</div></div>}
                <div className="pt-2 border-t border-border"><p className="label-mono text-primary/60 mb-1">Accion recomendada</p><p className="font-mono text-[11px] text-muted-foreground">{p.recommended_action}</p></div>
              </div>
            ))}
          </div>
        </>}
        {!riskData && !riskLoading && !riskError && <div className="flex flex-col items-center py-16 gap-3"><div className="w-16 h-16 border border-border flex items-center justify-center"><Crosshair className="w-7 h-7 text-muted-foreground/30" /></div><p className="font-mono text-xs text-muted-foreground/40">Ejecuta el analisis para ver predicciones</p></div>}
      </>}

      {tab === "auditoria" && <>
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-accent/30 border border-border p-3"><p className="label-mono text-muted-foreground/40">Reviews AI</p><p className="data-number text-xl mt-1">{reviews.length}</p></div>
          <div className="bg-accent/30 border border-border p-3"><p className="label-mono text-muted-foreground/40">Impacto Trust Prom.</p><p className={cn("data-number text-xl mt-1", (reviews.length > 0 ? Math.round(reviews.reduce((s, r) => s + r.trust_impact, 0) / reviews.length) : 0) >= 0 ? "text-green-600" : "text-red-600")}>{reviews.length > 0 ? (Math.round(reviews.reduce((s, r) => s + r.trust_impact, 0) / reviews.length) > 0 ? "+" : "") + Math.round(reviews.reduce((s, r) => s + r.trust_impact, 0) / reviews.length) : 0}</p></div>
          <div className="bg-accent/30 border border-border p-3"><p className="label-mono text-muted-foreground/40">Flags activas</p><p className="data-number text-xl mt-1">{flags.length}</p></div>
        </div>
        {(() => { const ft: Record<string, number> = {}; flags.forEach((f) => ft[f.flag_type] = (ft[f.flag_type] ?? 0) + 1); const entries = Object.entries(ft).sort(([, a], [, b]) => b - a); if (entries.length === 0) return null; const mx = Math.max(...Object.values(ft)); return <>
          <div className="palantir-divider text-muted-foreground/40 mb-3">Distribucion de flags</div>
          <div className="card-palantir p-4 mb-8"><div className="space-y-2">{entries.map(([type, count]) => { const fi = FLAG_TYPES[type as keyof typeof FLAG_TYPES]; return (
            <div key={type} className="flex items-center gap-3">
              <span className="text-sm w-5 text-center">{fi?.emoji ?? "?"}</span>
              <span className="w-28 font-mono text-[10px] text-muted-foreground truncate">{fi?.label ?? type}</span>
              <div className="flex-1 h-2.5 bg-accent/30 border border-border overflow-hidden"><div className={cn("h-full", fi?.severity === "high" ? "bg-red-500/70" : fi?.severity === "medium" ? "bg-yellow-500/70" : "bg-slate-400/70")} style={{ width: `${mx > 0 ? Math.round((count / mx) * 100) : 0}%` }} /></div>
              <span className="data-cell text-muted-foreground w-6 text-right">{count}</span>
            </div>
          ); })}</div></div>
        </>; })()}
        <div className="palantir-divider text-muted-foreground/40 mb-3">Reviews AI recientes</div>
        {reviews.length === 0 ? <div className="flex flex-col items-center py-12 gap-3"><div className="w-16 h-16 border border-border flex items-center justify-center"><Eye className="w-7 h-7 text-muted-foreground/30" /></div><p className="font-mono text-xs text-muted-foreground/40">Sin reviews recientes</p></div> : (
          <div className="space-y-2">{reviews.map((r) => { const mb = members.find((m) => m.id === r.user_id); return (
            <div key={r.id} className="card-palantir p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="system-badge text-primary border-primary/30">{r.review_type}</span>
                {mb && <span className="font-mono text-[11px] font-medium">{mb.full_name ?? "?"}</span>}
                <span className="data-cell text-muted-foreground/40 ml-auto">{r.date}</span>
              </div>
              <p className="font-mono text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{r.summary}</p>
              <span className={cn("font-mono text-[10px] font-bold mt-1 inline-block", r.trust_impact >= 0 ? "text-green-600" : "text-red-600")}>{r.trust_impact > 0 ? "+" : ""}{r.trust_impact} trust</span>
            </div>
          ); })}</div>
        )}
      </>}
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent, danger }: { label: string; value: number; icon: typeof Users; accent?: boolean; danger?: boolean }) {
  return (
    <div className="bg-accent/30 border border-border p-3 corner-marks">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={cn("w-3.5 h-3.5", danger ? "text-red-500" : accent ? "text-green-500" : "text-muted-foreground/50")} />
        <span className="label-mono text-muted-foreground/40">{label}</span>
      </div>
      <p className={cn("data-number text-2xl", danger ? "text-red-600" : accent ? "text-green-600" : "")}>{value}</p>
    </div>
  );
}

function MiniTrend({ label, data }: { label: string; data: Record<string, number[]> }) {
  const days = Object.keys(data).sort();
  const avgs = days.map((d) => { const v = data[d]; return v.length > 0 ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : 0; });
  return (
    <div>
      <div className="palantir-divider text-muted-foreground/40 mb-3">{label}</div>
      <div className="card-palantir p-4">
        {days.length === 0 ? <p className="text-center text-muted-foreground/40 font-mono text-xs py-4">Sin datos</p> : (
          <div className="flex items-end gap-1.5 h-16">
            {avgs.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="data-cell text-[7px] text-muted-foreground/50">{v}</span>
                <div className={cn("w-full", v >= 4 ? "bg-green-500/60" : v >= 3 ? "bg-yellow-500/60" : "bg-red-500/60")} style={{ height: `${Math.max(8, (v / 5) * 100)}%` }} />
                <span className="data-cell text-[6px] text-muted-foreground/30">{days[i]?.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
