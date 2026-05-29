"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isToday, isYesterday, differenceInDays } from "date-fns";
import {
  Bell,
  Check,
  CheckCheck,
  Filter,
  Flame,
  Flag,
  Shield,
  MessageSquare,
  Target,
  Settings,
  FileText,
  ClipboardList,
  Megaphone,
  BarChart3,
  Handshake,
  Inbox,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationType =
  | "reaction_received"
  | "flag_raised"
  | "streak_milestone"
  | "entry_logged"
  | "closeout_reminder"
  | "standup_reminder"
  | "title_change"
  | "buddy_alert"
  | "goal_completed";

type FilterTab = "all" | "unread" | "mentions" | "flags" | "reactions" | "system";

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Notification type config
// ---------------------------------------------------------------------------

interface NotifTypeConfig {
  icon: typeof Bell;
  color: string;
  bgColor: string;
  defaultLink: string;
}

const NOTIF_TYPE_CONFIG: Record<NotificationType, NotifTypeConfig> = {
  reaction_received: {
    icon: Check,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    defaultLink: "/feed",
  },
  flag_raised: {
    icon: Flag,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    defaultLink: "/accountability",
  },
  streak_milestone: {
    icon: Flame,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    defaultLink: "/profile",
  },
  entry_logged: {
    icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    defaultLink: "/feed",
  },
  closeout_reminder: {
    icon: ClipboardList,
    color: "text-primary",
    bgColor: "bg-violet-50 dark:bg-violet-950/30",
    defaultLink: "/dashboard",
  },
  standup_reminder: {
    icon: Megaphone,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    defaultLink: "/standup",
  },
  title_change: {
    icon: BarChart3,
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-50 dark:bg-pink-950/30",
    defaultLink: "/mirror",
  },
  buddy_alert: {
    icon: Handshake,
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-50 dark:bg-teal-950/30",
    defaultLink: "/dashboard",
  },
  goal_completed: {
    icon: Target,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    defaultLink: "/goals",
  },
};

const NOTIF_EMOJI: Record<string, string> = {
  reaction_received: "✅",
  flag_raised: "🚩",
  streak_milestone: "🔥",
  entry_logged: "📝",
  closeout_reminder: "📋",
  standup_reminder: "📣",
  title_change: "📊",
  buddy_alert: "🤝",
  goal_completed: "🎯",
};

const FILTER_TABS: { value: FilterTab; label: string; icon: typeof Bell; types: NotificationType[] | null }[] = [
  { value: "all", label: "Todas", icon: Filter, types: null },
  { value: "unread", label: "Sin leer", icon: Bell, types: null },
  { value: "mentions", label: "Menciones", icon: MessageSquare, types: ["entry_logged", "reaction_received"] },
  { value: "flags", label: "Flags", icon: Flag, types: ["flag_raised"] },
  { value: "reactions", label: "Reacciones", icon: Check, types: ["reaction_received"] },
  {
    value: "system",
    label: "Sistema",
    icon: Shield,
    types: ["closeout_reminder", "standup_reminder", "title_change", "buddy_alert", "streak_milestone", "goal_completed"],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConfig(type: string): NotifTypeConfig {
  return (
    NOTIF_TYPE_CONFIG[type as NotificationType] ?? {
      icon: Bell,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      defaultLink: "/home",
    }
  );
}

function getEmoji(type: string): string {
  return NOTIF_EMOJI[type] ?? "📌";
}

function relativeTime(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.round(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
  return `hace ${Math.round(diff / 86400)}d`;
}

function groupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Hoy";
  if (isYesterday(date)) return "Ayer";
  if (differenceInDays(new Date(), date) <= 7) return "Esta semana";
  return "Anteriores";
}

function groupNotifications(
  notifications: Notification[]
): { label: string; items: Notification[] }[] {
  const groups = new Map<string, Notification[]>();
  const order = ["Hoy", "Ayer", "Esta semana", "Anteriores"];

  for (const n of notifications) {
    const label = groupLabel(n.created_at);
    const existing = groups.get(label) ?? [];
    existing.push(n);
    groups.set(label, existing);
  }

  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, items: groups.get(label)! }));
}

function filterNotifications(
  notifications: Notification[],
  tab: FilterTab
): Notification[] {
  if (tab === "all") return notifications;
  if (tab === "unread") return notifications.filter((n) => !n.read);

  const tabConfig = FILTER_TABS.find((t) => t.value === tab);
  if (!tabConfig?.types) return notifications;

  return notifications.filter((n) =>
    tabConfig.types!.includes(n.type as NotificationType)
  );
}

// ---------------------------------------------------------------------------
// Component: NotificationItem
// ---------------------------------------------------------------------------

function NotificationItem({
  notification,
  onMarkRead,
  isNew,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  isNew: boolean;
}) {
  const config = getConfig(notification.type);
  const Icon = config.icon;
  const emoji = getEmoji(notification.type);
  const link = notification.link ?? config.defaultLink;

  function handleClick() {
    if (!notification.read) {
      onMarkRead(notification.id);
    }
  }

  const inner = (
    <div
      className={cn(
        "group relative flex items-start gap-3.5 px-4 py-3.5 rounded-xl transition-all duration-200 cursor-pointer",
        !notification.read
          ? "bg-primary/[0.03] hover:bg-primary/[0.06]"
          : "hover:bg-accent/50",
        isNew && "animate-[notif-slide-in_0.35s_ease-out]"
      )}
    >
      {/* Unread indicator */}
      {!notification.read && (
        <span className="absolute top-4 left-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
      )}

      {/* Type icon */}
      <div
        className={cn(
          "flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5",
          config.bgColor
        )}
      >
        <Icon className={cn("w-4 h-4", config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm leading-snug",
                !notification.read
                  ? "font-semibold text-foreground"
                  : "text-foreground/90"
              )}
            >
              <span className="mr-1.5">{emoji}</span>
              {notification.title}
            </p>
            {notification.body && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                {notification.body}
              </p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap mt-0.5 tabular-nums">
            {relativeTime(notification.created_at)}
          </span>
        </div>
      </div>
    </div>
  );

  if (link) {
    return (
      <Link href={link} className="block" onClick={handleClick}>
        {inner}
      </Link>
    );
  }

  return <div onClick={handleClick}>{inner}</div>;
}

// ---------------------------------------------------------------------------
// Component: NotificationGroup
// ---------------------------------------------------------------------------

function NotificationGroup({
  label,
  items,
  onMarkRead,
  newIds,
}: {
  label: string;
  items: Notification[];
  onMarkRead: (id: string) => void;
  newIds: Set<string>;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 px-4 mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          {items.length}
        </span>
      </div>
      <div className="space-y-0.5">
        {items.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onMarkRead={onMarkRead}
            isNew={newIds.has(n.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component: EmptyState
// ---------------------------------------------------------------------------

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Inbox className="w-8 h-8 text-primary/60" />
      </div>
      <p className="text-lg font-semibold">
        {filtered ? "Sin resultados" : "Sin notificaciones"}
      </p>
      <p className="text-sm text-muted-foreground text-center max-w-xs">
        {filtered
          ? "No hay notificaciones de este tipo. Prueba con otro filtro."
          : "Estás al día — no hay notificaciones pendientes."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component: StatsBar
// ---------------------------------------------------------------------------

function StatsBar({
  total,
  unread,
  todayCount,
}: {
  total: number;
  unread: number;
  todayCount: number;
}) {
  return (
    <div className="flex items-center gap-3 mb-6 flex-wrap">
      <div className="bg-accent/40 rounded-xl px-3 py-1.5">
        <span className="text-sm font-semibold tabular-nums tracking-tight">
          {total}
        </span>
        <span className="text-xs text-muted-foreground ml-1.5">total</span>
      </div>
      <div className="bg-accent/40 rounded-xl px-3 py-1.5">
        <span className="text-sm font-semibold tabular-nums tracking-tight">
          {unread}
        </span>
        <span className="text-xs text-muted-foreground ml-1.5">sin leer</span>
      </div>
      <div className="bg-accent/40 rounded-xl px-3 py-1.5">
        <span className="text-sm font-semibold tabular-nums tracking-tight">
          {todayCount}
        </span>
        <span className="text-xs text-muted-foreground ml-1.5">hoy</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component: NotificationList (renders grouped filtered list)
// ---------------------------------------------------------------------------

function NotificationList({
  notifications,
  onMarkRead,
  newIds,
  isFiltered,
}: {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  newIds: Set<string>;
  isFiltered: boolean;
}) {
  if (notifications.length === 0) {
    return <EmptyState filtered={isFiltered} />;
  }

  const grouped = groupNotifications(notifications);

  return (
    <div className="space-y-2">
      {grouped.map((group) => (
        <NotificationGroup
          key={group.label}
          label={group.label}
          items={group.items}
          onMarkRead={onMarkRead}
          newIds={newIds}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [markingAll, setMarkingAll] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

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
  // Fetch notifications
  // -----------------------------------------------------------------------
  const loadNotifications = useCallback(async () => {
    if (!userId) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    setNotifications((data ?? []) as Notification[]);
  }, [userId, supabase]);

  // -----------------------------------------------------------------------
  // Initial load
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!userId) return;

    async function init() {
      setLoading(true);
      await loadNotifications();
      setLoading(false);
    }
    init();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Real-time subscription
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("notifications_page_rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;

          setNotifications((prev) => [newNotif, ...prev]);

          // Track as "new" for slide-in animation
          setNewIds((prev) => {
            const next = new Set(prev);
            next.add(newNotif.id);
            return next;
          });

          // Remove animation flag after transition
          setTimeout(() => {
            setNewIds((prev) => {
              const next = new Set(prev);
              next.delete(newNotif.id);
              return next;
            });
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  async function markAsRead(id: string) {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);
  }

  async function markAllAsRead() {
    if (!userId) return;
    setMarkingAll(true);

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);

    setMarkingAll(false);
  }

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------
  const unreadCount = notifications.filter((n) => !n.read).length;
  const todayCount = notifications.filter((n) =>
    isToday(new Date(n.created_at))
  ).length;

  const filteredNotifications = filterNotifications(notifications, activeTab);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 min-h-screen">
      {/* Slide-in keyframe animation */}
      <style>{`
        @keyframes notif-slide-in {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Notificaciones</h1>
          {unreadCount > 0 && (
            <Badge className="h-6 min-w-[24px] px-2 flex items-center justify-center text-xs font-bold bg-primary text-primary-foreground rounded-full">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              disabled={markingAll}
              className="gap-1.5 rounded-xl text-xs"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                Marcar todas como leídas
              </span>
              <span className="sm:hidden">Leídas</span>
            </Button>
          )}
          <Link href="/settings">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-xl text-xs text-muted-foreground"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                Configurar notificaciones
              </span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <StatsBar
        total={notifications.length}
        unread={unreadCount}
        todayCount={todayCount}
      />

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Cargando...
          </p>
        </div>
      ) : (
        <>
          {/* Filter Tabs */}
          <div className="mb-6">
            <div className="flex items-center gap-1 border-b border-border/50 overflow-x-auto scrollbar-hide">
              {FILTER_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.value;
                const tabCount =
                  tab.value === "unread"
                    ? unreadCount
                    : tab.value !== "all"
                      ? filterNotifications(notifications, tab.value).length
                      : null;

                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap shrink-0",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.value === "unread" && unreadCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 text-[10px] px-1.5 py-0 h-4 rounded-full"
                      >
                        {unreadCount}
                      </Badge>
                    )}
                    {tab.value !== "all" &&
                      tab.value !== "unread" &&
                      tabCount !== null &&
                      tabCount > 0 && (
                        <span className="text-[10px] tabular-nums text-muted-foreground/60 ml-0.5">
                          {tabCount}
                        </span>
                      )}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notification List */}
          <NotificationList
            notifications={filteredNotifications}
            onMarkRead={markAsRead}
            newIds={newIds}
            isFiltered={activeTab !== "all"}
          />

          {/* Footer link */}
          {notifications.length > 0 && (
            <div className="mt-8 pt-6 border-t border-border/50 flex items-center justify-center">
              <Link
                href="/settings"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings className="w-4 h-4" />
                Configurar notificaciones
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
