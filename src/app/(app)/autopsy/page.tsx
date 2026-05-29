"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import {
 Stethoscope,
 Star,
 SkipForward,
 Clock,
 TrendingUp,
 TrendingDown,
 Minus,
 ThumbsDown,
 Trophy,
 AlertTriangle,
 Send,
 Users,
 DollarSign,
} from "lucide-react";

interface MeetingEntry {
 id: string;
 user_id: string;
 title: string;
 date: string;
 hour: number;
 description: string | null;
 profile_name: string | null;
 profile_email: string;
}

interface MeetingRatingRow {
 id: string;
 entry_id: string;
 user_id: string;
 rating: number;
 would_skip: boolean;
 comment: string | null;
 created_at: string;
}

interface AggregatedMeeting {
 entry: MeetingEntry;
 ratings: MeetingRatingRow[];
 avgRating: number;
 wouldSkipPercent: number;
 userRating: MeetingRatingRow | null;
}

function StarRating({
 value,
 onChange,
 readonly = false,
 size ="md",
}: {
 value: number;
 onChange?: (v: number) => void;
 readonly?: boolean;
 size?:"sm"|"md";
}) {
 const [hover, setHover] = useState(0);
 const iconSize = size ==="sm"?"w-4 h-4":"w-6 h-6";

 return (
 <div className="flex items-center gap-0.5">
 {[1, 2, 3, 4, 5].map((star) => {
 const active = hover > 0 ? star <= hover : star <= value;
 const color =
 star <= 2
 ?"text-red-500": star === 3
 ?"text-yellow-500":"text-green-500";

 return (
 <button
 key={star}
 type="button"disabled={readonly}
 className={cn(
"transition-all duration-150",
 readonly ?"cursor-default":"cursor-pointer hover:scale-110",
 active ? color :"text-muted-foreground")}
 onMouseEnter={() => !readonly && setHover(star)}
 onMouseLeave={() => !readonly && setHover(0)}
 onClick={() => onChange?.(star)}
 >
 <Star
 className={cn(iconSize, active &&"fill-current")}
 />
 </button>
 );
 })}
 </div>
 );
}

function ratingColor(rating: number): string {
 if (rating <= 2) return"text-red-600";
 if (rating <= 3) return"text-yellow-600";
 return"text-green-600";
}

function ratingBg(rating: number): string {
 if (rating <= 2) return"bg-red-50 dark:bg-red-950/20";
 if (rating <= 3) return"bg-yellow-50 dark:bg-yellow-950/20";
 return"bg-green-50 dark:bg-green-950/20";
}

export default function AutopsyPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [meetings, setMeetings] = useState<AggregatedMeeting[]>([]);
 const [loading, setLoading] = useState(true);

 // Rating form state per entry
 const [ratingDraft, setRatingDraft] = useState<
 Map<string, { rating: number; wouldSkip: boolean; comment: string }>
 >(new Map());
 const [submitting, setSubmitting] = useState<Set<string>>(new Set());

 const thirtyDaysAgo = useMemo(
 () => format(subDays(startOfDay(new Date()), 30),"yyyy-MM-dd"),
 []
 );

 async function loadData() {
 if (!orgId || !userId) return;

 // Load meeting entries with profile info
 const { data: entries } = await supabase
 .from("time_entries")
 .select("id, user_id, title, date, hour, description, profiles:user_id(full_name, email)")
 .eq("org_id", orgId)
 .eq("category","meeting")
 .gte("date", thirtyDaysAgo)
 .order("date", { ascending: false })
 .order("hour", { ascending: false });

 if (!entries || entries.length === 0) {
 setMeetings([]);
 setLoading(false);
 return;
 }

 const entryIds = entries.map((e: any) => e.id);

 // Load all ratings for these entries
 const { data: ratings } = await supabase
 .from("meeting_ratings")
 .select("id, entry_id, user_id, rating, would_skip, comment, created_at")
 .in("entry_id", entryIds);

 const ratingsMap = new Map<string, MeetingRatingRow[]>();
 for (const r of ratings ?? []) {
 const list = ratingsMap.get(r.entry_id) ?? [];
 list.push(r as MeetingRatingRow);
 ratingsMap.set(r.entry_id, list);
 }

 const aggregated: AggregatedMeeting[] = entries.map((e: any) => {
 const entryRatings = ratingsMap.get(e.id) ?? [];
 const avgRating =
 entryRatings.length > 0
 ? entryRatings.reduce((s, r) => s + r.rating, 0) / entryRatings.length
 : 0;
 const wouldSkipPercent =
 entryRatings.length > 0
 ? (entryRatings.filter((r) => r.would_skip).length / entryRatings.length) * 100
 : 0;
 const userRating = entryRatings.find((r) => r.user_id === userId) ?? null;

 const profile = e.profiles as any;
 return {
 entry: {
 id: e.id,
 user_id: e.user_id,
 title: e.title,
 date: e.date,
 hour: e.hour,
 description: e.description,
 profile_name: profile?.full_name ?? null,
 profile_email: profile?.email ??"",
 },
 ratings: entryRatings,
 avgRating: Math.round(avgRating * 10) / 10,
 wouldSkipPercent: Math.round(wouldSkipPercent),
 userRating,
 };
 });

 setMeetings(aggregated);
 setLoading(false);
 }

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId || !userId) {
 setLoading(false);
 return;
 }
 loadData();
 }, [orgLoading, orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

 async function submitRating(entryId: string) {
 if (!orgId || !userId) return;
 const draft = ratingDraft.get(entryId);
 if (!draft || draft.rating === 0) return;

 setSubmitting((prev) => new Set(prev).add(entryId));

 await supabase.from("meeting_ratings").upsert(
 {
 entry_id: entryId,
 user_id: userId,
 org_id: orgId,
 rating: draft.rating,
 would_skip: draft.wouldSkip,
 comment: draft.comment.trim() || null,
 },
 { onConflict:"entry_id,user_id"}
 );

 // Clear draft and reload
 const newDraft = new Map(ratingDraft);
 newDraft.delete(entryId);
 setRatingDraft(newDraft);

 setSubmitting((prev) => {
 const next = new Set(prev);
 next.delete(entryId);
 return next;
 });

 await loadData();
 }

 function getDraft(entryId: string) {
 return ratingDraft.get(entryId) ?? { rating: 0, wouldSkip: false, comment:""};
 }

 function updateDraft(
 entryId: string,
 update: Partial<{ rating: number; wouldSkip: boolean; comment: string }>
 ) {
 const current = getDraft(entryId);
 const newDraft = new Map(ratingDraft);
 newDraft.set(entryId, { ...current, ...update });
 setRatingDraft(newDraft);
 }

 // ---- Computed stats ----
 const totalMeetingHours = meetings.length;
 const ratedMeetings = meetings.filter((m) => m.ratings.length > 0);
 const avgROI =
 ratedMeetings.length > 0
 ? Math.round(
 (ratedMeetings.reduce((s, m) => s + m.avgRating, 0) / ratedMeetings.length) * 10
 ) / 10
 : 0;
 const wouldSkipGlobal =
 ratedMeetings.length > 0
 ? Math.round(
 ratedMeetings.reduce((s, m) => s + m.wouldSkipPercent, 0) / ratedMeetings.length
 )
 : 0;

 // Worst meetings: rated, sorted by avg rating ascending
 const worstMeetings = useMemo(
 () =>
 [...ratedMeetings]
 .sort((a, b) => a.avgRating - b.avgRating)
 .slice(0, 5),
 [ratedMeetings] // eslint-disable-line react-hooks/exhaustive-deps
 );

 // Best meetings
 const bestMeetings = useMemo(
 () =>
 [...ratedMeetings]
 .sort((a, b) => b.avgRating - a.avgRating)
 .slice(0, 5),
 [ratedMeetings] // eslint-disable-line react-hooks/exhaustive-deps
 );

 // Trend: split meetings into first half vs second half of the 30 days
 const trend = useMemo(() => {
 if (ratedMeetings.length < 2) return { delta: 0, direction:"stable"as const };
 const midDate = format(subDays(startOfDay(new Date()), 15),"yyyy-MM-dd");
 const firstHalf = ratedMeetings.filter((m) => m.entry.date < midDate);
 const secondHalf = ratedMeetings.filter((m) => m.entry.date >= midDate);
 const avgFirst =
 firstHalf.length > 0
 ? firstHalf.reduce((s, m) => s + m.avgRating, 0) / firstHalf.length
 : 0;
 const avgSecond =
 secondHalf.length > 0
 ? secondHalf.reduce((s, m) => s + m.avgRating, 0) / secondHalf.length
 : 0;
 const delta = Math.round((avgSecond - avgFirst) * 10) / 10;
 return {
 delta,
 direction: delta > 0.2 ? ("improving"as const) : delta < -0.2 ? ("declining"as const) : ("stable"as const),
 };
 }, [ratedMeetings]); // eslint-disable-line react-hooks/exhaustive-deps

 // Unrated meetings for the current user
 const unratedMeetings = meetings.filter((m) => !m.userRating);

 if (loading) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 );
 }

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-2">
 <Stethoscope className="w-6 h-6 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">Autopsia de Reuniones</h1>
 </div>
 <p className="text-muted-foreground text-sm mb-8">
 Evalua cada reunion, descubre cuales valen la pena y cuales son tiempo perdido.
 </p>

 {/* Aggregate Stats */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
 <div className="bg-accent/40 p-4 flex flex-col gap-1">
 <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
 <Clock className="w-3.5 h-3.5"/>
 Horas en reuniones
 </div>
 <p className="text-2xl font-bold tabular-nums tracking-tight">{totalMeetingHours}h</p>
 <p className="text-[10px] text-muted-foreground">Ultimos 30 dias</p>
 </div>

 <div className="bg-accent/40 p-4 flex flex-col gap-1">
 <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
 <Star className="w-3.5 h-3.5"/>
 ROI promedio
 </div>
 <p className={cn("text-2xl font-bold tabular-nums tracking-tight", ratingColor(avgROI))}>
 {avgROI > 0 ? avgROI.toFixed(1) :"--"}
 </p>
 <p className="text-[10px] text-muted-foreground">
 {ratedMeetings.length} reunion{ratedMeetings.length !== 1 ?"es":""} calificada{ratedMeetings.length !== 1 ?"s":""}
 </p>
 </div>

 <div className="bg-accent/40 p-4 flex flex-col gap-1">
 <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
 <DollarSign className="w-3.5 h-3.5"/>
 Costo estimado
 </div>
 <p className="text-2xl font-bold tabular-nums tracking-tight">{totalMeetingHours}h</p>
 <p className="text-[10px] text-muted-foreground">Tiempo que no fue Deep Work</p>
 </div>

 <div className="bg-accent/40 p-4 flex flex-col gap-1">
 <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
 <SkipForward className="w-3.5 h-3.5"/>
 La saltarian
 </div>
 <p className={cn(
"text-2xl font-bold tabular-nums tracking-tight",
 wouldSkipGlobal > 40 ?"text-red-600": wouldSkipGlobal > 20 ?"text-yellow-600":"text-green-600")}>
 {wouldSkipGlobal > 0 ?`${wouldSkipGlobal}%`:"--"}
 </p>
 <p className="text-[10px] text-muted-foreground">De las reuniones calificadas</p>
 </div>
 </div>

 {/* Trend */}
 {ratedMeetings.length >= 2 && (
 <Card className="mb-8 transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4 flex items-center gap-3">
 {trend.direction ==="improving"? (
 <TrendingUp className="w-5 h-5 text-green-500 shrink-0"/>
 ) : trend.direction ==="declining"? (
 <TrendingDown className="w-5 h-5 text-red-500 shrink-0"/>
 ) : (
 <Minus className="w-5 h-5 text-muted-foreground shrink-0"/>
 )}
 <div>
 <p className="text-sm font-medium">
 {trend.direction ==="improving"?"Las reuniones estan mejorando": trend.direction ==="declining"?"Las reuniones estan empeorando":"Las reuniones se mantienen estables"}
 </p>
 <p className="text-xs text-muted-foreground">
 {trend.delta !== 0
 ?`${trend.delta > 0 ?"+":""}${trend.delta} puntos vs. las primeras 2 semanas`:"Sin cambio significativo entre las primeras y ultimas 2 semanas"}
 </p>
 </div>
 </CardContent>
 </Card>
 )}

 {/* Empty state */}
 {meetings.length === 0 && (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <Stethoscope className="w-8 h-8 text-primary"/>
 </div>
 <div className="text-center">
 <p className="font-medium">Sin reuniones registradas</p>
 <p className="text-sm text-muted-foreground mt-1">
 No hay entradas de reunion en los ultimos 30 dias.
 </p>
 </div>
 </div>
 )}

 {/* Worst Meetings */}
 {worstMeetings.length > 0 && (
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <ThumbsDown className="w-5 h-5 text-red-500"/>
 <h2 className="text-lg font-semibold">Peores Reuniones</h2>
 </div>
 <div className="space-y-2">
 {worstMeetings.map((m) => (
 <Card
 key={`worst-${m.entry.id}`}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4 flex items-center justify-between gap-4">
 <div className="min-w-0 flex-1">
 <p className="text-sm font-medium truncate">{m.entry.title}</p>
 <p className="text-xs text-muted-foreground">
 {m.entry.profile_name ?? m.entry.profile_email} &middot;{" "}
 {format(new Date(m.entry.date +"T12:00:00"),"d MMM", { locale: es })} &middot;{" "}
 {m.entry.hour}:00
 </p>
 </div>
 <div className="flex items-center gap-3 shrink-0">
 <StarRating value={Math.round(m.avgRating)} readonly size="sm"/>
 <span className={cn("text-sm font-bold tabular-nums", ratingColor(m.avgRating))}>
 {m.avgRating.toFixed(1)}
 </span>
 {m.wouldSkipPercent > 50 && (
 <Badge variant="destructive"className="text-[10px] gap-1">
 <SkipForward className="w-3 h-3"/>
 {m.wouldSkipPercent}% la saltarian
 </Badge>
 )}
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}

 {/* Best Meetings */}
 {bestMeetings.length > 0 && (
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <Trophy className="w-5 h-5 text-green-500"/>
 <h2 className="text-lg font-semibold">Mejores Reuniones</h2>
 </div>
 <div className="space-y-2">
 {bestMeetings.map((m) => (
 <Card
 key={`best-${m.entry.id}`}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4 flex items-center justify-between gap-4">
 <div className="min-w-0 flex-1">
 <p className="text-sm font-medium truncate">{m.entry.title}</p>
 <p className="text-xs text-muted-foreground">
 {m.entry.profile_name ?? m.entry.profile_email} &middot;{" "}
 {format(new Date(m.entry.date +"T12:00:00"),"d MMM", { locale: es })} &middot;{" "}
 {m.entry.hour}:00
 </p>
 </div>
 <div className="flex items-center gap-3 shrink-0">
 <StarRating value={Math.round(m.avgRating)} readonly size="sm"/>
 <span className={cn("text-sm font-bold tabular-nums", ratingColor(m.avgRating))}>
 {m.avgRating.toFixed(1)}
 </span>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}

 {/* Unrated Meetings */}
 {unratedMeetings.length > 0 && (
 <div className="mb-8">
 <div className="flex items-center gap-2 mb-4">
 <AlertTriangle className="w-5 h-5 text-yellow-500"/>
 <h2 className="text-lg font-semibold">Pendientes de calificar</h2>
 <Badge variant="secondary"className="text-[10px]">
 {unratedMeetings.length}
 </Badge>
 </div>
 <div className="space-y-3">
 {unratedMeetings.map((m) => {
 const draft = getDraft(m.entry.id);
 const isSending = submitting.has(m.entry.id);

 return (
 <Card
 key={`unrated-${m.entry.id}`}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4 space-y-3">
 {/* Entry info */}
 <div className="flex items-start justify-between gap-4">
 <div className="min-w-0">
 <p className="text-sm font-medium">{m.entry.title}</p>
 <p className="text-xs text-muted-foreground">
 {m.entry.profile_name ?? m.entry.profile_email} &middot;{" "}
 {format(new Date(m.entry.date +"T12:00:00"),"d MMM", { locale: es })} &middot;{" "}
 {m.entry.hour}:00
 </p>
 {m.entry.description && (
 <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
 {m.entry.description}
 </p>
 )}
 </div>
 {m.ratings.length > 0 && (
 <div className="text-right shrink-0">
 <div className="flex items-center gap-1">
 <Users className="w-3 h-3 text-muted-foreground"/>
 <span className="text-xs text-muted-foreground">
 {m.ratings.length} voto{m.ratings.length !== 1 ?"s":""}
 </span>
 </div>
 <span className={cn("text-sm font-bold tabular-nums", ratingColor(m.avgRating))}>
 {m.avgRating.toFixed(1)}
 </span>
 </div>
 )}
 </div>

 {/* Rating form */}
 <div className="border-t pt-3 space-y-3">
 <div className="flex items-center justify-between">
 <p className="text-xs font-medium text-muted-foreground">
 Tu calificacion de ROI
 </p>
 <StarRating
 value={draft.rating}
 onChange={(v) => updateDraft(m.entry.id, { rating: v })}
 />
 </div>

 {/* Would skip toggle */}
 <button
 type="button"onClick={() =>
 updateDraft(m.entry.id, { wouldSkip: !draft.wouldSkip })
 }
 className={cn(
"w-full flex items-center justify-between px-4 py-3 border-2 transition-all duration-200",
 draft.wouldSkip
 ?"border-red-500 bg-red-50 dark:bg-red-950/20":"border-border bg-muted/30 hover:bg-muted/50")}
 >
 <div className="flex items-center gap-2">
 <SkipForward
 className={cn(
"w-4 h-4",
 draft.wouldSkip ?"text-red-500":"text-muted-foreground")}
 />
 <span
 className={cn(
"text-sm font-medium",
 draft.wouldSkip ?"text-red-700 dark:text-red-400":"text-muted-foreground")}
 >
 La saltarias?
 </span>
 </div>
 <div
 className={cn(
"w-10 h-6 rounded-full transition-colors flex items-center px-1",
 draft.wouldSkip ?"bg-red-500 justify-end":"bg-muted-foreground/20 justify-start")}
 >
 <div className="w-4 h-4 rounded-full bg-white"/>
 </div>
 </button>

 {/* Comment */}
 <Textarea
 placeholder="Comentario opcional..."value={draft.comment}
 onChange={(e) =>
 updateDraft(m.entry.id, { comment: e.target.value })
 }
 className="text-sm min-h-[60px]"/>

 {/* Submit */}
 <Button
 onClick={() => submitRating(m.entry.id)}
 disabled={draft.rating === 0 || isSending}
 className="w-full gap-2">
 <Send className="w-4 h-4"/>
 {isSending ?"Enviando...":"Calificar reunion"}
 </Button>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 )}

 {/* Already rated meetings */}
 {meetings.filter((m) => m.userRating).length > 0 && (
 <div className="mb-8">
 <h2 className="text-lg font-semibold mb-4">Ya calificadas</h2>
 <div className="space-y-2">
 {meetings
 .filter((m) => m.userRating)
 .map((m) => (
 <Card
 key={`rated-${m.entry.id}`}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4 flex items-center justify-between gap-4">
 <div className="min-w-0 flex-1">
 <p className="text-sm font-medium truncate">{m.entry.title}</p>
 <p className="text-xs text-muted-foreground">
 {m.entry.profile_name ?? m.entry.profile_email} &middot;{" "}
 {format(new Date(m.entry.date +"T12:00:00"),"d MMM", { locale: es })} &middot;{" "}
 {m.entry.hour}:00
 </p>
 {m.userRating?.comment && (
 <p className="text-xs text-muted-foreground mt-1 italic">
 &ldquo;{m.userRating.comment}&rdquo;
 </p>
 )}
 </div>
 <div className="flex items-center gap-3 shrink-0">
 <StarRating value={m.userRating!.rating} readonly size="sm"/>
 {m.userRating!.would_skip && (
 <Badge variant="destructive"className="text-[10px] gap-1">
 <SkipForward className="w-3 h-3"/>
 Saltable
 </Badge>
 )}
 {m.ratings.length > 1 && (
 <span className={cn("text-xs tabular-nums", ratingColor(m.avgRating))}>
 Equipo: {m.avgRating.toFixed(1)}
 </span>
 )}
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 )}
 </div>
 );
}
