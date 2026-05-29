"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import type { WorkCategory } from "@/lib/types/database";
import { CATEGORIES, REACTIONS, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { cn, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
 ArrowLeft,
 ChevronLeft,
 ChevronRight,
 Shield,
 Clock,
 Flame,
 Star,
 X,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

type EntryWithProfile = TimeEntry & { profiles: Profile };

interface UserStory {
 profile: Profile;
 entries: TimeEntry[];
 totalHours: number;
 proofPercent: number;
 lateCount: number;
 trustScore: number;
 streak: number;
 seen: boolean;
}

// ────────────────────────────────────────────────────────────────
// Gradient map per category
// ────────────────────────────────────────────────────────────────

const CATEGORY_GRADIENT: Record<string, string> = {
 deep_work:"from-violet-900 via-violet-800 to-indigo-900",
 meeting:"from-blue-900 via-blue-800 to-sky-900",
 review:"from-amber-900 via-amber-800 to-yellow-900",
 admin:"from-slate-800 via-slate-700 to-gray-800",
 planning:"from-emerald-900 via-emerald-800 to-teal-900",
 learning:"from-pink-900 via-pink-800 to-rose-900",
 break:"from-green-900 via-green-800 to-emerald-900",
 blocked:"from-red-900 via-red-800 to-rose-900",
};

const SLIDE_DURATION = 5000; // 5 seconds

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function formatHourDisplay(hour: number): string {
 const suffix = hour >= 12 ?"PM":"AM";
 const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
 return`${display}:00 ${suffix}`;
}

function renderStars(value: number | null, max = 5): React.ReactNode {
 if (value === null) return null;
 return (
 <span className="inline-flex gap-0.5">
 {Array.from({ length: max }, (_, i) => (
 <Star
 key={i}
 className={cn(
"w-3.5 h-3.5",
 i < value
 ?"fill-yellow-400 text-yellow-400":"text-white/20")}
 />
 ))}
 </span>
 );
}

// ────────────────────────────────────────────────────────────────
// Component: ProgressBars
// ────────────────────────────────────────────────────────────────

function ProgressBars({
 total,
 current,
 progress,
}: {
 total: number;
 current: number;
 progress: number; // 0-1 for the current segment
}) {
 return (
 <div className="flex gap-1 px-4 pt-3 pb-1">
 {Array.from({ length: total }, (_, i) => (
 <div
 key={i}
 className="flex-1 h-[3px] rounded-full bg-white/20 overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-100",
 i < current
 ?"bg-white w-full": i === current
 ?"bg-white":"w-0")}
 style={
 i === current
 ? { width:`${Math.min(progress * 100, 100)}%`}
 : undefined
 }
 />
 </div>
 ))}
 </div>
 );
}

// ────────────────────────────────────────────────────────────────
// Component: EntrySlide
// ────────────────────────────────────────────────────────────────

function EntrySlide({ entry }: { entry: TimeEntry }) {
 const cat = CATEGORIES[entry.category as WorkCategory];
 const gradient = CATEGORY_GRADIENT[entry.category] ?? CATEGORY_GRADIENT.admin;
 const hasProof =
 entry.proof_urls != null && (entry.proof_urls as string[]).length > 0;

 return (
 <div
 className={cn(
"absolute inset-0 flex flex-col justify-center items-center",
"bg-gradient-to-br",
 gradient,
"text-white px-8 py-16")}
 >
 {/* Proof checkmark overlay */}
 {hasProof && (
 <div className="absolute top-20 right-6 flex items-center gap-1.5 bg-green-500/20 backdrop-blur-sm border border-green-400/30 rounded-full px-3 py-1.5">
 <Shield className="w-4 h-4 text-green-400"/>
 <span className="text-xs font-semibold text-green-300">
 Verificado
 </span>
 </div>
 )}

 {/* Late stamp */}
 {entry.is_late && (
 <div
 className="absolute top-24 left-6 bg-red-600/80 backdrop-blur-sm border border-red-500/50 px-4 py-1.5"style={{ transform:"rotate(-15deg)"}}
 >
 <span className="text-sm font-black tracking-wider text-white uppercase">
 Tardía
 </span>
 {entry.minutes_late > 0 && (
 <span className="text-xs font-semibold text-red-200 ml-2">
 +{entry.minutes_late}min
 </span>
 )}
 </div>
 )}

 {/* Time */}
 <div className="absolute top-16 right-6">
 <div className="flex items-center gap-1.5 text-white/60 text-sm font-medium">
 <Clock className="w-4 h-4"/>
 {formatHourDisplay(entry.hour)}
 </div>
 </div>

 {/* Large emoji */}
 <div className="text-7xl mb-6 drop-">{cat.emoji}</div>

 {/* Title */}
 <h2 className="text-2xl sm:text-3xl font-bold text-center leading-tight mb-3 max-w-md">
 {entry.title}
 </h2>

 {/* Description */}
 {entry.description && (
 <p className="text-base text-white/70 text-center max-w-sm leading-relaxed mb-5">
 {entry.description}
 </p>
 )}

 {/* Category badge */}
 <Badge
 className={cn(
"mb-4 border-0 text-sm font-semibold px-4 py-1.5 rounded-full",
"bg-white/10 text-white/90 backdrop-blur-sm")}
 >
 {cat.emoji} {cat.label}
 </Badge>

 {/* Project */}
 {entry.project && (
 <Badge
 className="mb-4 border border-white/20 bg-white/5 text-white/80 rounded-full px-3 py-1">
 📁 {entry.project}
 </Badge>
 )}

 {/* Proof links */}
 {hasProof && (
 <div className="flex flex-wrap gap-2 justify-center mb-4 max-w-sm">
 {(entry.proof_urls as string[]).map((url, i) => (
 <a
 key={i}
 href={url}
 target="_blank"rel="noopener noreferrer"className="inline-flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 text-white/80 px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm">
 🔗 Evidencia {i + 1}
 </a>
 ))}
 </div>
 )}

 {/* Mood / Energy */}
 <div className="flex items-center gap-6 mt-2">
 {entry.mood !== null && (
 <div className="flex flex-col items-center gap-1">
 <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
 Ánimo
 </span>
 {renderStars(entry.mood)}
 </div>
 )}
 {entry.energy !== null && (
 <div className="flex flex-col items-center gap-1">
 <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
 Energía
 </span>
 {renderStars(entry.energy)}
 </div>
 )}
 </div>
 </div>
 );
}

// ────────────────────────────────────────────────────────────────
// Component: SummarySlide
// ────────────────────────────────────────────────────────────────

function SummarySlide({
 story,
 onReact,
}: {
 story: UserStory;
 onReact: (reaction: string) => void;
}) {
 return (
 <div className="absolute inset-0 flex flex-col justify-center items-center bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white px-8 py-16">
 {/* Avatar */}
 <Avatar className="w-20 h-20 ring-4 ring-white/20 shadow-2xl mb-4">
 <AvatarImage src={story.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-blue-500 to-violet-600 text-white">
 {getInitials(story.profile.full_name)}
 </AvatarFallback>
 </Avatar>

 <h2 className="text-xl font-bold mb-1">
 {story.profile.full_name ??"Sin nombre"}
 </h2>
 <p className="text-sm text-white/50 mb-8">Resumen del día</p>

 {/* Stats grid */}
 <div className="grid grid-cols-2 gap-4 w-full max-w-xs mb-8">
 <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 text-center">
 <Clock className="w-5 h-5 mx-auto mb-1.5 text-blue-400"/>
 <p className="text-2xl font-bold tabular-nums">{story.totalHours}</p>
 <p className="text-[11px] text-white/50 mt-0.5">Horas</p>
 </div>
 <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 text-center">
 <Shield className="w-5 h-5 mx-auto mb-1.5 text-green-400"/>
 <p className="text-2xl font-bold tabular-nums">
 {story.proofPercent}%
 </p>
 <p className="text-[11px] text-white/50 mt-0.5">Con evidencia</p>
 </div>
 <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 text-center">
 <Flame className="w-5 h-5 mx-auto mb-1.5 text-orange-400"/>
 <p className="text-2xl font-bold tabular-nums">{story.streak}</p>
 <p className="text-[11px] text-white/50 mt-0.5">Racha</p>
 </div>
 <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-4 text-center">
 <Star className="w-5 h-5 mx-auto mb-1.5 text-yellow-400"/>
 <p className="text-2xl font-bold tabular-nums">
 {story.trustScore}
 </p>
 <p className="text-[11px] text-white/50 mt-0.5">Trust Score</p>
 </div>
 </div>

 {/* Late count */}
 {story.lateCount > 0 && (
 <div className="flex items-center gap-2 mb-6 text-red-400 text-sm">
 <Clock className="w-4 h-4"/>
 <span>
 {story.lateCount} entrada{story.lateCount !== 1 ?"s":""} tardía
 {story.lateCount !== 1 ?"s":""}
 </span>
 </div>
 )}

 {/* React buttons */}
 <div className="w-full max-w-xs">
 <p className="text-xs text-white/40 text-center uppercase tracking-wider font-semibold mb-3">
 Reaccionar
 </p>
 <div className="flex justify-center gap-3">
 {Object.entries(REACTIONS).map(([key, r]) => (
 <button
 key={key}
 onClick={(e) => {
 e.stopPropagation();
 onReact(key);
 }}
 className="flex flex-col items-center gap-1 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/30 px-4 py-3 transition-all duration-200 active:scale-95"title={r.description}
 >
 <span className="text-xl">{r.emoji}</span>
 <span className="text-[9px] text-white/50 font-medium">
 {r.label}
 </span>
 </button>
 ))}
 </div>
 </div>
 </div>
 );
}

// ────────────────────────────────────────────────────────────────
// Component: StorySelector
// ────────────────────────────────────────────────────────────────

function StorySelector({
 stories,
 currentIndex,
 onSelect,
}: {
 stories: UserStory[];
 currentIndex: number;
 onSelect: (index: number) => void;
}) {
 const scrollRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
 if (!scrollRef.current) return;
 const child = scrollRef.current.children[currentIndex] as HTMLElement;
 if (child) {
 child.scrollIntoView({
 behavior:"smooth",
 block:"nearest",
 inline:"center",
 });
 }
 }, [currentIndex]);

 return (
 <div className="absolute bottom-0 left-0 right-0 z-30 pb-6 pt-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
 <div
 ref={scrollRef}
 className="flex gap-3 overflow-x-auto px-6 scrollbar-hide justify-center"style={{ scrollbarWidth:"none"}}
 >
 {stories.map((story, i) => (
 <button
 key={story.profile.id}
 onClick={(e) => {
 e.stopPropagation();
 onSelect(i);
 }}
 className={cn(
"flex flex-col items-center gap-1.5 shrink-0 transition-all duration-200",
 i === currentIndex ?"scale-110":"opacity-60 hover:opacity-90")}
 >
 <div
 className={cn(
"rounded-full p-[3px] transition-all duration-300",
 i === currentIndex
 ?"bg-gradient-to-tr from-yellow-400 via-pink-500 to-violet-600": story.seen
 ?"bg-white/20":"bg-gradient-to-tr from-blue-400 via-cyan-400 to-green-400")}
 >
 <Avatar className="w-12 h-12 ring-2 ring-black">
 <AvatarImage src={story.profile.avatar_url ?? undefined} />
 <AvatarFallback className="text-[10px] font-bold bg-gray-800 text-white">
 {getInitials(story.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 </div>
 <span
 className={cn(
"text-[10px] font-medium max-w-[56px] truncate",
 i === currentIndex ?"text-white":"text-white/50")}
 >
 {story.profile.full_name?.split("")[0] ??"?"}
 </span>
 </button>
 ))}
 </div>
 </div>
 );
}

// ────────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────────

export default function StoriesPage() {
 const supabase = createClient();
 const router = useRouter();

 // State
 const [orgId, setOrgId] = useState<string | null>(null);
 const [stories, setStories] = useState<UserStory[]>([]);
 const [loading, setLoading] = useState(true);
 const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
 const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
 const [slideProgress, setSlideProgress] = useState(0);
 const [paused, setPaused] = useState(false);

 // Refs for timers
 const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
 null
 );
 const slideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const startTimeRef = useRef<number>(0);
 const elapsedBeforePauseRef = useRef<number>(0);

 // ──────────────────────────────────────────────────────────────
 // Load org
 // ──────────────────────────────────────────────────────────────

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
 .single();

 if (membership) setOrgId(membership.org_id);
 }
 loadOrg();
 }, []); // eslint-disable-line react-hooks/exhaustive-deps

 // ──────────────────────────────────────────────────────────────
 // Load data
 // ──────────────────────────────────────────────────────────────

 useEffect(() => {
 if (!orgId) return;

 async function loadStories() {
 setLoading(true);

 const today = new Intl.DateTimeFormat("en-CA", {
 timeZone:"America/Monterrey",
 }).format(new Date());

 const [membersRes, entriesRes, streaksRes, trustRes] = await Promise.all([
 supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId),
 supabase
 .from("time_entries")
 .select("*, profiles(*)")
 .eq("org_id", orgId)
 .eq("date", today)
 .order("hour", { ascending: true }),
 supabase
 .from("activity_streaks")
 .select("user_id, current_streak")
 .eq("org_id", orgId),
 supabase
 .from("trust_score_history")
 .select("user_id, score")
 .eq("org_id", orgId)
 .eq("date", today),
 ]);

 const members = membersRes.data ?? [];
 const entries = (entriesRes.data ?? []) as EntryWithProfile[];
 const streaks = streaksRes.data ?? [];
 const trustScores = trustRes.data ?? [];

 // Build maps
 const streakMap = new Map<string, number>();
 for (const s of streaks) {
 streakMap.set(s.user_id, s.current_streak);
 }

 const trustMap = new Map<string, number>();
 for (const t of trustScores) {
 trustMap.set(t.user_id, t.score);
 }

 // Group entries by user
 const entryMap = new Map<string, TimeEntry[]>();
 for (const e of entries) {
 const existing = entryMap.get(e.user_id) ?? [];
 existing.push(e);
 entryMap.set(e.user_id, existing);
 }

 // Build stories (only for users who have entries)
 const userStories: UserStory[] = members
 .filter((m) => {
 const userEntries = entryMap.get(m.user_id);
 return userEntries && userEntries.length > 0;
 })
 .map((m) => {
 const userEntries = entryMap.get(m.user_id) ?? [];
 const withProof = userEntries.filter(
 (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
 );
 const lateOnes = userEntries.filter((e) => e.is_late);
 const totalHours = userEntries.length;
 const proofPercent =
 totalHours > 0
 ? Math.round((withProof.length / totalHours) * 100)
 : 0;

 // Compute trust score if not found in history
 let trustScore = trustMap.get(m.user_id) ?? -1;
 if (trustScore < 0) {
 const hoursRatio = Math.min(totalHours / EXPECTED_DAILY_HOURS, 1);
 const proofRatio = proofPercent / 100;
 const lateRatio =
 totalHours > 0 ? lateOnes.length / totalHours : 0;
 const raw =
 hoursRatio * 0.4 + proofRatio * 0.4 - lateRatio * 0.2;
 trustScore = Math.max(0, Math.min(100, Math.round(raw * 100)));
 }

 return {
 profile: m.profiles as unknown as Profile,
 entries: userEntries,
 totalHours,
 proofPercent,
 lateCount: lateOnes.length,
 trustScore,
 streak: streakMap.get(m.user_id) ?? 0,
 seen: false,
 };
 })
 .sort((a, b) => b.totalHours - a.totalHours);

 setStories(userStories);
 setCurrentStoryIndex(0);
 setCurrentSlideIndex(0);
 setSlideProgress(0);
 setLoading(false);
 }

 loadStories();
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 // ──────────────────────────────────────────────────────────────
 // Current story / slide helpers
 // ──────────────────────────────────────────────────────────────

 const currentStory = stories[currentStoryIndex] ?? null;
 // Total slides = entries + 1 summary slide
 const totalSlides = currentStory
 ? currentStory.entries.length + 1
 : 0;
 const isSummarySlide =
 currentStory != null && currentSlideIndex >= currentStory.entries.length;
 const currentEntry =
 currentStory && !isSummarySlide
 ? currentStory.entries[currentSlideIndex]
 : null;

 // ──────────────────────────────────────────────────────────────
 // Navigation
 // ──────────────────────────────────────────────────────────────

 const goToNextSlide = useCallback(() => {
 if (!currentStory) return;

 if (currentSlideIndex < totalSlides - 1) {
 setCurrentSlideIndex((prev) => prev + 1);
 setSlideProgress(0);
 elapsedBeforePauseRef.current = 0;
 } else {
 // Mark current story as seen
 setStories((prev) =>
 prev.map((s, i) =>
 i === currentStoryIndex ? { ...s, seen: true } : s
 )
 );
 // Next person
 if (currentStoryIndex < stories.length - 1) {
 setCurrentStoryIndex((prev) => prev + 1);
 setCurrentSlideIndex(0);
 setSlideProgress(0);
 elapsedBeforePauseRef.current = 0;
 }
 }
 }, [currentStory, currentSlideIndex, totalSlides, currentStoryIndex, stories.length]);

 const goToPrevSlide = useCallback(() => {
 if (currentSlideIndex > 0) {
 setCurrentSlideIndex((prev) => prev - 1);
 setSlideProgress(0);
 elapsedBeforePauseRef.current = 0;
 } else if (currentStoryIndex > 0) {
 setCurrentStoryIndex((prev) => prev - 1);
 setCurrentSlideIndex(0);
 setSlideProgress(0);
 elapsedBeforePauseRef.current = 0;
 }
 }, [currentSlideIndex, currentStoryIndex]);

 const goToStory = useCallback(
 (index: number) => {
 if (index >= 0 && index < stories.length) {
 setCurrentStoryIndex(index);
 setCurrentSlideIndex(0);
 setSlideProgress(0);
 elapsedBeforePauseRef.current = 0;
 }
 },
 [stories.length]
 );

 // ──────────────────────────────────────────────────────────────
 // Auto-advance timer
 // ──────────────────────────────────────────────────────────────

 useEffect(() => {
 if (loading || stories.length === 0 || paused) {
 if (progressIntervalRef.current) {
 clearInterval(progressIntervalRef.current);
 progressIntervalRef.current = null;
 }
 if (slideTimerRef.current) {
 clearTimeout(slideTimerRef.current);
 slideTimerRef.current = null;
 }
 return;
 }

 const remaining = SLIDE_DURATION - elapsedBeforePauseRef.current;
 startTimeRef.current = Date.now();

 // Progress bar update
 progressIntervalRef.current = setInterval(() => {
 const elapsed =
 elapsedBeforePauseRef.current +
 (Date.now() - startTimeRef.current);
 setSlideProgress(Math.min(elapsed / SLIDE_DURATION, 1));
 }, 50);

 // Auto-advance
 slideTimerRef.current = setTimeout(() => {
 elapsedBeforePauseRef.current = 0;
 goToNextSlide();
 }, remaining);

 return () => {
 if (progressIntervalRef.current) {
 clearInterval(progressIntervalRef.current);
 progressIntervalRef.current = null;
 }
 if (slideTimerRef.current) {
 clearTimeout(slideTimerRef.current);
 slideTimerRef.current = null;
 }
 };
 }, [
 loading,
 stories.length,
 paused,
 currentStoryIndex,
 currentSlideIndex,
 goToNextSlide,
 ]);

 // ──────────────────────────────────────────────────────────────
 // Keyboard navigation
 // ──────────────────────────────────────────────────────────────

 useEffect(() => {
 function handleKey(e: KeyboardEvent) {
 if (e.key ==="ArrowRight"|| e.key ==="") {
 e.preventDefault();
 elapsedBeforePauseRef.current = 0;
 goToNextSlide();
 } else if (e.key ==="ArrowLeft") {
 e.preventDefault();
 goToPrevSlide();
 } else if (e.key ==="ArrowDown") {
 e.preventDefault();
 // Next person
 if (currentStoryIndex < stories.length - 1) {
 goToStory(currentStoryIndex + 1);
 }
 } else if (e.key ==="ArrowUp") {
 e.preventDefault();
 // Previous person
 if (currentStoryIndex > 0) {
 goToStory(currentStoryIndex - 1);
 }
 } else if (e.key ==="Escape") {
 router.back();
 }
 }

 window.addEventListener("keydown", handleKey);
 return () => window.removeEventListener("keydown", handleKey);
 }, [goToNextSlide, goToPrevSlide, goToStory, currentStoryIndex, stories.length, router]);

 // ──────────────────────────────────────────────────────────────
 // Touch/click handlers
 // ──────────────────────────────────────────────────────────────

 const handlePointerDown = useCallback(
 (e: React.PointerEvent<HTMLDivElement>) => {
 // Ignore clicks on interactive elements
 const target = e.target as HTMLElement;
 if (
 target.closest("a") ||
 target.closest("button") ||
 target.closest("[role='button']")
 ) {
 return;
 }

 // Start hold-to-pause
 holdTimerRef.current = setTimeout(() => {
 elapsedBeforePauseRef.current +=
 Date.now() - startTimeRef.current;
 setPaused(true);
 }, 200);
 },
 []
 );

 const handlePointerUp = useCallback(
 (e: React.PointerEvent<HTMLDivElement>) => {
 const target = e.target as HTMLElement;
 if (
 target.closest("a") ||
 target.closest("button") ||
 target.closest("[role='button']")
 ) {
 return;
 }

 if (holdTimerRef.current) {
 clearTimeout(holdTimerRef.current);
 holdTimerRef.current = null;
 }

 if (paused) {
 // Resume
 setPaused(false);
 return;
 }

 // Tap navigation: left 40% = prev, right 60% = next
 const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
 const x = e.clientX - rect.left;
 const threshold = rect.width * 0.4;

 elapsedBeforePauseRef.current = 0;
 if (x < threshold) {
 goToPrevSlide();
 } else {
 goToNextSlide();
 }
 },
 [paused, goToPrevSlide, goToNextSlide]
 );

 const handlePointerLeave = useCallback(() => {
 if (holdTimerRef.current) {
 clearTimeout(holdTimerRef.current);
 holdTimerRef.current = null;
 }
 if (paused) {
 setPaused(false);
 }
 }, [paused]);

 // ──────────────────────────────────────────────────────────────
 // Reaction handler
 // ──────────────────────────────────────────────────────────────

 const handleReact = useCallback(
 async (reaction: string) => {
 if (!currentStory) return;
 // React to the latest entry of this person
 const lastEntry =
 currentStory.entries[currentStory.entries.length - 1];
 if (!lastEntry) return;

 const {
 data: { user },
 } = await supabase.auth.getUser();
 if (!user) return;

 await supabase.from("entry_reactions").upsert(
 {
 entry_id: lastEntry.id,
 user_id: user.id,
 reaction,
 },
 { onConflict:"entry_id,user_id"}
 );
 },
 [currentStory, supabase]
 );

 // ──────────────────────────────────────────────────────────────
 // Loading state
 // ──────────────────────────────────────────────────────────────

 if (loading || !orgId) {
 return (
 <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
 <div className="flex flex-col items-center gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-white/60 animate-pulse">
 Cargando historias...
 </p>
 </div>
 </div>
 );
 }

 // ──────────────────────────────────────────────────────────────
 // Empty state
 // ──────────────────────────────────────────────────────────────

 if (stories.length === 0) {
 return (
 <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-6">
 <div className="w-16 h-16 bg-white/5 flex items-center justify-center">
 <Flame className="w-7 h-7 text-white/30"/>
 </div>
 <div className="text-center">
 <h2 className="text-lg font-bold text-white mb-2">
 Sin historias hoy
 </h2>
 <p className="text-sm text-white/50 max-w-xs">
 Nadie ha registrado entradas hoy. Las historias aparecerán cuando el
 equipo empiece a trabajar.
 </p>
 </div>
 <button
 onClick={() => router.back()}
 className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors mt-4">
 <ArrowLeft className="w-4 h-4"/>
 Volver
 </button>
 </div>
 );
 }

 // ──────────────────────────────────────────────────────────────
 // Main render
 // ──────────────────────────────────────────────────────────────

 return (
 <div
 className="fixed inset-0 z-50 bg-black select-none overflow-hidden"onPointerDown={handlePointerDown}
 onPointerUp={handlePointerUp}
 onPointerLeave={handlePointerLeave}
 >
 {/* Story content area */}
 <div className="relative w-full h-full max-w-lg mx-auto">
 {/* Slide content */}
 {currentStory && !isSummarySlide && currentEntry && (
 <EntrySlide entry={currentEntry} />
 )}

 {currentStory && isSummarySlide && (
 <SummarySlide story={currentStory} onReact={handleReact} />
 )}

 {/* Progress bars overlay */}
 {currentStory && (
 <div className="absolute top-0 left-0 right-0 z-20">
 <ProgressBars
 total={totalSlides}
 current={currentSlideIndex}
 progress={slideProgress}
 />

 {/* Header: avatar + name + close */}
 <div className="flex items-center justify-between px-4 pt-2 pb-1">
 <div className="flex items-center gap-2.5">
 <Avatar className="w-8 h-8 ring-2 ring-white/20">
 <AvatarImage
 src={currentStory.profile.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-[10px] font-bold bg-gray-700 text-white">
 {getInitials(currentStory.profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <div className="flex flex-col">
 <span className="text-white text-sm font-semibold leading-tight">
 {currentStory.profile.full_name ??"Sin nombre"}
 </span>
 <span className="text-white/40 text-[10px] font-medium">
 {currentStory.entries.length} entrada
 {currentStory.entries.length !== 1 ?"s":""} hoy
 {currentStory.streak > 0 && (
 <span className="ml-1.5">
 -- {currentStory.streak}d
 </span>
 )}
 </span>
 </div>
 </div>

 {/* Close / back */}
 <button
 onClick={(e) => {
 e.stopPropagation();
 router.back();
 }}
 className="p-2 rounded-full hover:bg-white/10 transition-colors">
 <X className="w-5 h-5 text-white/70"/>
 </button>
 </div>
 </div>
 )}

 {/* Navigation hint arrows */}
 <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
 <ChevronLeft className="w-8 h-8 text-white/10"/>
 </div>
 <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
 <ChevronRight className="w-8 h-8 text-white/10"/>
 </div>

 {/* Pause indicator */}
 {paused && (
 <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
 <div className="bg-black/40 backdrop-blur-sm px-6 py-3">
 <span className="text-white/80 text-sm font-semibold">
 En pausa
 </span>
 </div>
 </div>
 )}
 </div>

 {/* Story selector at bottom */}
 <StorySelector
 stories={stories}
 currentIndex={currentStoryIndex}
 onSelect={goToStory}
 />

 {/* Back button */}
 <button
 onClick={(e) => {
 e.stopPropagation();
 router.back();
 }}
 className="absolute top-4 left-4 z-40 flex items-center gap-1.5 text-white/50 hover:text-white text-sm font-medium transition-colors bg-black/30 hover:bg-black/50 backdrop-blur-sm px-3 py-2">
 <ArrowLeft className="w-4 h-4"/>
 Volver
 </button>
 </div>
 );
}
