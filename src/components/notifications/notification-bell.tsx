"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bell } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Notification {
 id: string;
 type: string;
 title: string;
 body: string | null;
 link: string | null;
 read: boolean;
 created_at: string;
}

const TYPE_EMOJI: Record<string, string> = {
 entry_logged:"--",
 shoutout_received:"--",
 reaction_received:"👍",
 flag_raised:"!!",
 standup_reminder:"--",
 closeout_reminder:"--",
 verification_request:"--",
 goal_completed:"--",
 streak_milestone:"--",
};

export function NotificationBell() {
 const [notifications, setNotifications] = useState<Notification[]>([]);
 const [unreadCount, setUnreadCount] = useState(0);
 const supabase = createClient();

 useEffect(() => {
 async function load() {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;

 const { data } = await supabase
 .from("notifications")
 .select("*")
 .eq("user_id", user.id)
 .order("created_at", { ascending: false })
 .limit(20);

 const notifs = (data ?? []) as Notification[];
 setNotifications(notifs);
 setUnreadCount(notifs.filter((n) => !n.read).length);

 // Real-time subscription
 const channel = supabase
 .channel(`notifications_rt_${user.id}`)
 .on("postgres_changes", {
 event:"INSERT",
 schema:"public",
 table:"notifications",
 filter:`user_id=eq.${user.id}`,
 }, (payload) => {
 const newNotif = payload.new as Notification;
 setNotifications((prev) => [newNotif, ...prev.slice(0, 19)]);
 setUnreadCount((prev) => prev + 1);
 })
 .subscribe();

 return () => { supabase.removeChannel(channel); };
 }
 load();
 }, []); // eslint-disable-line react-hooks/exhaustive-deps

 async function markAllRead() {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;

 await supabase
 .from("notifications")
 .update({ read: true })
 .eq("user_id", user.id)
 .eq("read", false);

 setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
 setUnreadCount(0);
 }

 return (
 <DropdownMenu>
 <DropdownMenuTrigger className="relative inline-flex items-center justify-center h-9 w-9 hover:bg-accent transition-colors">
 <Bell className="w-[18px] h-[18px]"/>
 {unreadCount > 0 && (
 <Badge className="absolute -top-1 -right-1 h-[18px] min-w-[18px] p-0 flex items-center justify-center text-[9px] font-bold bg-red-500 border-2 border-background rounded-full">
 {unreadCount > 9 ?"9+": unreadCount}
 </Badge>
 )}
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end"className="w-80 max-h-96 overflow-y-auto border-border/50">
 <div className="flex items-center justify-between p-3 border-b">
 <span className="font-semibold text-sm">Notificaciones</span>
 {unreadCount > 0 && (
 <Button variant="ghost"size="sm"className="text-xs h-7"onClick={markAllRead}>
 Marcar todas leídas
 </Button>
 )}
 </div>
 {notifications.length === 0 ? (
 <p className="text-sm text-muted-foreground text-center py-8">
 Sin notificaciones
 </p>
 ) : (
 notifications.map((n) => (
 <div
 key={n.id}
 className={cn(
"px-3 py-2.5 border-b last:border-0 transition-colors",
 !n.read &&"bg-primary/5")}
 >
 <div className="flex items-start gap-2">
 <span className="text-base mt-0.5">{TYPE_EMOJI[n.type] ??"📌"}</span>
 <div className="flex-1 min-w-0">
 <p className={cn("text-sm", !n.read &&"font-medium")}>{n.title}</p>
 {n.body && (
 <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
 )}
 <p className="text-[10px] text-muted-foreground mt-1">
 {format(new Date(n.created_at),"d MMM, h:mm a", { locale: es })}
 </p>
 </div>
 </div>
 </div>
 ))
 )}
 </DropdownMenuContent>
 </DropdownMenu>
 );
}
