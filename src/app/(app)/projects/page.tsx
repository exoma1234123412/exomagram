"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, getInitials } from "@/lib/utils";
import { subDays } from "date-fns";
import { FolderKanban, Clock, Users, ChevronDown, ChevronUp } from "lucide-react";

interface ProjectStats {
  name: string;
  totalHours: number;
  contributors: { profile: Profile; hours: number }[];
  categoryBreakdown: { category: WorkCategory; hours: number }[];
  proofPercent: number;
  lastActivity: string;
}

export default function ProjectsPage() {
  const { orgId, loading: orgLoading } = useOrg();
  const [projects, setProjects] = useState<ProjectStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const supabase = createClient();

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) { setLoading(false); return; }

    async function load() {
      setLoading(true);

      const startDate = subDays(new Date(), days).toISOString().split("T")[0];

      // Get all entries with project tag
      const { data: entries } = await supabase
        .from("time_entries")
        .select("*, profiles(*)")
        .eq("org_id", orgId!)
        .gte("date", startDate)
        .not("project", "is", null)
        .order("date", { ascending: false });

      if (!entries || entries.length === 0) {
        setProjects([]);
        setLoading(false);
        return;
      }

      // Group by project
      const projectMap = new Map<string, typeof entries>();
      for (const entry of entries) {
        const proj = entry.project as string;
        const list = projectMap.get(proj) ?? [];
        list.push(entry);
        projectMap.set(proj, list);
      }

      const projectStats: ProjectStats[] = [];
      for (const [name, projEntries] of projectMap) {
        // Contributors
        const contributorMap = new Map<string, { profile: Profile; hours: number }>();
        const catMap = new Map<WorkCategory, number>();
        let withProof = 0;
        let lastDate = "";

        for (const e of projEntries) {
          const existing = contributorMap.get(e.user_id);
          if (existing) {
            existing.hours++;
          } else {
            contributorMap.set(e.user_id, {
              profile: e.profiles as unknown as Profile,
              hours: 1,
            });
          }
          catMap.set(e.category as WorkCategory, (catMap.get(e.category as WorkCategory) ?? 0) + 1);
          if (e.proof_urls && e.proof_urls.length > 0) withProof++;
          if (e.date > lastDate) lastDate = e.date;
        }

        projectStats.push({
          name,
          totalHours: projEntries.length,
          contributors: Array.from(contributorMap.values()).sort((a, b) => b.hours - a.hours),
          categoryBreakdown: Array.from(catMap.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([cat, hours]) => ({ category: cat, hours })),
          proofPercent: projEntries.length > 0 ? Math.round((withProof / projEntries.length) * 100) : 0,
          lastActivity: lastDate,
        });
      }

      projectStats.sort((a, b) => b.totalHours - a.totalHours);
      setProjects(projectStats);
      setLoading(false);
    }
    load();
  }, [orgLoading, orgId, days]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-primary" />
            Proyectos
          </h1>
          <p className="text-muted-foreground text-sm">
            Tiempo invertido por proyecto
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" /><p className="text-sm text-muted-foreground animate-pulse">Cargando...</p></div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground">
            No hay entradas con proyecto asignado.
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Usa el campo "Proyecto" al registrar horas para rastrear tiempo por proyecto.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Card key={p.name} className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
              <CardContent className="p-4">
                <button
                  onClick={() => toggleExpand(p.name)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center shrink-0">
                      <FolderKanban className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{p.name}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {p.totalHours}h
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {p.contributors.length}
                        </span>
                        <span>{p.proofPercent}% evidencia</span>
                        <span>Ultimo: {p.lastActivity}</span>
                      </div>
                    </div>
                    {/* Stacked avatars */}
                    <div className="flex -space-x-2">
                      {p.contributors.slice(0, 4).map((c) => (
                        <Avatar key={c.profile.id} className="w-7 h-7 ring-2 ring-background shadow-sm border-2 border-background">
                          <AvatarImage src={c.profile.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[8px]">
                            {getInitials(c.profile.full_name)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {p.contributors.length > 4 && (
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] border-2 border-background">
                          +{p.contributors.length - 4}
                        </div>
                      )}
                    </div>
                    {expanded.has(p.name) ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {expanded.has(p.name) && (
                  <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Contributors */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Contribuidores</p>
                      <div className="space-y-2">
                        {p.contributors.map((c) => (
                          <div key={c.profile.id} className="flex items-center gap-2">
                            <Avatar className="w-6 h-6 ring-2 ring-background shadow-sm">
                              <AvatarImage src={c.profile.avatar_url ?? undefined} />
                              <AvatarFallback className="text-[8px]">
                                {getInitials(c.profile.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm flex-1 truncate">
                              {c.profile.full_name ?? c.profile.email}
                            </span>
                            <span className="text-xs text-muted-foreground">{c.hours}h</span>
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${(c.hours / p.totalHours) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Category breakdown */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Categorias</p>
                      <div className="space-y-2">
                        {p.categoryBreakdown.map(({ category, hours }) => (
                          <div key={category} className="flex items-center gap-2">
                            <div className={cn("w-3 h-3 rounded-sm", CATEGORY_COLORS[category])} />
                            <span className="text-sm flex-1">
                              {CATEGORIES[category].emoji} {CATEGORIES[category].label}
                            </span>
                            <span className="text-xs text-muted-foreground">{hours}h</span>
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", CATEGORY_COLORS[category])}
                                style={{ width: `${(hours / p.totalHours) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
