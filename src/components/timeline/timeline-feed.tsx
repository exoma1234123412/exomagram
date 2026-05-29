"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { TimeEntryCard } from "./time-entry-card";
import { WORK_HOURS } from "@/lib/constants";
import { Loader2, Clock, Search } from "lucide-react";
import type { TimelineFilters } from "./timeline-filters";

type EntryWithProfile = TimeEntry & { profiles: Profile };

export function TimelineFeed({
 date,
 orgId,
 filters,
}: {
 date: string;
 orgId: string;
 filters?: TimelineFilters;
}) {
 const [entries, setEntries] = useState<EntryWithProfile[]>([]);
 const [loading, setLoading] = useState(true);
 // Stable client ref — avoid recreating the Supabase instance on every render
 const supabaseRef = useRef(createClient());
 const supabase = supabaseRef.current;

 useEffect(() => {
 async function fetchEntries() {
 setLoading(true);
 const { data } = await supabase
 .from("time_entries")
 .select("*, profiles!time_entries_user_id_fkey(id, full_name, avatar_url, email)")
 .eq("org_id", orgId)
 .eq("date", date)
 .order("hour", { ascending: false })
 .limit(200);

 setEntries(data ?? []);
 setLoading(false);
 }

 fetchEntries();

 // Real-time subscription
 const channel = supabase
 .channel(`time_entries_realtime_${orgId}`)
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"time_entries",
 filter:`org_id=eq.${orgId}`,
 },
 async () => {
 // Refetch on any change
 const { data } = await supabase
 .from("time_entries")
 .select("*, profiles!time_entries_user_id_fkey(id, full_name, avatar_url, email)")
 .eq("org_id", orgId)
 .eq("date", date)
 .order("hour", { ascending: false })
 .limit(200);
 setEntries(data ?? []);
 }
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [date, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 const filteredEntries = useMemo(() => {
 if (!filters) return entries;

 return entries.filter((entry) => {
 if (filters.person && entry.user_id !== filters.person) return false;
 if (filters.category && entry.category !== filters.category) return false;
 if (filters.verification ==="with_proof") {
 if (!entry.proof_urls || entry.proof_urls.length === 0) return false;
 }
 if (filters.verification ==="without_proof") {
 if (entry.proof_urls && entry.proof_urls.length > 0) return false;
 }
 return true;
 });
 }, [entries, filters]);

 if (loading) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <Loader2 className="w-5 h-5 animate-spin text-primary/60"/>
 <p className="text-sm text-muted-foreground/60">Cargando entradas...</p>
 </div>
 );
 }

 if (entries.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
 <Clock className="w-7 h-7 text-primary/40"/>
 </div>
 <div className="text-center space-y-1">
 <p className="text-sm font-medium text-muted-foreground">
 No hay entradas para este día todavía.
 </p>
 <p className="text-xs text-muted-foreground">
 Sé el primero en registrar tu hora.
 </p>
 </div>
 </div>
 );
 }

 if (filteredEntries.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 bg-muted/50 flex items-center justify-center">
 <Search className="w-7 h-7 text-muted-foreground"/>
 </div>
 <p className="text-sm text-muted-foreground">
 No hay entradas que coincidan con los filtros.
 </p>
 </div>
 );
 }

 // Group by hour
 const byHour = new Map<number, EntryWithProfile[]>();
 for (const entry of filteredEntries) {
 const list = byHour.get(entry.hour) ?? [];
 list.push(entry);
 byHour.set(entry.hour, list);
 }

 return (
 <div className="space-y-3">
 {WORK_HOURS.slice()
 .reverse()
 .map((hour) => {
 const hourEntries = byHour.get(hour);
 if (!hourEntries) return null;
 return (
 <div key={hour} className="space-y-3">
 {hourEntries.map((entry) => (
 <TimeEntryCard key={entry.id} entry={entry} />
 ))}
 </div>
 );
 })}
 </div>
 );
}
