"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TimelineFeed } from "@/components/timeline/timeline-feed";
import { TimelineFiltersBar, type TimelineFilters } from "@/components/timeline/timeline-filters";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { LiveStatusBar } from "@/components/live/live-status-bar";
import { MissingHoursAlert } from "@/components/alerts/missing-hours-alert";
import { DailyCloseoutDialog } from "@/components/closeout/daily-closeout-dialog";
import { DailyScoreWidget } from "@/components/dashboard/daily-score-widget";
import { QuickLog } from "@/components/dashboard/quick-log";
import { PublicFeed } from "@/components/feed/public-feed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronLeft, ChevronRight, FileCheck, Calendar } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { getTodayMTY } from "@/lib/utils";

export default function DashboardPage() {
  const [date, setDate] = useState(getTodayMTY());
  const [orgId, setOrgId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TimelineFilters>({
    person: null,
    category: null,
    verification: null,
  });
  const supabase = createClient();

  useEffect(() => {
    async function loadOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
      if (membership) setOrgId(membership.org_id);
      setLoading(false);
    }
    loadOrg();
  }, []);

  const displayDate = format(new Date(date + "T12:00:00"), "EEEE, d MMMM yyyy", { locale: es });
  const isToday = date === getTodayMTY();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!orgId) return <NoOrgView />;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Timeline</h1>
          <p className="text-muted-foreground text-sm capitalize mt-0.5">{displayDate}</p>
        </div>
        <div className="flex items-center gap-2">
          {isToday && (
            <Button variant="outline" onClick={() => setCloseoutOpen(true)} className="gap-2 hidden sm:flex rounded-xl">
              <FileCheck className="w-4 h-4" /> Cerrar día
            </Button>
          )}
          <Button onClick={() => setLogOpen(true)} className="gap-2 rounded-xl">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Registrar hora</span>
          </Button>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-8">
        <Button variant="ghost" size="icon" className="rounded-xl"
          onClick={() => setDate(subDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 px-1">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-auto border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto" />
        </div>
        <Button variant="ghost" size="icon" className="rounded-xl"
          onClick={() => setDate(addDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        {!isToday && (
          <Button variant="secondary" size="sm" className="rounded-xl text-xs"
            onClick={() => setDate(getTodayMTY())}>
            Hoy
          </Button>
        )}
      </div>

      {/* AI Public Feed — team announcements, praise, challenges */}
      {isToday && <PublicFeed orgId={orgId} />}

      {/* Daily score — your personal scorecard */}
      {isToday && <DailyScoreWidget orgId={orgId} />}

      {/* Quick log — fast entry */}
      {isToday && <QuickLog orgId={orgId} />}

      {/* Live status — who's working now */}
      {isToday && <LiveStatusBar orgId={orgId} />}

      {/* Missing hours — gentle reminder */}
      {isToday && <MissingHoursAlert date={date} />}

      {/* Filters */}
      <TimelineFiltersBar orgId={orgId} filters={filters} onChange={setFilters} />

      {/* Feed — the core */}
      <TimelineFeed date={date} orgId={orgId} filters={filters} />

      <LogEntryDialog open={logOpen} onOpenChange={setLogOpen} defaultDate={date} />
      <DailyCloseoutDialog open={closeoutOpen} onOpenChange={setCloseoutOpen} />
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
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const { data: org } = await supabase.from("organizations").insert({ name, slug }).select().single();
    if (org) {
      await supabase.from("org_members").insert({ org_id: org.id, user_id: user.id, role: "owner" });
      window.location.reload();
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-3xl">🏢</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Crea tu equipo</h2>
          <p className="text-muted-foreground mt-2">Necesitas un equipo para empezar.</p>
        </div>
        <form onSubmit={createOrg} className="flex gap-2">
          <Input placeholder="Nombre del equipo" value={name} onChange={(e) => setName(e.target.value)} required className="rounded-xl" />
          <Button type="submit" disabled={loading} className="rounded-xl">
            {loading ? "Creando..." : "Crear"}
          </Button>
        </form>
      </div>
    </div>
  );
}
