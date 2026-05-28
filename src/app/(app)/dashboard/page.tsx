"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TimelineFeed } from "@/components/timeline/timeline-feed";
import { TimelineFiltersBar, type TimelineFilters } from "@/components/timeline/timeline-filters";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { BulkEntryDialog } from "@/components/log-entry/bulk-entry-dialog";
import { LiveStatusBar } from "@/components/live/live-status-bar";
import { MissingHoursAlert } from "@/components/alerts/missing-hours-alert";
import { DailyCloseoutDialog } from "@/components/closeout/daily-closeout-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronLeft, ChevronRight, FileCheck, Layers } from "lucide-react";
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
        .single<{ org_id: string }>();

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
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!orgId) {
    return <NoOrgView />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Timeline</h1>
          <p className="text-muted-foreground text-sm capitalize">
            {displayDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isToday && (
            <Button
              variant="outline"
              onClick={() => setCloseoutOpen(true)}
              className="gap-2 hidden sm:flex"
            >
              <FileCheck className="w-4 h-4" />
              Cerrar dia
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setBulkOpen(true)}
            className="gap-2 hidden sm:flex"
          >
            <Layers className="w-4 h-4" />
            Bloque
          </Button>
          <Button onClick={() => setLogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Registrar hora</span>
          </Button>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            setDate(subDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])
          }
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            setDate(addDays(new Date(date + "T12:00:00"), 1).toISOString().split("T")[0])
          }
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        {!isToday && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDate(new Date().toISOString().split("T")[0])}
          >
            Hoy
          </Button>
        )}
      </div>

      {/* Live status */}
      {isToday && <LiveStatusBar orgId={orgId} />}

      {/* Missing hours alert */}
      {isToday && <MissingHoursAlert date={date} />}

      {/* Filters */}
      <TimelineFiltersBar orgId={orgId} filters={filters} onChange={setFilters} />

      {/* Feed */}
      <TimelineFeed date={date} orgId={orgId} filters={filters} />

      <LogEntryDialog open={logOpen} onOpenChange={setLogOpen} defaultDate={date} />
      <BulkEntryDialog open={bulkOpen} onOpenChange={setBulkOpen} />
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
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-3xl">🏢</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold">Crea tu equipo</h2>
          <p className="text-muted-foreground mt-2">
            Necesitas un equipo para empezar a registrar el trabajo.
          </p>
        </div>
        <form onSubmit={createOrg} className="flex gap-2">
          <Input
            placeholder="Nombre del equipo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Creando..." : "Crear"}
          </Button>
        </form>
      </div>
    </div>
  );
}
