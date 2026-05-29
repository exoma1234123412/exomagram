"use client";

import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Project } from "@/lib/types/database";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { cn, getInitials } from "@/lib/utils";
import { subDays } from "date-fns";
import {
 FolderKanban, Clock, Users, ChevronDown, ChevronUp, Plus, Archive,
 RotateCcw, CheckCircle2,
} from "lucide-react";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

interface ProjectWithStats extends Project {
 totalHours: number;
 contributors: { profile: Profile; hours: number }[];
 categoryBreakdown: { category: WorkCategory; hours: number }[];
 proofPercent: number;
 lastActivity: string | null;
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function ProjectsPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const [projects, setProjects] = useState<ProjectWithStats[]>([]);
 const [loading, setLoading] = useState(true);
 const [days, setDays] = useState(30);
 const [expanded, setExpanded] = useState<Set<string>>(new Set());
 const [showArchived, setShowArchived] = useState(false);
 const [createOpen, setCreateOpen] = useState(false);
 const [newName, setNewName] = useState("");
 const [newDesc, setNewDesc] = useState("");
 const [creating, setCreating] = useState(false);
 const supabase = createClient();

 const load = useCallback(async () => {
 if (orgLoading || !orgId) return;
 setLoading(true);

 const startDate = subDays(new Date(), days).toISOString().split("T")[0];

 // Load projects from DB
 const { data: dbProjects } = await supabase
 .from("projects")
 .select("*")
 .eq("org_id", orgId)
 .order("created_at", { ascending: false });

 // Load entries for stats
 const { data: entries } = await supabase
 .from("time_entries")
 .select("*, profiles(*)")
 .eq("org_id", orgId)
 .gte("date", startDate)
 .not("project_id", "is", null);

 const entryMap = new Map<string, typeof entries>();
 for (const e of entries ?? []) {
 const pid = e.project_id as string;
 const list = entryMap.get(pid) ?? [];
 list.push(e);
 entryMap.set(pid, list);
 }

 // Also check free-text entries not yet linked
 const { data: freeTextEntries } = await supabase
 .from("time_entries")
 .select("*, profiles(*)")
 .eq("org_id", orgId)
 .gte("date", startDate)
 .is("project_id", null)
 .not("project", "is", null);

 // Match free-text to projects by name
 for (const e of freeTextEntries ?? []) {
 const proj = (dbProjects ?? []).find(
 (p) => p.name.toLowerCase() === (e.project as string).toLowerCase()
 );
 if (proj) {
 const list = entryMap.get(proj.id) ?? [];
 list.push(e);
 entryMap.set(proj.id, list);
 }
 }

 const result: ProjectWithStats[] = (dbProjects ?? []).map((proj) => {
 const projEntries = entryMap.get(proj.id) ?? [];
 const contributorMap = new Map<string, { profile: Profile; hours: number }>();
 const catMap = new Map<WorkCategory, number>();
 let withProof = 0;
 let lastDate: string | null = null;

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
 if (!lastDate || e.date > lastDate) lastDate = e.date;
 }

 return {
 ...proj,
 totalHours: projEntries.length,
 contributors: Array.from(contributorMap.values()).sort((a, b) => b.hours - a.hours),
 categoryBreakdown: Array.from(catMap.entries())
 .sort((a, b) => b[1] - a[1])
 .map(([cat, hours]) => ({ category: cat, hours })),
 proofPercent: projEntries.length > 0 ? Math.round((withProof / projEntries.length) * 100) : 0,
 lastActivity: lastDate,
 };
 });

 result.sort((a, b) => b.totalHours - a.totalHours);
 setProjects(result);
 setLoading(false);
 }, [orgId, orgLoading, days]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => { load(); }, [load]);

 function toggleExpand(id: string) {
 setExpanded((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 }

 async function handleCreate() {
 if (!newName.trim() || !orgId) return;
 setCreating(true);

 const { data: { user } } = await supabase.auth.getUser();
 if (!user) { setCreating(false); return; }

 const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

 const { error } = await supabase.from("projects").insert({
 org_id: orgId,
 name: newName.trim(),
 slug,
 description: newDesc.trim() || null,
 created_by: user.id,
 });

 if (error) {
 console.error("Error creating project:", error);
 alert(`Error: ${error.message}`);
 setCreating(false);
 return;
 }

 setNewName("");
 setNewDesc("");
 setCreating(false);
 setCreateOpen(false);
 load();
 }

 async function toggleStatus(proj: ProjectWithStats) {
 const newStatus = proj.status === "active" ? "archived" : "active";
 await supabase.from("projects").update({ status: newStatus }).eq("id", proj.id);
 load();
 }

 const active = projects.filter((p) => p.status === "active");
 const archived = projects.filter((p) => p.status !== "active");

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center justify-between mb-6">
 <div>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <FolderKanban className="w-5 h-5 text-primary"/>
 Proyectos
 </h1>
 <p className="text-xs font-mono text-muted-foreground mt-1">
 Crea y gestiona proyectos del equipo
 </p>
 </div>
 <div className="flex items-center gap-2">
 <div className="flex gap-1">
 {[7, 30, 90].map((d) => (
 <Button
 key={d}
 variant={days === d ? "default" : "outline"}
 size="sm"
 className="font-mono text-xs"
 onClick={() => setDays(d)}
 >
 {d}d
 </Button>
 ))}
 </div>
 <Button
 size="sm"
 className="font-mono text-xs"
 onClick={() => setCreateOpen(true)}
 >
 <Plus className="w-3.5 h-3.5 mr-1"/>
 Nuevo
 </Button>
 </div>
 </div>

 {/* Create dialog */}
 <Dialog open={createOpen} onOpenChange={setCreateOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="font-mono uppercase tracking-tight">Nuevo proyecto</DialogTitle>
 </DialogHeader>
 <div className="space-y-4">
 <div className="space-y-2">
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Nombre
 </label>
 <Input
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 placeholder="ej: landing-page, api-v2, onboarding"
 className="font-mono text-sm"
 />
 </div>
 <div className="space-y-2">
 <label className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Descripcion (opcional)
 </label>
 <Textarea
 value={newDesc}
 onChange={(e) => setNewDesc(e.target.value)}
 placeholder="Describe brevemente el proyecto..."
 rows={2}
 className="text-sm"
 />
 </div>
 <Button
 onClick={handleCreate}
 disabled={!newName.trim() || creating}
 className="w-full font-mono text-xs"
 >
 {creating ? "Creando..." : "Crear proyecto"}
 </Button>
 </div>
 </DialogContent>
 </Dialog>

 {/* Content */}
 {loading ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse font-mono text-xs tracking-widest uppercase">Cargando...</p>
 </div>
 ) : active.length === 0 && archived.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 border border-border flex items-center justify-center">
 <FolderKanban className="w-7 h-7 text-muted-foreground"/>
 </div>
 <p className="text-sm text-muted-foreground">No hay proyectos.</p>
 <Button size="sm" className="font-mono text-xs" onClick={() => setCreateOpen(true)}>
 <Plus className="w-3.5 h-3.5 mr-1"/> Crear primer proyecto
 </Button>
 </div>
 ) : (
 <div className="space-y-3">
 {active.map((p) => (
 <ProjectCard
 key={p.id}
 project={p}
 expanded={expanded.has(p.id)}
 onToggle={() => toggleExpand(p.id)}
 onStatusToggle={() => toggleStatus(p)}
 />
 ))}

 {/* Archived section */}
 {archived.length > 0 && (
 <div className="mt-8">
 <button
 onClick={() => setShowArchived(!showArchived)}
 className="flex items-center gap-2 font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3"
 >
 <Archive className="w-3.5 h-3.5"/>
 Archivados ({archived.length})
 {showArchived ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
 </button>
 {showArchived && (
 <div className="space-y-3 opacity-60">
 {archived.map((p) => (
 <ProjectCard
 key={p.id}
 project={p}
 expanded={expanded.has(p.id)}
 onToggle={() => toggleExpand(p.id)}
 onStatusToggle={() => toggleStatus(p)}
 />
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 )}
 </div>
 );
}

// ────────────────────────────────────────────
// ProjectCard
// ────────────────────────────────────────────

function ProjectCard({
 project: p,
 expanded,
 onToggle,
 onStatusToggle,
}: {
 project: ProjectWithStats;
 expanded: boolean;
 onToggle: () => void;
 onStatusToggle: () => void;
}) {
 return (
 <Card className="transition-all duration-200 hover:border-primary/30">
 <CardContent className="p-4">
 <div className="flex items-center gap-3">
 <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left">
 <div className="w-10 h-10 bg-accent/30 border border-border flex items-center justify-center shrink-0">
 <FolderKanban className="w-5 h-5 text-primary"/>
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <h3 className="font-mono font-semibold text-sm truncate">{p.name}</h3>
 {p.status !== "active" && (
 <Badge variant="outline" className="text-[9px] font-mono">
 {p.status === "archived" ? "Archivado" : "Completado"}
 </Badge>
 )}
 </div>
 {p.description && (
 <p className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</p>
 )}
 <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground mt-1">
 <span className="flex items-center gap-1">
 <Clock className="w-3 h-3"/>
 {p.totalHours}h
 </span>
 <span className="flex items-center gap-1">
 <Users className="w-3 h-3"/>
 {p.contributors.length}
 </span>
 <span>{p.proofPercent}% evidencia</span>
 {p.lastActivity && <span>Ultimo: {p.lastActivity}</span>}
 </div>
 </div>
 {/* Stacked avatars */}
 <div className="hidden sm:flex -space-x-2">
 {p.contributors.slice(0, 4).map((c) => (
 <Avatar key={c.profile.id} className="w-7 h-7 ring-1 ring-border">
 <AvatarImage src={c.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px]">
 {getInitials(c.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 ))}
 {p.contributors.length > 4 && (
 <div className="w-7 h-7 bg-muted flex items-center justify-center text-[10px] ring-1 ring-border">
 +{p.contributors.length - 4}
 </div>
 )}
 </div>
 {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0"/> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0"/>}
 </button>

 <button
 onClick={onStatusToggle}
 className="p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
 title={p.status === "active" ? "Archivar" : "Restaurar"}
 >
 {p.status === "active" ? <Archive className="w-3.5 h-3.5"/> : <RotateCcw className="w-3.5 h-3.5"/>}
 </button>
 </div>

 {expanded && p.totalHours > 0 && (
 <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-4">
 {/* Contributors */}
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">Contribuidores</p>
 <div className="space-y-2">
 {p.contributors.map((c) => (
 <div key={c.profile.id} className="flex items-center gap-2">
 <Avatar className="w-6 h-6 ring-1 ring-border">
 <AvatarImage src={c.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px]">{getInitials(c.profile.full_name)}</AvatarFallback>
 </Avatar>
 <span className="text-xs flex-1 truncate font-mono">{c.profile.full_name ?? c.profile.email}</span>
 <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{c.hours}h</span>
 <div className="w-16 h-1.5 bg-muted overflow-hidden">
 <div className="h-full bg-primary" style={{ width: `${(c.hours / p.totalHours) * 100}%` }}/>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Category breakdown */}
 <div>
 <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">Categorias</p>
 <div className="space-y-2">
 {p.categoryBreakdown.map(({ category, hours }) => (
 <div key={category} className="flex items-center gap-2">
 <div className={cn("w-3 h-3", CATEGORY_COLORS[category])} />
 <span className="text-xs flex-1 font-mono">{CATEGORIES[category].label}</span>
 <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{hours}h</span>
 <div className="w-16 h-1.5 bg-muted overflow-hidden">
 <div className={cn("h-full", CATEGORY_COLORS[category])} style={{ width: `${(hours / p.totalHours) * 100}%` }}/>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
}
