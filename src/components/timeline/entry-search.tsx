"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials, formatHour } from "@/lib/utils";
import { Search, X, Loader2 } from "lucide-react";

type EntryWithProfile = TimeEntry & { profiles: Profile };

export function EntrySearch({ orgId }: { orgId: string }) {
 const [query, setQuery] = useState("");
 const [results, setResults] = useState<EntryWithProfile[]>([]);
 const [searching, setSearching] = useState(false);
 const [hasSearched, setHasSearched] = useState(false);
 const supabase = createClient();

 const search = useCallback(
 async (q: string) => {
 if (q.trim().length < 2) {
 setResults([]);
 setHasSearched(false);
 return;
 }

 setSearching(true);
 setHasSearched(true);

 const { data } = await supabase
 .from("time_entries")
 .select("*, profiles(*)")
 .eq("org_id", orgId)
 .or(`title.ilike.%${q}%,description.ilike.%${q}%,project.ilike.%${q}%`)
 .order("date", { ascending: false })
 .order("hour", { ascending: false })
 .limit(20)
 ;

 setResults(data ?? []);
 setSearching(false);
 },
 [orgId] // eslint-disable-line react-hooks/exhaustive-deps
 );

 let debounceTimer: ReturnType<typeof setTimeout>;
 function handleChange(value: string) {
 setQuery(value);
 clearTimeout(debounceTimer);
 debounceTimer = setTimeout(() => search(value), 300);
 }

 function clear() {
 setQuery("");
 setResults([]);
 setHasSearched(false);
 }

 return (
 <div className="mb-6">
 <div className="relative">
 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
 <Input
 value={query}
 onChange={(e) => handleChange(e.target.value)}
 placeholder="Buscar entradas por titulo, descripcion o proyecto..."className="pl-10 pr-10 h-10 bg-accent/30 border-border/50 focus-visible:bg-background"/>
 {query && (
 <button
 onClick={clear}
 className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
 <X className="w-4 h-4"/>
 </button>
 )}
 </div>

 {searching && (
 <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
 <Loader2 className="w-3.5 h-3.5 animate-spin text-primary/60"/>
 Buscando...
 </div>
 )}

 {hasSearched && !searching && results.length === 0 && (
 <p className="text-sm text-muted-foreground/70 mt-3">
 Sin resultados para &quot;{query}&quot;
 </p>
 )}

 {results.length > 0 && (
 <div className="mt-3 border border-border/50 divide-y divide-border/30 max-h-80 overflow-y-auto bg-card">
 {results.map((entry) => {
 const cat = CATEGORIES[entry.category];
 return (
 <div
 key={entry.id}
 className="p-3.5 hover:bg-accent/30 transition-colors first:rounded-t-2xl last:rounded-b-2xl">
 <div className="flex items-center gap-2.5">
 {entry.profiles && (
 <Avatar className="w-6 h-6 ring-1 ring-background">
 <AvatarImage src={entry.profiles.avatar_url ?? undefined} />
 <AvatarFallback className="text-[8px] font-semibold">
 {getInitials(entry.profiles.full_name)}
 </AvatarFallback>
 </Avatar>
 )}
 <span className="text-sm font-semibold flex-1 truncate">
 {entry.title}
 </span>
 <Badge
 variant="secondary"className={cn("text-[10px] font-semibold", cat.color, cat.bgColor)}
 >
 {cat.emoji} {cat.label}
 </Badge>
 </div>
 <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground/60 font-medium">
 <span>{entry.profiles?.full_name}</span>
 <span className="text-muted-foreground">|</span>
 <span className="tabular-nums">{entry.date}</span>
 <span className="tabular-nums">{formatHour(entry.hour)}</span>
 {entry.project && (
 <>
 <span className="text-muted-foreground">|</span>
 <Badge variant="outline"className="text-[10px] py-0 rounded-md">
 {entry.project}
 </Badge>
 </>
 )}
 </div>
 {entry.description && (
 <p className="text-xs text-muted-foreground/60 mt-1.5 line-clamp-1">
 {entry.description}
 </p>
 )}
 </div>
 );
 })}
 </div>
 )}
 </div>
 );
}
