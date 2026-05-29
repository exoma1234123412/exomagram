"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Brain, X, Zap, AlertTriangle, Trophy, Flame } from "lucide-react";

// AI PROACTIVE COACH: Appears every 2 hours with a personalized message.
// Not a notification — an actual coaching intervention based on your live data.

interface CoachMessage {
 message: string;
 urgency: string;
 action: string;
 motivation_type: string;
}

export function AICoachNudge() {
 const [nudge, setNudge] = useState<CoachMessage | null>(null);
 const [visible, setVisible] = useState(false);
 const [orgId, setOrgId] = useState<string | null>(null);
 const [userId, setUserId] = useState<string | null>(null);
 const supabase = createClient();

 useEffect(() => {
 async function init() {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;
 setUserId(user.id);
 const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
 if (m) setOrgId(m.org_id);
 }
 init();
 }, []); // eslint-disable-line react-hooks/exhaustive-deps

 const fetchNudge = useCallback(async () => {
 if (!orgId || !userId) return;
 const hour = new Date().getHours();
 if (hour < 8 || hour > 18) return;

 try {
 const res = await fetch("/api/claude-coach", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({ org_id: orgId, user_id: userId, type:"realtime_nudge"}),
 });
 const data = await res.json();
 if (data.response?.message) {
 setNudge(data.response);
 setVisible(true);
 }
 } catch {
 // Silent fail
 }
 }, [orgId, userId]);

 useEffect(() => {
 if (!orgId || !userId) return;

 // First nudge after 30 seconds
 const firstTimeout = setTimeout(fetchNudge, 30_000);

 // Then every 2 hours
 const interval = setInterval(fetchNudge, 2 * 60 * 60_000);

 return () => {
 clearTimeout(firstTimeout);
 clearInterval(interval);
 };
 }, [orgId, userId, fetchNudge]);

 if (!visible || !nudge) return null;

 const urgencyConfig: Record<string, { bg: string; border: string; icon: typeof Brain }> = {
 critical: { bg:"bg-red-50 dark:bg-red-950/20", border:"border-red-300 dark:border-red-800", icon: AlertTriangle },
 high: { bg:"bg-orange-50 dark:bg-orange-950/15", border:"border-orange-300 dark:border-orange-800", icon: Flame },
 medium: { bg:"bg-yellow-50 dark:bg-yellow-950/10", border:"border-yellow-200 dark:border-yellow-800", icon: Zap },
 low: { bg:"bg-primary/5", border:"border-primary/20", icon: Trophy },
 };

 const config = urgencyConfig[nudge.urgency] ?? urgencyConfig.medium;
 const Icon = config.icon;

 return (
 <div className={cn(
"fixed bottom-24 right-6 md:bottom-6 max-w-sm z-50 border p-4 animate-in slide-in-from-bottom-5",
 config.bg, config.border,
 )}>
 <div className="flex items-start gap-3">
 <div className="w-8 h-8 bg-primary/10 flex items-center justify-center shrink-0">
 <Icon className="w-4 h-4 text-primary"/>
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <p className="text-[10px] font-semibold text-primary uppercase">AI Coach</p>
 <button onClick={() => setVisible(false)} className="ml-auto text-muted-foreground hover:text-foreground">
 <X className="w-3.5 h-3.5"/>
 </button>
 </div>
 <p className="text-sm font-medium leading-snug">{nudge.message}</p>
 <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
 <Zap className="w-3 h-3"/> {nudge.action}
 </p>
 </div>
 </div>
 </div>
 );
}
