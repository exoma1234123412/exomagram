"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Clock, Send, CheckCircle2 } from "lucide-react";

// ANTI-GAMING: Micro Check-ins every 30 minutes
// Instead of 1 vague entry per hour, you must report TWICE per hour.
//"What did you accomplish in the last 30 minutes?"// This forces real granularity. You can't fake 16 detailed check-ins per day.
// Each check-in is timestamped and visible to the team.

export function MicroCheckinProvider({ children }: { children: React.ReactNode }) {
 const [showCheckin, setShowCheckin] = useState(false);
 const [response, setResponse] = useState("");
 const [submitting, setSubmitting] = useState(false);
 const [submitted, setSubmitted] = useState(false);
 const supabase = createClient();

 useEffect(() => {
 function scheduleCheckin() {
 const now = new Date();
 const hour = now.getHours();
 const minutes = now.getMinutes();

 if (hour < 8 || hour > 17) return;

 // Schedule at :25 and :55 of each hour (gives 5 min buffer)
 let nextMinute: number;
 if (minutes < 25) {
 nextMinute = 25;
 } else if (minutes < 55) {
 nextMinute = 55;
 } else {
 // Next hour's :25
 nextMinute = 85; // will wrap
 }

 const delayMinutes = nextMinute - minutes;
 const delayMs = Math.max(delayMinutes * 60_000, 60_000); // At least 1 min

 setTimeout(() => {
 const currentHour = new Date().getHours();
 if (currentHour >= 8 && currentHour <= 17) {
 setShowCheckin(true);
 setSubmitted(false);
 setResponse("");
 }
 scheduleCheckin();
 }, delayMs);
 }

 scheduleCheckin();
 }, []);

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!response.trim() || response.length < 10) return;
 setSubmitting(true);

 const { data: { user } } = await supabase.auth.getUser();
 if (!user) { setSubmitting(false); return; }

 const { data: membership } = await supabase
 .from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
 if (!membership) { setSubmitting(false); return; }

 await supabase.from("audit_log").insert({
 org_id: membership.org_id,
 user_id: user.id,
 action:"entry_created",
 target_type:"micro_checkin",
 new_data: {
 response,
 timestamp: new Date().toISOString(),
 half_hour: new Date().getMinutes() < 30 ?"first":"second",
 },
 });

 setSubmitted(true);
 setSubmitting(false);
 setTimeout(() => setShowCheckin(false), 1500);
 }

 function skip() {
 // Skipping is logged too
 (async () => {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;
 const { data: membership } = await supabase
 .from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
 if (!membership) return;

 await supabase.from("audit_log").insert({
 org_id: membership.org_id,
 user_id: user.id,
 action:"entry_created",
 target_type:"micro_checkin",
 new_data: {
 response:"SKIPPED",
 timestamp: new Date().toISOString(),
 skipped: true,
 },
 });
 })();
 setShowCheckin(false);
 }

 return (
 <>
 {children}
 <Dialog open={showCheckin} onOpenChange={skip}>
 <DialogContent className="sm:max-w-md">
 {submitted ? (
 <div className="text-center py-6">
 <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2"/>
 <p className="font-semibold">Check-in registrado</p>
 </div>
 ) : (
 <>
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-base">
 <Clock className="w-4 h-4 text-primary"/>
 Check-in de 30 minutos
 </DialogTitle>
 </DialogHeader>

 <p className="text-sm text-muted-foreground">
 ¿Qué lograste en los últimos 30 minutos? Sé específico.
 </p>

 <form onSubmit={handleSubmit} className="space-y-3">
 <Input
 placeholder="Terminé la validación del formulario de pagos..."value={response}
 onChange={(e) => setResponse(e.target.value)}
 required
 minLength={10}
 autoFocus
 />
 <div className="flex gap-2">
 <Button type="submit"className="flex-1 gap-2"disabled={submitting || response.length < 10}>
 <Send className="w-4 h-4"/>
 Enviar
 </Button>
 <Button type="button"variant="ghost"onClick={skip} className="text-muted-foreground text-xs">
 Saltar (se registra)
 </Button>
 </div>
 </form>
 </>
 )}
 </DialogContent>
 </Dialog>
 </>
 );
}
