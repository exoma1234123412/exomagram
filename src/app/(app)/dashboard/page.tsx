"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { TimelineFeed } from "@/components/timeline/timeline-feed";
import { TimelineFiltersBar, type TimelineFilters } from "@/components/timeline/timeline-filters";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { LiveStatusBar } from "@/components/live/live-status-bar";
import { MissingHoursAlert } from "@/components/alerts/missing-hours-alert";
import { DailyCloseoutDialog } from "@/components/closeout/daily-closeout-dialog";
import { DailyScoreWidget } from "@/components/dashboard/daily-score-widget";
import { QuickLog } from "@/components/dashboard/quick-log";
import { StreakDanger } from "@/components/dashboard/streak-danger";
import { FearWidget } from "@/components/dashboard/fear-widget";
import { SocialPressureBar } from "@/components/dashboard/social-pressure-bar";
import { PublicFeed } from "@/components/feed/public-feed";
import { ThroneBanner } from "@/components/social/throne-crown";
import { ForcedComparison } from "@/components/social/forced-comparison";
import { HealthCheckin } from "@/components/dashboard/health-checkin";
import { DailyChecklist } from "@/components/dashboard/daily-checklist";
import { TeamDebt } from "@/components/accountability/team-debt";
import { WorstOfToday } from "@/components/social/worst-of-today";
import { SunkCostCounter } from "@/components/psychology/sunk-cost-counter";
import { CompetitiveWidget } from "@/components/psychology/competitive-widget";
import { ScarcityTimer } from "@/components/psychology/scarcity-timer";
import { GoalGradient } from "@/components/psychology/goal-gradient";
import { SocialProofBar } from "@/components/psychology/social-proof-bar";
import { SpotlightIndicator } from "@/components/psychology/spotlight-indicator";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronLeft, ChevronRight, FileCheck, Calendar, ChevronDown } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { getTodayMTY } from "@/lib/utils";

export default function DashboardPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [date, setDate] = useState(getTodayMTY());
 const [logOpen, setLogOpen] = useState(false);
 const [closeoutOpen, setCloseoutOpen] = useState(false);
 const [loading, setLoading] = useState(true);
 const [filters, setFilters] = useState<TimelineFilters>({
 person: null,
 category: null,
 verification: null,
 });
 const supabase = createClient();
 const router = useRouter();

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId || !userId) {
 setLoading(false);
 return;
 }

 async function checkWelcome() {
 // Redirect to welcome if user has zero time entries
 const { count } = await supabase
 .from("time_entries")
 .select("id", { count:"exact", head: true })
 .eq("user_id", userId!)
 .eq("org_id", orgId!);
 if (count === 0) {
 router.replace("/welcome");
 return;
 }
 setLoading(false);
 }
 checkWelcome();
 }, [orgId, userId, orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

 const displayDate = format(new Date(date +"T12:00:00"),"EEEE, d MMMM yyyy", { locale: es });
 const isToday = date === getTodayMTY();

 if (loading || orgLoading) {
 return <DashboardSkeleton />;
 }

 if (!orgId) return <NoOrgView />;

 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center justify-between mb-8">
 <div>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">Timeline</h1>
 <p className="text-muted-foreground text-xs font-mono capitalize mt-1">{displayDate}</p>
 </div>
 <div className="flex items-center gap-2">
 {isToday && (
 <Button variant="outline"onClick={() => setCloseoutOpen(true)} className="gap-2 hidden sm:flex text-xs font-mono">
 <FileCheck className="w-3.5 h-3.5"/> Cerrar día
 </Button>
 )}
 <Button onClick={() => setLogOpen(true)} className="gap-2 text-xs font-mono">
 <Plus className="w-3.5 h-3.5"/>
 <span className="hidden sm:inline">Registrar hora</span>
 </Button>
 </div>
 </div>

 {/* Date navigation */}
 <div className="flex items-center gap-2 mb-8">
 <Button variant="ghost"size="icon"onClick={() => setDate(subDays(new Date(date +"T12:00:00"), 1).toISOString().split("T")[0])}>
 <ChevronLeft className="w-4 h-4"/>
 </Button>
 <div className="flex items-center gap-2 px-1">
 <Calendar className="w-3.5 h-3.5 text-muted-foreground"/>
 <Input type="date"value={date} onChange={(e) => setDate(e.target.value)}
 className="w-auto border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto font-mono text-xs"/>
 </div>
 <Button variant="ghost"size="icon"onClick={() => setDate(addDays(new Date(date +"T12:00:00"), 1).toISOString().split("T")[0])}>
 <ChevronRight className="w-4 h-4"/>
 </Button>
 {!isToday && (
 <Button variant="secondary"size="sm"className="text-xs font-mono"onClick={() => setDate(getTodayMTY())}>
 Hoy
 </Button>
 )}
 </div>

 {/* Missing hours — actionable alert, seen first */}
 {isToday && <MissingHoursAlert date={date} />}

 {/* Live status — who's working now */}
 {isToday && <LiveStatusBar orgId={orgId} />}

 {/* Quick log — fast entry */}
 {isToday && <QuickLog orgId={orgId} />}

 {/* Daily score — personal scorecard summary */}
 {isToday && <DailyScoreWidget orgId={orgId} />}

 {/* Filters + Feed — the core content */}
 <TimelineFiltersBar orgId={orgId} filters={filters} onChange={setFilters} />
 <TimelineFeed date={date} orgId={orgId} filters={filters} />

 {/* Presión y Métricas — collapsible psychology/gamification section */}
 {isToday && (
 <details className="mb-8 group" open>
 <summary className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 cursor-pointer select-none flex items-center gap-2 mb-4 hover:text-muted-foreground/60 transition-colors">
 <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-0 -rotate-90" />
 Presión y Métricas
 </summary>

 {/* Daily checklist — personal daily status overview */}
 <DailyChecklist />

 {/* Spotlight — constant surveillance reminder */}
 <SpotlightIndicator orgId={orgId} />

 {/* Worst of today — the single worst metric */}
 <WorstOfToday />

 {/* Forced comparison — can't dismiss for 5 seconds */}
 <ForcedComparison />

 {/* Throne — who wears the crown this week */}
 <ThroneBanner orgId={orgId} />

 {/* Team debt — collective accountability for D/F grades */}
 <TeamDebt orgId={orgId} />

 {/* Streak danger — anxiety countdown */}
 <StreakDanger orgId={orgId} />

 {/* Fear widget — trust score decay pressure */}
 <FearWidget orgId={orgId} />

 {/* AI Public Feed — team announcements, praise, challenges */}
 <PublicFeed orgId={orgId} />

 {/* Psychology: goal progress + scarcity timer */}
 <GoalGradient orgId={orgId} />
 <ScarcityTimer orgId={orgId} />

 {/* Psychology: sunk cost investment + competitive head-to-head */}
 <SunkCostCounter orgId={orgId} />
 <CompetitiveWidget orgId={orgId} />

 {/* Psychology: social proof — team completion rates */}
 <SocialProofBar orgId={orgId} />

 {/* Health check-in — daily wellness */}
 <HealthCheckin orgId={orgId} />
 </details>
 )}

 <LogEntryDialog open={logOpen} onOpenChange={setLogOpen} defaultDate={date} />
 <DailyCloseoutDialog open={closeoutOpen} onOpenChange={setCloseoutOpen} />

 {/* Bottom padding for sticky pressure bar */}
 {isToday && <div className="h-16"/>}

 {/* Social pressure bar — sticky bottom with rank, team progress, surveillance */}
 {isToday && <SocialPressureBar orgId={orgId} />}
 </div>
 );
}

function NoOrgView() {
 const [name, setName] = useState("");
 const [loading, setLoading] = useState(false);
 const supabase = createClient();

 async function createOrg(e: React.FormEvent) {
 e.preventDefault();
 setLoading(true);
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;
 const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
 const { data: org } = await supabase.from("organizations").insert({ name, slug }).select().single();
 if (org) {
 await supabase.from("org_members").insert({ org_id: org.id, user_id: user.id, role:"owner"});
 // Seed default org settings
 await supabase.from("org_settings").insert({
 org_id: org.id,
 proof_required: false,
 min_hours_per_day: 8,
 trust_weight_punctuality: 20,
 trust_weight_proof: 30,
 trust_weight_consistency: 25,
 trust_weight_detail: 25,
 });
 window.location.reload();
 }
 setLoading(false);
 }

 return (
 <div className="flex items-center justify-center min-h-screen px-4">
 <div className="max-w-md w-full text-center space-y-8">
 <div className="w-16 h-16 border border-border flex items-center justify-center mx-auto">
 <span className="text-3xl">--</span>
 </div>
 <div>
 <h2 className="text-xl font-mono font-bold tracking-tight uppercase">Crea tu equipo</h2>
 <p className="text-muted-foreground text-sm font-mono mt-2">Necesitas un equipo para empezar.</p>
 </div>
 <form onSubmit={createOrg} className="flex gap-2">
 <Input placeholder="Nombre del equipo"value={name} onChange={(e) => setName(e.target.value)} required className="font-mono text-sm"/>
 <Button type="submit"disabled={loading} className="font-mono text-sm">
 {loading ?"Creando...":"Crear"}
 </Button>
 </form>
 </div>
 </div>
 );
}
