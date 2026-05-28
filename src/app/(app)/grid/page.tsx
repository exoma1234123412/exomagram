"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TeamGrid } from "@/components/grid/team-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";

export default function GridPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

      if (membership) setOrgId(membership.org_id);
      setLoading(false);
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = date === new Date().toISOString().split("T")[0];
  const displayDate = format(new Date(date + "T12:00:00"), "EEEE, d MMMM yyyy", {
    locale: es,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">
          Primero crea o únete a un equipo desde el Dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Vista de Equipo</h1>
        <p className="text-muted-foreground text-sm capitalize">{displayDate}</p>
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

      {/* Grid */}
      <TeamGrid date={date} orgId={orgId} />
    </div>
  );
}
