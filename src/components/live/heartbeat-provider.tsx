"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

// Sends heartbeats every 2 minutes, detects idle after 5 minutes of no mouse/keyboard
export function HeartbeatProvider({ children }: { children: React.ReactNode }) {
 const lastActivity = useRef(Date.now());
 const statusRef = useRef<string>("online");
 const supabase = createClient();

 const updateStatus = useCallback(async (status: string, task?: string) => {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;

 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id")
 .eq("user_id", user.id)
 .limit(1)
 .single();

 if (!membership) return;

 await supabase.from("live_status").upsert({
 user_id: user.id,
 org_id: membership.org_id,
 status,
 current_task: task ?? null,
 last_heartbeat: new Date().toISOString(),
 ...(status !== statusRef.current ? { started_at: new Date().toISOString() } : {}),
 });

 statusRef.current = status;
 }, []); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 function onActivity() {
 lastActivity.current = Date.now();
 if (statusRef.current ==="idle") {
 updateStatus("online");
 }
 }

 window.addEventListener("mousemove", onActivity);
 window.addEventListener("keydown", onActivity);
 window.addEventListener("click", onActivity);

 // Heartbeat interval
 const heartbeat = setInterval(() => {
 const idleMinutes = (Date.now() - lastActivity.current) / 1000 / 60;
 if (idleMinutes > 5) {
 updateStatus("idle");
 } else {
 updateStatus(statusRef.current ==="idle"?"online": statusRef.current);
 }
 }, 2 * 60 * 1000); // Every 2 minutes

 // Initial status
 updateStatus("online");

 // Set offline on close
 function onBeforeUnload() {
 updateStatus("offline");
 }
 window.addEventListener("beforeunload", onBeforeUnload);

 return () => {
 window.removeEventListener("mousemove", onActivity);
 window.removeEventListener("keydown", onActivity);
 window.removeEventListener("click", onActivity);
 window.removeEventListener("beforeunload", onBeforeUnload);
 clearInterval(heartbeat);
 updateStatus("offline");
 };
 }, [updateStatus]);

 return <>{children}</>;
}
