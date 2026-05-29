// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TimelineFeed } from "@/components/timeline/timeline-feed";
import { TimelineFiltersBar, type TimelineFilters } from "@/components/timeline/timeline-filters";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { BulkEntryDialog } from "@/components/log-entry/bulk-entry-dialog";
import { LiveStatusBar } from "@/components/live/live-status-bar";
import { MissingHoursAlert } from "@/components/alerts/missing-hours-alert";
import { SmartNudges } from "@/components/alerts/smart-nudges";
import { EntrySearch } from "@/components/timeline/entry-search";
import { PersonalStatsWidget } from "@/components/dashboard/personal-stats";
import { DailyCloseoutDialog } from "@/components/closeout/daily-closeout-dialog";
import { DailyScoreWidget } from "@/components/dashboard/daily-score-widget";
import { ActivityTicker } from "@/components/dashboard/activity-ticker";
import { QuickLog } from "@/components/dashboard/quick-log";
import { EmptyChair } from "@/components/accountability/empty-chair";
import { BlockerEscalation } from "@/components/accountability/blocker-escalation";
import { DailyChallenge } from "@/components/dashboard/daily-challenge";
import { ScheduleOptimizer } from "@/components/dashboard/schedule-optimizer";
import { VelocityWidget } from "@/components/dashboard/velocity-widget";
import { MoodWeather } from "@/components/dashboard/mood-weather";
import { ProductivityScore } from "@/components/dashboard/productivity-score";
import { WorkSessionTracker } from "@/components/accountability/work-session";
import { SocialPressureWidget } from "@/components/accountability/social-pressure";
import { PublicAccountabilityBoard } from "@/components/accountability/public-shame-board";
import { LiveShameTicker } from "@/components/pressure/live-shame-ticker";
import { UrgencyEngine } from "@/components/pressure/urgency-engine";
import { DailyScoreboard } from "@/components/pressure/daily-scoreboard";
import { DailyVerdict } from "@/components/pressure/daily-verdict";
import { GhostDetector } from "@/components/pressure/ghost-detector";
import { GapAnalyzer } from "@/components/pressure/gap-analyzer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronLeft, ChevronRight, FileCheck, Layers, Calendar } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";

export default function DashboardPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (membership) {
        setOrgId(membership.org_id);
      }
      setLoading(false);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const displayDate = format(new Date(date + "T12:00:00"), "EEEE, d MMMM yyyy", {
    locale: es,
  });

  const isToday = date === new Date().toISOString().split("T")[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!orgId) {
    return <NoOrgView />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timeline</h1>
          <p className="text-muted-foreground text-sm capitalize mt-0.5">
            {displayDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isToday && (
            <Button
              variant="outline"
              onClick={() => setCloseoutOpen(true)}
              className="gap-2 hidden sm:flex rounded-xl"
            >
              <FileCheck className="w-4 h-4" />
              Cerrar dia
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setBulkOpen(true)}
            className="gap-2 hidden sm:flex rounded-xl"
          >
            <Layers className="w-4 h-4" />
            Bloque
          </Button>
          <Button
            onClick={() => setLogOpen(true)}
            className="gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 border-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Registrar hora</span>
          </Button>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-8 bg-card/80 border border-border/50 rounded-2xl p-2 w-fit">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl hover:bg-accent"
          onClick={() =>
            setDate(subDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])
          }
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 px-1">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl hover:bg-accent"
          onClick={() =>
            setDate(addDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])
          }
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        {!isToday && (
          <Button
            variant="secondary"
            size="sm"
            className="rounded-xl text-xs font-semibold"
            onClick={() => setDate(new Date().toISOString().split("T")[0])}
          >
            Hoy
          </Button>
        )}
      </div>

      {/* URGENCY ENGINE — escalating pressure based on time of day */}
      {isToday && <UrgencyEngine />}

      {/* LIVE SHAME TICKER — real-time peer completion feed */}
      {isToday && <LiveShameTicker orgId={orgId} />}

      {/* Daily challenge */}
      {isToday && <DailyChallenge orgId={orgId} />}

      {/* Schedule optimizer */}
      {isToday && <ScheduleOptimizer orgId={orgId} />}

      {/* Daily score */}
      {isToday && <DailyScoreWidget orgId={orgId} />}

      {/* Activity ticker */}
      {isToday && <ActivityTicker orgId={orgId} />}

      {/* Quick log */}
      {isToday && <QuickLog orgId={orgId} />}

      {/* Verified work session */}
      {isToday && <WorkSessionTracker orgId={orgId} />}

      {/* Social pressure ranking */}
      {isToday && <SocialPressureWidget orgId={orgId} />}

      {/* Public accountability board */}
      {isToday && <PublicAccountabilityBoard orgId={orgId} />}

      {/* Empty Chair - who's NOT working */}
      {isToday && <EmptyChair orgId={orgId} />}

      {/* Blocker escalation */}
      {isToday && <BlockerEscalation orgId={orgId} />}

      {/* Mood weather */}
      {isToday && <MoodWeather orgId={orgId} />}

      {/* Productivity score */}
      {isToday && <ProductivityScore orgId={orgId} />}

      {/* Velocity */}
      {isToday && <VelocityWidget orgId={orgId} />}

      {/* Personal stats */}
      <PersonalStatsWidget orgId={orgId} date={date} />

      {/* DAILY SCOREBOARD — ranked list of who's logging today */}
      {isToday && <DailyScoreboard orgId={orgId} />}

      {/* GAP ANALYZER — hour-by-hour gap visualization */}
      {isToday && <GapAnalyzer orgId={orgId} />}

      {/* GHOST DETECTOR — calls out online but not logging */}
      {isToday && <GhostDetector orgId={orgId} />}

      {/* Live status */}
      {isToday && <LiveStatusBar orgId={orgId} />}

      {/* Smart nudges */}
      {isToday && <SmartNudges date={date} />}

      {/* Missing hours alert */}
      {isToday && <MissingHoursAlert date={date} />}

      {/* Search */}
      <EntrySearch orgId={orgId} />

      {/* Filters */}
      <TimelineFiltersBar orgId={orgId} filters={filters} onChange={setFilters} />

      {/* Feed */}
      <TimelineFeed date={date} orgId={orgId} filters={filters} />

      <LogEntryDialog open={logOpen} onOpenChange={setLogOpen} defaultDate={date} />
      <BulkEntryDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <DailyCloseoutDialog open={closeoutOpen} onOpenChange={setCloseoutOpen} />

      {/* DAILY VERDICT — end-of-day judgment overlay */}
      {isToday && <DailyVerdict onOpenCloseout={() => setCloseoutOpen(true)} />}
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

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const { data: org } = await supabase
      .from("organizations")
      .insert({ name, slug })
      .select()
      .single();

    if (org) {
      await supabase
        .from("org_members")
        .insert({ org_id: org.id, user_id: user.id, role: "owner" });

      window.location.reload();
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/25 dark:to-sky-900/20 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-blue-600/10">
          <span className="text-4xl">🏢</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Crea tu equipo</h2>
          <p className="text-muted-foreground">
            Necesitas un equipo para empezar a registrar el trabajo.
          </p>
        </div>
        <form onSubmit={createOrg} className="flex gap-2">
          <Input
            placeholder="Nombre del equipo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-xl"
          />
          <Button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25"
          >
            {loading ? "Creando..." : "Crear"}
          </Button>
        </form>
      </div>
    </div>
  );
}
