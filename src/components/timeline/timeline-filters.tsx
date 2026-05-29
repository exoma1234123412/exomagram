"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, VERIFICATION_STATUS } from "@/lib/constants";
import type { WorkCategory, VerificationStatus, Profile } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Filter, X } from "lucide-react";

export interface TimelineFilters {
 person: string | null;
 category: WorkCategory | null;
 verification:"with_proof"|"without_proof"| null;
}

interface TimelineFiltersBarProps {
 orgId: string;
 filters: TimelineFilters;
 onChange: (filters: TimelineFilters) => void;
}

export function TimelineFiltersBar({ orgId, filters, onChange }: TimelineFiltersBarProps) {
 const [members, setMembers] = useState<{ user_id: string; full_name: string | null }[]>([]);
 const [expanded, setExpanded] = useState(false);
 const supabase = createClient();

 const hasFilters = filters.person || filters.category || filters.verification;

 useEffect(() => {
 async function loadMembers() {
 const { data } = await supabase
 .from("org_members")
 .select("user_id, profiles(full_name)")
 .eq("org_id", orgId)
 ;

 setMembers(
 data?.map((m) => ({ user_id: m.user_id, full_name: m.profiles?.full_name })) ?? []
 );
 }
 loadMembers();
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 function clearFilters() {
 onChange({ person: null, category: null, verification: null });
 }

 if (!expanded) {
 return (
 <div className="flex items-center gap-2 mb-6">
 <Button
 variant="outline"size="sm"onClick={() => setExpanded(true)}
 className="gap-2">
 <Filter className="w-3.5 h-3.5"/>
 Filtrar
 </Button>
 {hasFilters && (
 <>
 {filters.person && (
 <Badge variant="secondary"className="text-xs">
 {members.find((m) => m.user_id === filters.person)?.full_name ??"Persona"}
 </Badge>
 )}
 {filters.category && (
 <Badge variant="secondary"className="text-xs">
 {CATEGORIES[filters.category].emoji} {CATEGORIES[filters.category].label}
 </Badge>
 )}
 {filters.verification && (
 <Badge variant="secondary"className="text-xs">
 {filters.verification ==="with_proof"?"Con evidencia":"Sin evidencia"}
 </Badge>
 )}
 <Button variant="ghost"size="sm"onClick={clearFilters} className="h-6 w-6 p-0">
 <X className="w-3.5 h-3.5"/>
 </Button>
 </>
 )}
 </div>
 );
 }

 return (
 <div className="mb-6 p-4 bg-card border border-border/50 space-y-4">
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium flex items-center gap-2">
 <Filter className="w-3.5 h-3.5"/>
 Filtros
 </span>
 <div className="flex items-center gap-1">
 {hasFilters && (
 <Button variant="ghost"size="sm"onClick={clearFilters} className="text-xs h-7">
 Limpiar
 </Button>
 )}
 <Button variant="ghost"size="sm"onClick={() => setExpanded(false)} className="h-7 w-7 p-0">
 <X className="w-3.5 h-3.5"/>
 </Button>
 </div>
 </div>

 {/* Person filter */}
 <div className="space-y-1.5">
 <span className="text-xs text-muted-foreground">Persona</span>
 <div className="flex flex-wrap gap-1.5">
 {members.map((m) => (
 <button
 key={m.user_id}
 onClick={() =>
 onChange({ ...filters, person: filters.person === m.user_id ? null : m.user_id })
 }
 className={cn(
"px-2.5 py-1.5 text-xs font-semibold transition-all duration-200",
 filters.person === m.user_id
 ?"bg-primary text-primary-foreground shadow-primary/20":"bg-accent/60 hover:bg-accent")}
 >
 {m.full_name ??"Sin nombre"}
 </button>
 ))}
 </div>
 </div>

 {/* Category filter */}
 <div className="space-y-1.5">
 <span className="text-xs text-muted-foreground">Categoría</span>
 <div className="flex flex-wrap gap-1.5">
 {(Object.keys(CATEGORIES) as WorkCategory[]).map((key) => {
 const cat = CATEGORIES[key];
 return (
 <button
 key={key}
 onClick={() =>
 onChange({ ...filters, category: filters.category === key ? null : key })
 }
 className={cn(
"px-2.5 py-1.5 text-xs font-semibold transition-all duration-200",
 filters.category === key
 ?"bg-primary text-primary-foreground shadow-primary/20":"bg-accent/60 hover:bg-accent")}
 >
 {cat.emoji} {cat.label}
 </button>
 );
 })}
 </div>
 </div>

 {/* Verification filter */}
 <div className="space-y-1.5">
 <span className="text-xs text-muted-foreground">Evidencia</span>
 <div className="flex gap-1.5">
 <button
 onClick={() =>
 onChange({
 ...filters,
 verification: filters.verification ==="with_proof"? null :"with_proof",
 })
 }
 className={cn(
"px-2.5 py-1.5 text-xs font-semibold transition-all duration-200",
 filters.verification ==="with_proof"?"bg-green-600 text-white shadow-green-500/20":"bg-accent/60 hover:bg-accent")}
 >
 Con evidencia
 </button>
 <button
 onClick={() =>
 onChange({
 ...filters,
 verification: filters.verification ==="without_proof"? null :"without_proof",
 })
 }
 className={cn(
"px-2.5 py-1.5 text-xs font-semibold transition-all duration-200",
 filters.verification ==="without_proof"?"bg-yellow-600 text-white shadow-yellow-500/20":"bg-accent/60 hover:bg-accent")}
 >
 Sin evidencia
 </button>
 </div>
 </div>
 </div>
 );
}
