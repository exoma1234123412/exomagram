import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Logo } from "@/components/layout/logo";
import Link from "next/link";

// Category bar colors — using the canonical category color tokens
const CATEGORY_BAR_COLORS: Record<string, string> = {
  deep_work: "bg-violet-500",
  meeting: "bg-blue-500",
  review: "bg-amber-500",
  admin: "bg-slate-400",
  planning: "bg-emerald-500",
  learning: "bg-pink-500",
  break: "bg-green-500",
  blocked: "bg-red-500",
};

export default async function PublicDashboard({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // Find the public dashboard by token
  const { data: dashboard } = await supabase
    .from("public_dashboards")
    .select("*, organizations(name)")
    .eq("token", token)
    .eq("active", true)
    .single();

  if (!dashboard) return notFound();

  const today = new Date().toISOString().split("T")[0];
  const orgName = (dashboard.organizations as Record<string, unknown>)?.name as string ?? "Equipo";

  // Get today's entries
  const { data: entries } = await supabase
    .from("time_entries")
    .select("*, profiles(full_name, role)")
    .eq("org_id", dashboard.org_id)
    .eq("date", today)
    .order("hour", { ascending: false });

  // Get members count
  const { count: memberCount } = await supabase
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", dashboard.org_id);

  // Stats
  const totalHours = entries?.length ?? 0;
  const withProof = entries?.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length ?? 0;
  const proofPercent = totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0;

  // By category
  const catCounts = new Map<string, number>();
  for (const e of entries ?? []) {
    catCounts.set(e.category, (catCounts.get(e.category) ?? 0) + 1);
  }

  // Active members today
  const activeMembers = new Set((entries ?? []).map((e) => e.user_id)).size;

  const dateLabel = format(new Date(), "EEEE, d MMMM yyyy", { locale: es });

  return (
    <div className="min-h-screen bg-background bg-grid-palantir">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">

        {/* Brand header */}
        <div className="flex items-center justify-between mb-10 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Logo size={28} />
            <div>
              <p className="font-mono text-sm font-black tracking-[0.14em] text-foreground uppercase">
                EXOMAGRAM
              </p>
              <p className="font-mono text-[8px] tracking-[0.2em] text-primary/60 uppercase">
                Vigilancia Total del Trabajo
              </p>
            </div>
          </div>
          <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground hidden sm:block">
            Dashboard Público
          </p>
        </div>

        {/* Org title + date */}
        <div className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60 mb-1">
            Organización
          </p>
          <h1 className="font-mono font-bold text-2xl uppercase tracking-tight text-foreground">
            {orgName}
          </h1>
          <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground mt-1 capitalize">
            {dateLabel}
          </p>
        </div>

        {/* Summary stat row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px border border-border mb-8">
          <div className="bg-card p-5 text-center">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60 mb-2">
              Horas registradas
            </p>
            <p className="font-mono font-bold text-3xl tabular-nums tracking-tight text-primary">
              {totalHours}
            </p>
          </div>
          <div className="bg-card p-5 text-center">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60 mb-2">
              Miembros activos
            </p>
            <p className="font-mono font-bold text-3xl tabular-nums tracking-tight text-foreground">
              {activeMembers}
              <span className="text-lg text-muted-foreground">/{memberCount ?? 0}</span>
            </p>
          </div>
          <div className="bg-card p-5 text-center">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60 mb-2">
              Con evidencia
            </p>
            <p className={`font-mono font-bold text-3xl tabular-nums tracking-tight ${proofPercent >= 70 ? "text-green-500" : "text-amber-500"}`}>
              {proofPercent}%
            </p>
          </div>
          <div className="bg-card p-5 text-center">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60 mb-2">
              Categorías activas
            </p>
            <p className="font-mono font-bold text-3xl tabular-nums tracking-tight text-foreground">
              {catCounts.size}
            </p>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="border border-border bg-card mb-8 corner-marks">
          <div className="px-5 py-3 border-b border-border">
            <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60">
              Distribución del trabajo
            </p>
          </div>
          <div className="p-5 space-y-4">
            {catCounts.size === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground text-center py-6">
                Sin actividad registrada hoy.
              </p>
            ) : (
              Array.from(catCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => {
                  const catInfo = CATEGORIES[cat as WorkCategory];
                  const percent = Math.round((count / totalHours) * 100);
                  const barColor = CATEGORY_BAR_COLORS[cat] ?? "bg-primary";
                  return (
                    <div key={cat}>
                      <div className="flex justify-between mb-1.5">
                        <span className={`font-mono text-[11px] font-semibold uppercase tracking-wide ${catInfo?.color ?? "text-foreground"}`}>
                          {catInfo?.label ?? cat}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          {count}h &mdash; {percent}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-border/50">
                        <div
                          className={`h-full ${barColor} transition-all duration-500`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Recent entries (if show_details is on) */}
        {dashboard.show_details && (
          <div className="border border-border bg-card mb-8">
            <div className="px-5 py-3 border-b border-border">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60">
                Actividad reciente
              </p>
            </div>
            <div className="divide-y divide-border">
              {(entries ?? []).length === 0 ? (
                <p className="font-mono text-[11px] text-muted-foreground text-center py-6">
                  Sin entradas registradas hoy.
                </p>
              ) : (
                (entries ?? []).slice(0, 20).map((e) => {
                  const catInfo = CATEGORIES[e.category as WorkCategory];
                  const profile = e.profiles as Record<string, unknown> | null;
                  const hasProof = e.proof_urls && (e.proof_urls as string[]).length > 0;
                  return (
                    <div key={e.id} className="flex items-center gap-4 px-5 py-3">
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-12 shrink-0">
                        {e.hour}:00
                      </span>
                      <span className={`font-mono text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 border ${catInfo?.color ?? "text-muted-foreground"} border-current/20 shrink-0`}>
                        {catInfo?.label ?? e.category}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[11px] truncate text-foreground">{e.title}</p>
                        {dashboard.show_names && profile?.full_name && (
                          <p className="font-mono text-[9px] tracking-wide text-muted-foreground mt-0.5">
                            {profile.full_name as string}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {hasProof && (
                          <span className="font-mono text-[9px] uppercase tracking-wide text-green-500">
                            EVIDENCIA
                          </span>
                        )}
                        {e.is_late && (
                          <span className="font-mono text-[9px] uppercase tracking-wide text-amber-500">
                            TARDÍA
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* CTA footer */}
        <div className="border border-border bg-card p-8 text-center mt-4">
          <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60 mb-3">
            Transparencia radical para tu equipo
          </p>
          <p className="font-mono font-bold text-base uppercase tracking-tight text-foreground mb-5">
            ¿Quieres esta visibilidad para tu equipo?
          </p>
          <Link
            href="/signup"
            className="inline-block bg-primary text-primary-foreground font-mono text-xs font-bold uppercase tracking-[0.14em] px-8 py-3 hover:opacity-90 transition-opacity duration-200"
          >
            Probar Exomagram Gratis
          </Link>
        </div>

        {/* Bottom brand bar */}
        <div className="flex items-center justify-center gap-2 mt-8 pt-6 border-t border-border">
          <Logo size={14} className="text-muted-foreground" />
          <p className="font-mono text-[9px] tracking-[0.16em] uppercase text-muted-foreground">
            Powered by{" "}
            <Link href="/signup" className="text-primary hover:opacity-80 transition-opacity">
              Exomagram
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
