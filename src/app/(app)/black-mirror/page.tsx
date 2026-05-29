"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { TimeEntry } from "@/lib/types/database";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
 Skull,
 DollarSign,
 Clock,
 AlertTriangle,
 XCircle,
 CalendarOff,
 Eye,
 Loader2,
 Brain,
} from "lucide-react";
import { subDays, differenceInCalendarDays, isWeekend } from "date-fns";

interface BlackMirrorData {
 entries: TimeEntry[];
 promises: Array<{ status: string }>;
 suspiciousCount: number;
 closeoutDates: Set<string>;
 entryDates: Set<string>;
}

function countWorkdays(start: Date, end: Date): number {
 let count = 0;
 const current = new Date(start);
 while (current <= end) {
 if (!isWeekend(current)) count++;
 current.setDate(current.getDate() + 1);
 }
 return count;
}

export default function BlackMirrorPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [data, setData] = useState<BlackMirrorData | null>(null);
 const [loading, setLoading] = useState(true);
 const [hardTruth, setHardTruth] = useState<string | null>(null);
 const [loadingTruth, setLoadingTruth] = useState(false);
 const supabase = createClient();

 useEffect(() => {
 if (!orgId || !userId) return;

 async function load() {
 setLoading(true);
 const today = new Date();
 const thirtyDaysAgo = subDays(today, 30);
 const todayStr = today.toISOString().split("T")[0];
 const startStr = thirtyDaysAgo.toISOString().split("T")[0];

 const [
 { data: entries },
 { data: promises },
 { data: closeouts },
 { data: allEntryReactions },
 ] = await Promise.all([
 supabase
 .from("time_entries")
 .select("*")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr)
 .lte("date", todayStr)
 .order("date", { ascending: true }),
 supabase
 .from("daily_promises")
 .select("status")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr),
 supabase
 .from("daily_closeouts")
 .select("date")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr),
 supabase
 .from("time_entries")
 .select("id")
 .eq("user_id", userId!)
 .eq("org_id", orgId!)
 .gte("date", startStr),
 ]);

 const entryIds = (allEntryReactions ?? []).map((e) => e.id);
 let suspiciousCount = 0;
 if (entryIds.length > 0) {
 const { count } = await supabase
 .from("entry_reactions")
 .select("*", { count:"exact", head: true })
 .in("entry_id", entryIds)
 .eq("reaction","suspicious");
 suspiciousCount = count ?? 0;
 }

 const closeoutDates = new Set<string>((closeouts ?? []).map((c) => c.date as string));
 const entryDates = new Set<string>((entries ?? []).map((e) => e.date as string));

 setData({
 entries: entries ?? [],
 promises: promises ?? [],
 suspiciousCount,
 closeoutDates,
 entryDates,
 });
 setLoading(false);
 }
 load();
 }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Ask Claude for hard truth
 useEffect(() => {
 if (!orgId || !userId || !data) return;
 setLoadingTruth(true);
 fetch("/api/claude-brain", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({
 mode:"ask",
 org_id: orgId,
 question:
"Analiza los peores patrones de este usuario en los últimos 30 días. No suavices nada. Dame exactamente 2 oraciones que sean la verdad más incómoda y directa sobre su desempeño. No uses emojis. No seas motivacional. Solo la verdad dura.",
 user_id: userId,
 }),
 })
 .then((r) => r.json())
 .then((json) => {
 const text =
 typeof json.response ==="string"? json.response
 : json.raw ??"No se pudo generar la verdad.";
 setHardTruth(text);
 })
 .catch(() => setHardTruth("Error al consultar a Claude."))
 .finally(() => setLoadingTruth(false));
 }, [orgId, userId, data]);

 const computed = useMemo(() => {
 if (!data) return null;

 const today = new Date();
 const thirtyDaysAgo = subDays(today, 30);
 const workdays = countWorkdays(thirtyDaysAgo, today);

 // Wasted categories: blocked, break, admin
 const wastedEntries = data.entries.filter(
 (e) =>
 e.category ==="blocked"||
 e.category ==="break"||
 e.category ==="admin");
 const wastedHours = wastedEntries.length;
 const moneyWasted = wastedHours * 50;

 // Promises broken
 const brokenPromises = data.promises.filter(
 (p) => p.status ==="broken").length;

 // Late entries
 const lateEntries = data.entries.filter((e) => e.is_late).length;
 const latePercent =
 data.entries.length > 0
 ? Math.round((lateEntries / data.entries.length) * 100)
 : 0;

 // Worst day: lowest hours logged in a single workday that had entries
 const dayHours = new Map<string, number>();
 for (const e of data.entries) {
 dayHours.set(e.date, (dayHours.get(e.date) ?? 0) + 1);
 }
 let worstDay = { date:"N/A", hours: Infinity };
 for (const [date, hours] of dayHours) {
 if (hours < worstDay.hours) {
 worstDay = { date, hours };
 }
 }
 if (worstDay.hours === Infinity) {
 worstDay = { date:"N/A", hours: 0 };
 }

 // Longest gap without registering (calendar days between entries)
 const sortedDates = [...data.entryDates].sort();
 let longestGap = 0;
 for (let i = 1; i < sortedDates.length; i++) {
 const gap = differenceInCalendarDays(
 new Date(sortedDates[i] +"T12:00:00"),
 new Date(sortedDates[i - 1] +"T12:00:00")
 );
 if (gap > longestGap) longestGap = gap;
 }
 // Also consider gap from start to first entry and last entry to now
 if (sortedDates.length > 0) {
 const gapFromStart = differenceInCalendarDays(
 new Date(sortedDates[0] +"T12:00:00"),
 thirtyDaysAgo
 );
 const gapToEnd = differenceInCalendarDays(
 today,
 new Date(sortedDates[sortedDates.length - 1] +"T12:00:00")
 );
 if (gapFromStart > longestGap) longestGap = gapFromStart;
 if (gapToEnd > longestGap) longestGap = gapToEnd;
 } else {
 longestGap = 30;
 }

 return {
 wastedHours,
 moneyWasted,
 brokenPromises,
 latePercent,
 lateEntries,
 worstDay,
 longestGap,
 suspiciousCount: data.suspiciousCount,
 totalEntries: data.entries.length,
 workdays,
 };
 }, [data]);

 if (orgLoading || loading || !computed) {
 return (
 <div className="min-h-screen bg-black">
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-900 animate-pulse"/>
 <p className="text-sm text-red-400/70 animate-pulse">Cargando...</p>
 </div>
 </div>
 </div>
 );
 }

 return (
 <div className="min-h-screen bg-black text-white">
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-2">
 <Skull className="w-7 h-7 text-red-500"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase text-white">
 El Espejo Negro
 </h1>
 </div>
 <p className="text-red-400/60 text-sm mb-10">
 Solo tus peores estadísticas. Sin positivos. Sin excusas.
 </p>

 {/* Hard truth from Claude */}
 <Card className="mb-8 bg-red-950/30 border-red-900/50">
 <CardContent className="p-6">
 <div className="flex items-start gap-3">
 <Brain className="w-5 h-5 text-red-500 mt-0.5 shrink-0"/>
 <div>
 <p className="text-xs text-red-500/70 font-medium uppercase tracking-wider mb-2">
 La verdad dura
 </p>
 {loadingTruth ? (
 <div className="flex items-center gap-2">
 <Loader2 className="w-4 h-4 text-red-400 animate-spin"/>
 <p className="text-sm text-red-300/50">
 Claude está analizando tus patrones...
 </p>
 </div>
 ) : (
 <p className="text-sm text-red-100/90 leading-relaxed">
 {hardTruth}
 </p>
 )}
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Stats grid */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
 {/* Wasted hours */}
 <Card className="bg-zinc-950 border-red-900/30 hover:border-red-700/50 transition-all duration-300">
 <CardContent className="p-6">
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-red-900/30 flex items-center justify-center shrink-0">
 <Clock className="w-6 h-6 text-red-500"/>
 </div>
 <div>
 <p className="text-xs text-red-400/50 font-medium uppercase tracking-wider">
 Horas desperdiciadas
 </p>
 <p className="text-4xl font-black tabular-nums text-red-500 mt-1">
 {computed.wastedHours}h
 </p>
 <p className="text-xs text-zinc-500 mt-1">
 Bloqueado + descansos + admin en 30 días
 </p>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Money wasted */}
 <Card className="bg-zinc-950 border-red-900/30 hover:border-red-700/50 transition-all duration-300">
 <CardContent className="p-6">
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-red-900/30 flex items-center justify-center shrink-0">
 <DollarSign className="w-6 h-6 text-red-500"/>
 </div>
 <div>
 <p className="text-xs text-red-400/50 font-medium uppercase tracking-wider">
 Dinero tirado
 </p>
 <p className="text-4xl font-black tabular-nums text-red-500 mt-1">
 ${computed.moneyWasted.toLocaleString("es-MX")}
 </p>
 <p className="text-xs text-zinc-500 mt-1">
 {computed.wastedHours}h x $50/hr
 </p>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Promises broken */}
 <Card className="bg-zinc-950 border-red-900/30 hover:border-red-700/50 transition-all duration-300">
 <CardContent className="p-6">
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-red-900/30 flex items-center justify-center shrink-0">
 <XCircle className="w-6 h-6 text-red-500"/>
 </div>
 <div>
 <p className="text-xs text-red-400/50 font-medium uppercase tracking-wider">
 Promesas rotas
 </p>
 <p className="text-4xl font-black tabular-nums text-red-500 mt-1">
 {computed.brokenPromises}
 </p>
 <p className="text-xs text-zinc-500 mt-1">
 Compromisos que no cumpliste
 </p>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Late entries */}
 <Card className="bg-zinc-950 border-red-900/30 hover:border-red-700/50 transition-all duration-300">
 <CardContent className="p-6">
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-red-900/30 flex items-center justify-center shrink-0">
 <AlertTriangle className="w-6 h-6 text-red-500"/>
 </div>
 <div>
 <p className="text-xs text-red-400/50 font-medium uppercase tracking-wider">
 Entradas tardías
 </p>
 <p className="text-4xl font-black tabular-nums text-red-500 mt-1">
 {computed.latePercent}%
 </p>
 <p className="text-xs text-zinc-500 mt-1">
 {computed.lateEntries} de {computed.totalEntries} entradas
 fueron tarde
 </p>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Worst day */}
 <Card className="bg-zinc-950 border-red-900/30 hover:border-red-700/50 transition-all duration-300">
 <CardContent className="p-6">
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-red-900/30 flex items-center justify-center shrink-0">
 <CalendarOff className="w-6 h-6 text-red-500"/>
 </div>
 <div>
 <p className="text-xs text-red-400/50 font-medium uppercase tracking-wider">
 Peor día
 </p>
 <p className="text-4xl font-black tabular-nums text-red-500 mt-1">
 {computed.worstDay.hours}h
 </p>
 <p className="text-xs text-zinc-500 mt-1">
 {computed.worstDay.date !=="N/A"? computed.worstDay.date
 :"Sin datos"}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Longest gap */}
 <Card className="bg-zinc-950 border-red-900/30 hover:border-red-700/50 transition-all duration-300">
 <CardContent className="p-6">
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-red-900/30 flex items-center justify-center shrink-0">
 <CalendarOff className="w-6 h-6 text-red-500"/>
 </div>
 <div>
 <p className="text-xs text-red-400/50 font-medium uppercase tracking-wider">
 Mayor brecha sin registrar
 </p>
 <p className="text-4xl font-black tabular-nums text-red-500 mt-1">
 {computed.longestGap} días
 </p>
 <p className="text-xs text-zinc-500 mt-1">
 Desapareciste del mapa
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Suspicious flag */}
 <Card className="bg-zinc-950 border-red-900/30 hover:border-red-700/50 transition-all duration-300 mb-8">
 <CardContent className="p-6">
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 bg-red-900/30 flex items-center justify-center shrink-0">
 <Eye className="w-6 h-6 text-red-500"/>
 </div>
 <div>
 <p className="text-xs text-red-400/50 font-medium uppercase tracking-wider">
 Marcado como sospechoso
 </p>
 <p className="text-4xl font-black tabular-nums text-red-500 mt-1">
 {computed.suspiciousCount} veces
 </p>
 <p className="text-xs text-zinc-500 mt-1">
 Tus compañeros no confían en esas entradas
 </p>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Bottom reminder */}
 <div className="text-center py-8 border-t border-red-900/20">
 <p className="text-xs text-red-500/30 uppercase tracking-widest">
 Nadie te obliga a mejorar. Pero los datos no mienten.
 </p>
 </div>
 </div>
 </div>
 );
}
