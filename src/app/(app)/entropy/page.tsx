"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import type { WorkCategory, Profile } from "@/lib/types/database";
import { subDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Waves, Zap, Focus, Crown, Flame } from "lucide-react";

// ---------------------------------------------------------------------------
// Entropy label helpers
// ---------------------------------------------------------------------------

interface EntropyLabel {
 text: string;
 color: string;
 bgColor: string;
 barColor: string;
}

function getEntropyLabel(e: number): EntropyLabel {
 if (e <= 0.2) return { text:"Zen", color:"text-green-600", bgColor:"bg-green-100 dark:bg-green-900/40", barColor:"bg-green-500"};
 if (e <= 0.4) return { text:"Enfocado", color:"text-blue-600", bgColor:"bg-blue-100 dark:bg-blue-900/40", barColor:"bg-blue-500"};
 if (e <= 0.6) return { text:"Variable", color:"text-yellow-600", bgColor:"bg-yellow-100 dark:bg-yellow-900/40", barColor:"bg-yellow-500"};
 if (e <= 0.8) return { text:"Caótico", color:"text-orange-600", bgColor:"bg-orange-100 dark:bg-orange-900/40", barColor:"bg-orange-500"};
 return { text:"Puro Caos", color:"text-red-600", bgColor:"bg-red-100 dark:bg-red-900/40", barColor:"bg-red-500"};
}

function getBarColor(e: number): string {
 if (e <= 0.2) return"bg-green-500";
 if (e <= 0.4) return"bg-blue-500";
 if (e <= 0.6) return"bg-yellow-500";
 if (e <= 0.8) return"bg-orange-500";
 return"bg-red-500";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DayEntropy {
 date: string;
 entropy: number;
 entries: number;
}

interface MemberEntropy {
 profile: Profile;
 todayEntropy: number | null;
 todaySequence: WorkCategory[];
 days: DayEntropy[];
 avg14: number;
}

// ---------------------------------------------------------------------------
// Entropy calculation
// ---------------------------------------------------------------------------

function calculateEntropy(categories: WorkCategory[]): number {
 if (categories.length <= 1) return 0;
 let transitions = 0;
 for (let i = 1; i < categories.length; i++) {
 if (categories[i] !== categories[i - 1]) transitions++;
 }
 return transitions / (categories.length - 1);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EntropyPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const supabase = createClient();
 const [members, setMembers] = useState<MemberEntropy[]>([]);
 const [loading, setLoading] = useState(true);

 const today = new Date().toISOString().split("T")[0];

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId) { setLoading(false); return; }

 async function load() {
 const startDate = subDays(new Date(), 13).toISOString().split("T")[0];

 // Fetch team members
 const { data: orgMembers } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId!);

 if (!orgMembers || orgMembers.length === 0) {
 setLoading(false);
 return;
 }

 // Fetch time entries for last 14 days
 const { data: entries } = await supabase
 .from("time_entries")
 .select("user_id, date, hour, category")
 .eq("org_id", orgId!)
 .gte("date", startDate)
 .lte("date", today)
 .order("hour", { ascending: true });

 if (!entries) {
 setLoading(false);
 return;
 }

 // Build a map: userId -> date -> sorted categories
 const userDateMap = new Map<string, Map<string, WorkCategory[]>>();
 for (const e of entries) {
 const userMap = userDateMap.get(e.user_id) ?? new Map<string, WorkCategory[]>();
 const dayCats = userMap.get(e.date) ?? [];
 dayCats.push(e.category as WorkCategory);
 userMap.set(e.date, dayCats);
 userDateMap.set(e.user_id, userMap);
 }

 // Generate all 14 dates
 const allDates: string[] = [];
 for (let i = 13; i >= 0; i--) {
 allDates.push(subDays(new Date(), i).toISOString().split("T")[0]);
 }

 // Calculate entropy per member per day
 const result: MemberEntropy[] = orgMembers.map((m) => {
 const profile = m.profiles as unknown as Profile;
 const userMap = userDateMap.get(m.user_id);

 const days: DayEntropy[] = allDates.map((date) => {
 const cats = userMap?.get(date) ?? [];
 return {
 date,
 entropy: cats.length > 1 ? calculateEntropy(cats) : 0,
 entries: cats.length,
 };
 });

 const todayCats = userMap?.get(today) ?? [];
 const todayEntropy = todayCats.length > 1 ? calculateEntropy(todayCats) : todayCats.length === 1 ? 0 : null;

 // Average entropy over days that have entries
 const daysWithEntries = days.filter((d) => d.entries > 1);
 const avg14 = daysWithEntries.length > 0
 ? daysWithEntries.reduce((sum, d) => sum + d.entropy, 0) / daysWithEntries.length
 : 0;

 return {
 profile,
 todayEntropy,
 todaySequence: todayCats,
 days,
 avg14,
 };
 });

 // Sort by today's entropy descending (null last)
 result.sort((a, b) => {
 if (a.todayEntropy === null && b.todayEntropy === null) return 0;
 if (a.todayEntropy === null) return 1;
 if (b.todayEntropy === null) return -1;
 return b.todayEntropy - a.todayEntropy;
 });

 setMembers(result);
 setLoading(false);
 }
 load();
 }, [orgLoading, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Derived stats
 const membersWithData = members.filter((m) => m.todayEntropy !== null);
 const teamAvgToday = membersWithData.length > 0
 ? membersWithData.reduce((sum, m) => sum + (m.todayEntropy ?? 0), 0) / membersWithData.length
 : null;

 const mostFocused = membersWithData.length > 0
 ? membersWithData.reduce((best, m) => (m.todayEntropy ?? 1) < (best.todayEntropy ?? 1) ? m : best)
 : null;

 const mostChaotic = membersWithData.length > 0
 ? membersWithData.reduce((best, m) => (m.todayEntropy ?? 0) > (best.todayEntropy ?? 0) ? m : best)
 : null;

 if (loading || orgLoading) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 );
 }

 if (!orgId) {
 return (
 <div className="flex items-center justify-center py-24">
 <p className="text-muted-foreground">Primero crea o únete a un equipo.</p>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-2">
 <Waves className="w-6 h-6 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">Entropía</h1>
 </div>
 <p className="text-muted-foreground text-sm mb-8">
 Mide qué tan caótico o enfocado es el día de cada persona según los cambios de categoría.
 </p>

 {/* Team summary */}
 {membersWithData.length > 0 && (
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
 {/* Team average */}
 <div className="bg-accent/40 p-4">
 <p className="text-xs text-muted-foreground mb-1">Promedio del equipo hoy</p>
 {teamAvgToday !== null ? (
 <>
 <p className={cn("text-2xl font-bold tabular-nums tracking-tight", getEntropyLabel(teamAvgToday).color)}>
 {(teamAvgToday * 100).toFixed(0)}%
 </p>
 <Badge variant="secondary"className={cn("mt-1 text-[10px]", getEntropyLabel(teamAvgToday).bgColor, getEntropyLabel(teamAvgToday).color)}>
 {getEntropyLabel(teamAvgToday).text}
 </Badge>
 </>
 ) : (
 <p className="text-lg text-muted-foreground">--</p>
 )}
 </div>

 {/* Most focused */}
 {mostFocused && (
 <div className="bg-accent/40 p-4">
 <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
 <Focus className="w-3 h-3"/>
 Más Enfocado
 </p>
 <p className="font-semibold truncate">
 {mostFocused.profile.full_name ?? mostFocused.profile.email}
 </p>
 <Badge variant="secondary"className="mt-1 text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
 <Crown className="w-3 h-3 mr-0.5"/>
 {((mostFocused.todayEntropy ?? 0) * 100).toFixed(0)}% entropía
 </Badge>
 </div>
 )}

 {/* Most chaotic */}
 {mostChaotic && (
 <div className="bg-accent/40 p-4">
 <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
 <Flame className="w-3 h-3"/>
 Más Caótico
 </p>
 <p className="font-semibold truncate">
 {mostChaotic.profile.full_name ?? mostChaotic.profile.email}
 </p>
 <Badge variant="secondary"className="mt-1 text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
 <Zap className="w-3 h-3 mr-0.5"/>
 {((mostChaotic.todayEntropy ?? 0) * 100).toFixed(0)}% entropía
 </Badge>
 </div>
 )}
 </div>
 )}

 {/* Member cards */}
 {members.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <Waves className="w-7 h-7 text-primary/40"/>
 </div>
 <p className="text-sm text-muted-foreground">No hay datos de entradas en los últimos 14 días.</p>
 </div>
 ) : (
 <div className="space-y-4">
 {members.map((m) => {
 const label = m.todayEntropy !== null ? getEntropyLabel(m.todayEntropy) : null;

 return (
 <Card key={m.profile.id} className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4 sm:p-5">
 {/* Top row: avatar, name, today score */}
 <div className="flex items-center gap-4 mb-4">
 <Avatar className="w-10 h-10 ring-2 ring-background">
 <AvatarImage src={m.profile.avatar_url ?? undefined} />
 <AvatarFallback>{getInitials(m.profile.full_name)}</AvatarFallback>
 </Avatar>

 <div className="flex-1 min-w-0">
 <h3 className="font-semibold truncate">
 {m.profile.full_name ?? m.profile.email}
 </h3>
 <p className="text-xs text-muted-foreground">
 Promedio 14d:{" "}
 <span className={cn("font-medium", getEntropyLabel(m.avg14).color)}>
 {(m.avg14 * 100).toFixed(0)}%
 </span>
 {" "}&middot;{" "}
 {getEntropyLabel(m.avg14).text}
 </p>
 </div>

 {/* Today's score */}
 <div className="text-right min-w-[80px]">
 {m.todayEntropy !== null && label ? (
 <>
 <p className={cn("text-2xl font-bold tabular-nums tracking-tight", label.color)}>
 {(m.todayEntropy * 100).toFixed(0)}%
 </p>
 <Badge variant="secondary"className={cn("text-[10px]", label.bgColor, label.color)}>
 {label.text}
 </Badge>
 </>
 ) : (
 <p className="text-lg text-muted-foreground">--</p>
 )}
 </div>
 </div>

 {/* Waveform: 14-day bar chart */}
 <div className="mb-4">
 <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-medium">
 Entropía últimos 14 días
 </p>
 <div className="flex items-end gap-[3px] h-12">
 {m.days.map((d) => {
 const heightPercent = d.entries > 1 ? Math.max(d.entropy * 100, 4) : 0;
 const barColor = d.entries > 1 ? getBarColor(d.entropy) :"bg-muted";
 const dateLabel = format(new Date(d.date +"T12:00:00"),"d MMM", { locale: es });
 const isToday = d.date === today;

 return (
 <div
 key={d.date}
 className="flex-1 flex flex-col items-center justify-end h-full"title={`${dateLabel}: ${d.entries > 1 ? (d.entropy * 100).toFixed(0) +"%":"sin datos"} (${d.entries} entradas)`}
 >
 <div
 className={cn(
"w-full rounded-t transition-all",
 barColor,
 isToday &&"ring-1 ring-foreground/30",
 d.entries <= 1 &&"opacity-20")}
 style={{ height: d.entries > 1 ?`${heightPercent}%`:"4%"}}
 />
 </div>
 );
 })}
 </div>
 <div className="flex justify-between mt-1">
 <span className="text-[9px] text-muted-foreground">
 {format(new Date(m.days[0].date +"T12:00:00"),"d MMM", { locale: es })}
 </span>
 <span className="text-[9px] text-muted-foreground">Hoy</span>
 </div>
 </div>

 {/* DNA strand: today's hour-by-hour category sequence */}
 {m.todaySequence.length > 0 && (
 <div>
 <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-medium">
 Secuencia de hoy
 </p>
 <div className="flex gap-[2px]">
 {m.todaySequence.map((cat, i) => {
 const catConfig = CATEGORIES[cat];
 const bgClass = CATEGORY_COLORS[cat] ??"bg-gray-400";
 return (
 <div
 key={i}
 className={cn("h-6 flex-1 rounded-sm transition-all", bgClass)}
 title={`${catConfig?.emoji ??""} ${catConfig?.label ?? cat}`}
 />
 );
 })}
 </div>
 <div className="flex gap-[2px] mt-1">
 {m.todaySequence.map((cat, i) => {
 const catConfig = CATEGORIES[cat];
 return (
 <div
 key={i}
 className="flex-1 text-center">
 <span className="text-[9px]"title={catConfig?.label ?? cat}>
 {catConfig?.emoji ??""}
 </span>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {m.todaySequence.length === 0 && (
 <p className="text-xs text-muted-foreground italic">Sin entradas registradas hoy</p>
 )}
 </CardContent>
 </Card>
 );
 })}
 </div>
 )}

 {/* Legend */}
 <div className="mt-8 p-4 bg-accent/40">
 <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Escala de entropía</p>
 <div className="flex flex-wrap gap-3">
 {[
 { range:"0-20%", label:"Zen", color:"bg-green-500"},
 { range:"20-40%", label:"Enfocado", color:"bg-blue-500"},
 { range:"40-60%", label:"Variable", color:"bg-yellow-500"},
 { range:"60-80%", label:"Caótico", color:"bg-orange-500"},
 { range:"80-100%", label:"Puro Caos", color:"bg-red-500"},
 ].map((item) => (
 <div key={item.label} className="flex items-center gap-1.5">
 <div className={cn("w-3 h-3 rounded-sm", item.color)} />
 <span className="text-[11px] text-muted-foreground">
 {item.range} {item.label}
 </span>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}
