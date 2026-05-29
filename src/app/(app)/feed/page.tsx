"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type {
  Profile,
  TimeEntry,
  ReactionType,
  EntryReaction,
  LiveStatus,
  LiveStatusType,
} from "@/lib/types/database";
import {
  CATEGORIES,
  REACTIONS,
  LIVE_STATUS_CONFIG,
  MOOD_LABELS,
  ENERGY_LABELS,
} from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  MessageCircle,
  Plus,
  Shield,
  Clock,
  Check,
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  ExternalLink,
  FolderKanban,
  Send,
  Rss,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntryWithProfile = TimeEntry & { profiles: Profile };

interface FeedReaction {
  entry_id: string;
  reaction: ReactionType;
  user_id: string;
}

interface FeedComment {
  id: string;
  entry_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: Profile;
}

type MemberStatus = LiveStatus & { profiles: Profile };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const STATUS_RING_COLORS: Record<LiveStatusType, string> = {
  online: "ring-green-500",
  idle: "ring-yellow-500",
  in_meeting: "ring-blue-500",
  deep_work: "ring-violet-500",
  break: "ring-green-400",
  offline: "ring-gray-400",
};

// ---------------------------------------------------------------------------
// Helper: isWeekend
// ---------------------------------------------------------------------------

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

// ---------------------------------------------------------------------------
// Component: StoriesBar
// ---------------------------------------------------------------------------

function StoriesBar({
  members,
  statuses,
  todayEntries,
  onSelect,
}: {
  members: Profile[];
  statuses: MemberStatus[];
  todayEntries: Map<string, EntryWithProfile[]>;
  onSelect: (member: Profile) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const statusMap = new Map(statuses.map((s) => [s.user_id, s.status]));

  function scroll(dir: "left" | "right") {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  }

  return (
    <div className="relative mb-6">
      <button
        onClick={() => scroll("left")}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/90 border border-border/50 shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
        aria-label="Desplazar izquierda"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide px-8 py-2"
      >
        {members.map((member) => {
          const status = statusMap.get(member.id) ?? "offline";
          const ringColor = STATUS_RING_COLORS[status];
          const entries = todayEntries.get(member.id) ?? [];
          const hasNoEntries = entries.length === 0;

          return (
            <button
              key={member.id}
              onClick={() => onSelect(member)}
              className="flex flex-col items-center gap-1.5 shrink-0 group"
            >
              <div
                className={cn(
                  "relative rounded-full p-[3px]",
                  hasNoEntries
                    ? "bg-gradient-to-br from-red-400 to-red-600"
                    : "bg-gradient-to-br from-primary/60 to-primary"
                )}
              >
                <Avatar
                  className={cn(
                    "w-[52px] h-[52px] ring-2 ring-background",
                    !hasNoEntries && ringColor
                  )}
                >
                  <AvatarImage src={member.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/30">
                    {getInitials(member.full_name)}
                  </AvatarFallback>
                </Avatar>
                {/* Status dot */}
                <span
                  className={cn(
                    "absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-background",
                    LIVE_STATUS_CONFIG[status].dotColor
                  )}
                />
              </div>
              <span className="text-[10px] text-muted-foreground truncate max-w-[60px] group-hover:text-foreground transition-colors">
                {member.full_name?.split(" ")[0] ?? "?"}
              </span>
              {hasNoEntries && (
                <span className="text-[8px] font-semibold text-red-500">
                  sin registro
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => scroll("right")}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/90 border border-border/50 shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
        aria-label="Desplazar derecha"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component: StoriesPopup
// ---------------------------------------------------------------------------

function StoriesPopup({
  member,
  entries,
  onClose,
}: {
  member: Profile;
  entries: EntryWithProfile[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const latest = entries.slice(0, 3);

  if (latest.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-card rounded-2xl p-8 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
          <Avatar className="w-16 h-16 mx-auto mb-4 ring-2 ring-background shadow-sm">
            <AvatarImage src={member.avatar_url ?? undefined} />
            <AvatarFallback className="text-lg">{getInitials(member.full_name)}</AvatarFallback>
          </Avatar>
          <p className="font-semibold">{member.full_name}</p>
          <p className="text-sm text-muted-foreground mt-2">Sin registros hoy</p>
          <Button variant="ghost" size="sm" onClick={onClose} className="mt-4 rounded-xl">
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  const entry = latest[idx];
  const cat = CATEGORIES[entry.category];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="flex gap-1 px-3 pt-3">
          {latest.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-all duration-300",
                  i < idx ? "w-full" : i === idx ? "w-full animate-pulse" : "w-0"
                )}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 p-4 pb-2">
          <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
            <AvatarImage src={member.avatar_url ?? undefined} />
            <AvatarFallback className="text-[10px]">{getInitials(member.full_name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{member.full_name}</p>
            <p className="text-[10px] text-muted-foreground">
              hace {timeAgo(entry.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 pb-4 space-y-3">
          <Badge variant="secondary" className={cn("text-xs", cat.color, cat.bgColor)}>
            {cat.emoji} {cat.label}
          </Badge>
          <p className="text-lg font-bold leading-snug">{entry.title}</p>
          {entry.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{entry.description}</p>
          )}
          {entry.project && (
            <Badge variant="outline" className="text-[10px] gap-1 rounded-lg font-medium">
              <FolderKanban className="w-3 h-3" />
              {entry.project}
            </Badge>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-4 pb-4">
          <Button
            variant="ghost"
            size="sm"
            disabled={idx === 0}
            onClick={() => setIdx((p) => Math.max(0, p - 1))}
            className="rounded-xl"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Anterior
          </Button>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {idx + 1}/{latest.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={idx === latest.length - 1}
            onClick={() => setIdx((p) => Math.min(latest.length - 1, p + 1))}
            className="rounded-xl"
          >
            Siguiente
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component: InlineReactions
// ---------------------------------------------------------------------------

function InlineReactions({
  entryId,
  reactions,
  myReaction,
  onReact,
}: {
  entryId: string;
  reactions: FeedReaction[];
  myReaction: ReactionType | null;
  onReact: (entryId: string, reaction: ReactionType) => void;
}) {
  const counts = new Map<ReactionType, number>();
  for (const r of reactions) {
    counts.set(r.reaction, (counts.get(r.reaction) ?? 0) + 1);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {(Object.keys(REACTIONS) as ReactionType[]).map((type) => {
        const config = REACTIONS[type];
        const count = counts.get(type) ?? 0;
        const isActive = myReaction === type;

        return (
          <button
            key={type}
            onClick={() => onReact(entryId, type)}
            title={config.description}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-200",
              isActive
                ? type === "suspicious"
                  ? "bg-red-50 border border-red-200/60 dark:bg-red-950/20 dark:border-red-800/40 shadow-sm"
                  : "bg-primary/5 border border-primary/20 shadow-sm"
                : "border border-transparent hover:bg-accent/50 hover:border-border/30"
            )}
          >
            <span className="text-sm">{config.emoji}</span>
            <span className="hidden sm:inline text-[11px]">{config.label}</span>
            {count > 0 && (
              <span
                className={cn(
                  "font-semibold tabular-nums text-[11px]",
                  isActive ? "text-foreground" : "text-muted-foreground/70"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component: InlineComments
// ---------------------------------------------------------------------------

function InlineComments({ entryId }: { entryId: string }) {
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [count, setCount] = useState(0);
  const supabase = createClient();

  // Load count on mount
  useEffect(() => {
    async function loadCount() {
      const { count: c } = await supabase
        .from("entry_comments")
        .select("*", { count: "exact", head: true })
        .eq("entry_id", entryId);
      setCount(c ?? 0);
    }
    loadCount();
  }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load full comments when expanded
  useEffect(() => {
    if (!expanded) return;

    async function loadComments() {
      const { data } = await supabase
        .from("entry_comments")
        .select("*, profiles(*)")
        .eq("entry_id", entryId)
        .order("created_at", { ascending: true });
      setComments((data as FeedComment[]) ?? []);
    }
    loadComments();

    const channel = supabase
      .channel(`feed_comments_${entryId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "entry_comments",
          filter: `entry_id=eq.${entryId}`,
        },
        () => loadComments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [expanded, entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!newComment.trim()) return;
    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      return;
    }

    await supabase.from("entry_comments").insert({
      entry_id: entryId,
      user_id: user.id,
      content: newComment.trim(),
    });

    setNewComment("");
    setSubmitting(false);
    setCount((p) => p + 1);
  }

  return (
    <div className="mt-3">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {count > 0 ? (
            <span>
              Ver {count} comentario{count !== 1 ? "s" : ""}
            </span>
          ) : (
            <span>Comentar</span>
          )}
        </button>
      ) : (
        <div className="space-y-2.5 pt-2 border-t border-border/50">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Avatar className="w-6 h-6 mt-0.5 ring-2 ring-background shadow-sm">
                <AvatarImage src={c.profiles?.avatar_url ?? undefined} />
                <AvatarFallback className="text-[8px]">
                  {getInitials(c.profiles?.full_name ?? null)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">
                    {c.profiles?.full_name ?? c.profiles?.email}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    hace {timeAgo(c.created_at)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {c.content}
                </p>
              </div>
            </div>
          ))}

          {/* Inline input like Instagram */}
          <div className="flex gap-2 items-end">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escribe un comentario..."
              rows={1}
              className="text-xs min-h-[32px] resize-none rounded-xl"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={submitting || !newComment.trim()}
              className="h-8 w-8 shrink-0 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25"
            >
              <Send className="w-3 h-3" />
            </Button>
          </div>

          <button
            onClick={() => setExpanded(false)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Cerrar comentarios
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component: FeedPost
// ---------------------------------------------------------------------------

function FeedPost({
  entry,
  reactions,
  myReaction,
  onReact,
}: {
  entry: EntryWithProfile;
  reactions: FeedReaction[];
  myReaction: ReactionType | null;
  onReact: (entryId: string, reaction: ReactionType) => void;
}) {
  const cat = CATEGORIES[entry.category];
  const hasProof = entry.proof_urls && entry.proof_urls.length > 0;
  const isLate = entry.is_late;

  return (
    <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-4 sm:p-5">
        {/* Post Header */}
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="w-10 h-10 ring-2 ring-background shadow-sm">
            <AvatarImage src={entry.profiles?.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/30">
              {getInitials(entry.profiles?.full_name ?? null)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">
                {entry.profiles?.full_name ?? "Anónimo"}
              </span>
              {hasProof && (
                <span title="Entrada verificada con evidencia">
                  <Check className="w-4 h-4 text-primary" />
                </span>
              )}
              {isLate && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400"
                  title={`Tardía (${entry.minutes_late}min)`}
                >
                  <Clock className="w-3 h-3" />
                  tardía
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {entry.profiles?.role && (
                <>
                  <span>{entry.profiles.role}</span>
                  <span className="text-muted-foreground/30">·</span>
                </>
              )}
              <span>
                hace{" "}
                {formatDistanceToNow(new Date(entry.created_at), {
                  locale: es,
                  addSuffix: false,
                })}
              </span>
            </div>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] rounded-lg font-semibold px-2 shrink-0",
              cat.color,
              cat.bgColor
            )}
          >
            {cat.emoji} {cat.label}
          </Badge>
        </div>

        {/* Post Body */}
        <div className="space-y-2">
          <p className="text-base font-bold leading-snug">{entry.title}</p>

          {entry.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {entry.description}
            </p>
          )}

          {/* Project badge */}
          {entry.project && (
            <Badge variant="outline" className="text-[10px] gap-1 rounded-lg font-medium">
              <FolderKanban className="w-3 h-3" />
              {entry.project}
            </Badge>
          )}

          {/* Proof links as chips */}
          {entry.proof_urls && entry.proof_urls.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entry.proof_urls.map((link, i) => {
                let hostname = "link";
                try {
                  hostname = new URL(link).hostname;
                } catch {
                  /* noop */
                }
                return (
                  <a
                    key={i}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 rounded-lg transition-colors font-medium"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {hostname}
                  </a>
                );
              })}
            </div>
          )}

          {/* Trust indicators row */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md",
                hasProof
                  ? "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/30"
                  : "text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/30"
              )}
            >
              {hasProof ? (
                <Shield className="w-3 h-3" />
              ) : (
                <AlertTriangle className="w-3 h-3" />
              )}
              {hasProof ? "Con evidencia" : "Sin evidencia"}
            </span>

            {isLate && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/30 px-2 py-0.5 rounded-md">
                <Clock className="w-3 h-3" />
                Tardía ({entry.minutes_late}min)
              </span>
            )}

            {/* Mood & Energy as emojis */}
            {entry.mood && (
              <span
                className="text-[10px] text-muted-foreground/80"
                title={`Ánimo: ${MOOD_LABELS[entry.mood]}`}
              >
                {"★".repeat(entry.mood)}
                {"☆".repeat(5 - entry.mood)}
              </span>
            )}
            {entry.energy && (
              <span className="text-[10px]" title={`Energía: ${ENERGY_LABELS[entry.energy]}`}>
                {"⚡".repeat(entry.energy)}
              </span>
            )}
          </div>
        </div>

        {/* Engagement Section */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <InlineReactions
            entryId={entry.id}
            reactions={reactions}
            myReaction={myReaction}
            onReact={onReact}
          />
          <InlineComments entryId={entry.id} />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FeedPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<EntryWithProfile[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState<"para_ti" | "siguiendo">("para_ti");

  // Stories data
  const [members, setMembers] = useState<Profile[]>([]);
  const [statuses, setStatuses] = useState<MemberStatus[]>([]);
  const [todayEntries, setTodayEntries] = useState<Map<string, EntryWithProfile[]>>(new Map());
  const [storyMember, setStoryMember] = useState<Profile | null>(null);

  // Reactions (bulk-loaded)
  const [reactionsMap, setReactionsMap] = useState<Map<string, FeedReaction[]>>(new Map());
  const [myReactionsMap, setMyReactionsMap] = useState<Map<string, ReactionType>>(new Map());

  // Social stats
  const [postCountToday, setPostCountToday] = useState(0);
  const [reactionCountToday, setReactionCountToday] = useState(0);

  // Users I've reacted to (for "Siguiendo" tab)
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // FAB pulsing
  const [lastLogTime, setLastLogTime] = useState<Date | null>(null);
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  // Refreshing
  const [refreshing, setRefreshing] = useState(false);

  const supabase = createClient();

  // -----------------------------------------------------------------------
  // Load org membership
  // -----------------------------------------------------------------------
  useEffect(() => {
    async function loadOrg() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (membership) {
        setOrgId(membership.org_id);
      } else {
        setLoading(false);
      }
    }
    loadOrg();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Load feed data when orgId is available
  // -----------------------------------------------------------------------
  const loadFeed = useCallback(
    async (reset = false) => {
      if (!orgId || !userId) return;

      const offset = reset ? 0 : entries.length;

      // Fetch entries
      const { data: entryData } = await supabase
        .from("time_entries")
        .select("*, profiles(*)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      const fetched = (entryData ?? []) as EntryWithProfile[];

      if (reset) {
        setEntries(fetched);
      } else {
        setEntries((prev) => [...prev, ...fetched]);
      }
      setHasMore(fetched.length === PAGE_SIZE);

      // Bulk load reactions for these entries
      const entryIds = fetched.map((e) => e.id);
      if (entryIds.length > 0) {
        const { data: reactionData } = await supabase
          .from("entry_reactions")
          .select("entry_id, reaction, user_id")
          .in("entry_id", entryIds);

        if (reactionData) {
          setReactionsMap((prev) => {
            const next = reset ? new Map<string, FeedReaction[]>() : new Map(prev);
            for (const r of reactionData) {
              const existing = next.get(r.entry_id) ?? [];
              existing.push(r as FeedReaction);
              next.set(r.entry_id, existing);
            }
            return next;
          });

          setMyReactionsMap((prev) => {
            const next = reset ? new Map<string, ReactionType>() : new Map(prev);
            for (const r of reactionData) {
              if (r.user_id === userId) {
                next.set(r.entry_id, r.reaction as ReactionType);
              }
            }
            return next;
          });
        }
      }
    },
    [orgId, userId, entries.length, supabase]
  );

  const loadMeta = useCallback(async () => {
    if (!orgId || !userId) return;

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Monterrey",
    }).format(new Date());

    // Load members
    const { data: memberData } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId);

    const memberIds = memberData?.map((m) => m.user_id) ?? [];

    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", memberIds);
      setMembers(profiles ?? []);
    }

    // Load live statuses
    const { data: statusData } = await supabase
      .from("live_status")
      .select("*, profiles(*)")
      .eq("org_id", orgId);
    setStatuses((statusData ?? []) as MemberStatus[]);

    // Today's entries for stories
    const { data: todayData } = await supabase
      .from("time_entries")
      .select("*, profiles(*)")
      .eq("org_id", orgId)
      .eq("date", today)
      .order("created_at", { ascending: false });

    const todayMap = new Map<string, EntryWithProfile[]>();
    for (const e of (todayData ?? []) as EntryWithProfile[]) {
      const list = todayMap.get(e.user_id) ?? [];
      list.push(e);
      todayMap.set(e.user_id, list);
    }
    setTodayEntries(todayMap);

    // Social stats
    setPostCountToday((todayData ?? []).length);

    const { count: reactionCount } = await supabase
      .from("entry_reactions")
      .select("*", { count: "exact", head: true })
      .in(
        "entry_id",
        (todayData ?? []).map((e) => e.id)
      );
    setReactionCountToday(reactionCount ?? 0);

    // Following: users whose entries I've reacted to
    const { data: myReactionData } = await supabase
      .from("entry_reactions")
      .select("entry_id")
      .eq("user_id", userId);

    if (myReactionData && myReactionData.length > 0) {
      const reactedEntryIds = myReactionData.map((r) => r.entry_id);
      const { data: reactedEntries } = await supabase
        .from("time_entries")
        .select("user_id")
        .in("id", reactedEntryIds.slice(0, 200));
      const fIds: Set<string> = new Set((reactedEntries ?? []).map((e) => String(e.user_id)));
      fIds.delete(userId);
      setFollowingIds(fIds);
    }

    // Last log time for FAB pulsing
    const { data: lastEntry } = await supabase
      .from("time_entries")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lastEntry) {
      setLastLogTime(new Date(lastEntry.created_at));
    }
  }, [orgId, userId, supabase]);

  // Initial load
  useEffect(() => {
    if (!orgId || !userId) return;

    async function init() {
      setLoading(true);
      await Promise.all([loadFeed(true), loadMeta()]);
      setLoading(false);
    }
    init();
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription for new entries
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("feed_new_entries")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "time_entries",
          filter: `org_id=eq.${orgId}`,
        },
        async (payload) => {
          // Fetch the full entry with profile
          const { data } = await supabase
            .from("time_entries")
            .select("*, profiles(*)")
            .eq("id", payload.new.id)
            .single();

          if (data) {
            setEntries((prev) => [data as EntryWithProfile, ...prev]);
            setPostCountToday((p) => p + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  async function handleReact(entryId: string, reaction: ReactionType) {
    if (!userId) return;

    const current = myReactionsMap.get(entryId);

    if (current === reaction) {
      // Remove reaction
      await supabase
        .from("entry_reactions")
        .delete()
        .eq("entry_id", entryId)
        .eq("user_id", userId);

      setMyReactionsMap((prev) => {
        const next = new Map(prev);
        next.delete(entryId);
        return next;
      });
      setReactionsMap((prev) => {
        const next = new Map(prev);
        const list = (next.get(entryId) ?? []).filter((r) => r.user_id !== userId);
        next.set(entryId, list);
        return next;
      });
    } else {
      // Upsert reaction
      await supabase.from("entry_reactions").upsert(
        {
          entry_id: entryId,
          user_id: userId,
          reaction,
        },
        { onConflict: "entry_id,user_id" }
      );

      setMyReactionsMap((prev) => {
        const next = new Map(prev);
        next.set(entryId, reaction);
        return next;
      });
      setReactionsMap((prev) => {
        const next = new Map(prev);
        const list = (next.get(entryId) ?? []).filter((r) => r.user_id !== userId);
        list.push({ entry_id: entryId, reaction, user_id: userId });
        next.set(entryId, list);
        return next;
      });
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadFeed(true), loadMeta()]);
    setRefreshing(false);
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    await loadFeed(false);
    setLoadingMore(false);
  }

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const shouldPulse = !lastLogTime || Date.now() - lastLogTime.getTime() > 2 * 60 * 60 * 1000;

  // Filter entries for "Siguiendo" tab
  const filteredEntries =
    tab === "siguiendo"
      ? entries.filter((e) => followingIds.has(e.user_id))
      : entries;

  // Story entries for the selected member
  const storyEntries = storyMember
    ? (todayEntries.get(storyMember.id) ?? [])
    : [];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 relative min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Rss className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl hover:bg-accent transition-colors"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {/* Social Stats */}
      <div className="flex items-center gap-4 mb-6">
        <div className="bg-accent/40 rounded-xl px-3 py-1.5">
          <span className="text-sm font-semibold tabular-nums tracking-tight">
            {postCountToday}
          </span>
          <span className="text-xs text-muted-foreground ml-1.5">
            publicaciones hoy
          </span>
        </div>
        <div className="bg-accent/40 rounded-xl px-3 py-1.5">
          <span className="text-sm font-semibold tabular-nums tracking-tight">
            {reactionCountToday}
          </span>
          <span className="text-xs text-muted-foreground ml-1.5">
            reacciones del equipo
          </span>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Cargando...
          </p>
        </div>
      ) : isWeekend() && entries.length === 0 ? (
        /* Weekend Empty State */
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="text-3xl">🏖️</span>
          </div>
          <p className="text-lg font-semibold">Es fin de semana. Descansa.</p>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            El equipo no tiene registros activos. Disfruta tu tiempo libre.
          </p>
        </div>
      ) : (
        <>
          {/* Stories Bar */}
          {members.length > 0 && (
            <StoriesBar
              members={members}
              statuses={statuses}
              todayEntries={todayEntries}
              onSelect={(m) => setStoryMember(m)}
            />
          )}

          {/* Tab Selector */}
          <div className="flex items-center gap-1 mb-6 border-b border-border/50">
            <button
              onClick={() => setTab("para_ti")}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors relative",
                tab === "para_ti"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Para ti
              {tab === "para_ti" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
            <button
              onClick={() => setTab("siguiendo")}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors relative",
                tab === "siguiendo"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Siguiendo
              {followingIds.size > 0 && (
                <span className="ml-1.5 text-[10px] tabular-nums bg-accent rounded-full px-1.5 py-0.5">
                  {followingIds.size}
                </span>
              )}
              {tab === "siguiendo" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          </div>

          {/* Empty State */}
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Rss className="w-8 h-8 text-primary/60" />
              </div>
              {tab === "siguiendo" ? (
                <>
                  <p className="text-lg font-semibold">
                    Aún no sigues a nadie
                  </p>
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    Reacciona a las entradas de tus compañeros para verlos aquí.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">
                    Sé el primero en publicar hoy
                  </p>
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    Tu equipo aún no ha registrado nada. Marca el ritmo.
                  </p>
                  <Button
                    onClick={() => setLogDialogOpen(true)}
                    className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25 mt-2"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Registrar ahora
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Feed Posts */}
              <div className="space-y-4">
                {filteredEntries.map((entry) => (
                  <FeedPost
                    key={entry.id}
                    entry={entry}
                    reactions={reactionsMap.get(entry.id) ?? []}
                    myReaction={myReactionsMap.get(entry.id) ?? null}
                    onReact={handleReact}
                  />
                ))}
              </div>

              {/* Load More */}
              {hasMore && tab === "para_ti" && (
                <div className="flex justify-center mt-8">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="rounded-xl gap-2"
                  >
                    {loadingMore ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        Cargar más
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => setLogDialogOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 rounded-2xl",
          "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800",
          "text-white font-semibold text-sm shadow-xl shadow-blue-600/25",
          "transition-all duration-300 hover:scale-105 active:scale-95",
          shouldPulse && "animate-pulse"
        )}
      >
        <Plus className="w-5 h-5" />
        Registrar
      </button>

      {/* Log Entry Dialog */}
      {logDialogOpen && (
        <LogEntryDialog
          open={logDialogOpen}
          onOpenChange={(open) => {
            setLogDialogOpen(open);
            if (!open) {
              setLastLogTime(new Date());
            }
          }}
        />
      )}

      {/* Stories Popup */}
      {storyMember && (
        <StoriesPopup
          member={storyMember}
          entries={storyEntries}
          onClose={() => setStoryMember(null)}
        />
      )}
    </div>
  );
}
