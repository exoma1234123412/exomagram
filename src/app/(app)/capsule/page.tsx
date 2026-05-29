"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Package, RefreshCw, Clock, Sparkles } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CapsuleItem {
 id: string;
 title: string;
 body: string;
 target_user_id: string | null;
 emoji: string | null;
 created_at: string;
}

interface Profile {
 id: string;
 full_name: string | null;
 avatar_url: string | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CapsulePage() {
 const { orgId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [capsules, setCapsules] = useState<CapsuleItem[]>([]);
 const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
 const [loading, setLoading] = useState(true);
 const [generating, setGenerating] = useState(false);
 const [error, setError] = useState<string | null>(null);

 // Calculate current week's Monday
 const today = new Date();
 const daysSinceMonday = (today.getDay() + 6) % 7;
 const thisMonday = new Date(today);
 thisMonday.setDate(today.getDate() - daysSinceMonday);
 const thisMondayStr = thisMonday.toISOString().split("T")[0];

 useEffect(() => {
 if (!orgId) return;

 async function load() {
 setLoading(true);

 // Load capsules from public_feed for this week
 const { data: feedItems } = await supabase
 .from("public_feed")
 .select("*")
 .eq("org_id", orgId)
 .eq("type","ai_announcement")
 .ilike("title","Time Capsule%")
 .gte("created_at", thisMondayStr +"T00:00:00")
 .order("created_at", { ascending: false });

 const items = (feedItems ?? []) as CapsuleItem[];
 setCapsules(items);

 // Load profiles for targeted users
 const targetIds = items
 .map((c) => c.target_user_id)
 .filter((id): id is string => id !== null);

 if (targetIds.length > 0) {
 const { data: profileData } = await supabase
 .from("profiles")
 .select("id, full_name, avatar_url")
 .in("id", targetIds);

 const profileMap = new Map<string, Profile>();
 for (const p of (profileData ?? []) as Profile[]) {
 profileMap.set(p.id, p);
 }
 setProfiles(profileMap);
 }

 setLoading(false);
 }

 load();
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 async function handleGenerate() {
 if (!orgId) return;
 setGenerating(true);
 setError(null);

 try {
 const res = await fetch("/api/time-capsule", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({ org_id: orgId }),
 });

 if (!res.ok) {
 const data = await res.json();
 setError(data.error ??"Error generando cápsulas");
 setGenerating(false);
 return;
 }

 // Reload capsules
 const { data: feedItems } = await supabase
 .from("public_feed")
 .select("*")
 .eq("org_id", orgId)
 .eq("type","ai_announcement")
 .ilike("title","Time Capsule%")
 .gte("created_at", thisMondayStr +"T00:00:00")
 .order("created_at", { ascending: false });

 const items = (feedItems ?? []) as CapsuleItem[];
 setCapsules(items);

 const targetIds = items
 .map((c) => c.target_user_id)
 .filter((id): id is string => id !== null);

 if (targetIds.length > 0) {
 const { data: profileData } = await supabase
 .from("profiles")
 .select("id, full_name, avatar_url")
 .in("id", targetIds);

 const profileMap = new Map<string, Profile>();
 for (const p of (profileData ?? []) as Profile[]) {
 profileMap.set(p.id, p);
 }
 setProfiles(profileMap);
 }
 } catch {
 setError("Error de conexión");
 }

 setGenerating(false);
 }

 // -----------------------------------------------------------------------
 // Render
 // -----------------------------------------------------------------------

 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center gap-3">
 <Package className="w-6 h-6 text-primary"/>
 <h1 className="text-2xl font-bold tracking-tight">Time Capsule</h1>
 </div>
 <Button
 onClick={handleGenerate}
 disabled={generating || orgLoading}
 className="gap-2"variant="outline">
 {generating ? (
 <>
 <RefreshCw className="w-3.5 h-3.5 animate-spin"/>
 Generando...
 </>
 ) : (
 <>
 <Sparkles className="w-3.5 h-3.5"/>
 Generar cápsulas
 </>
 )}
 </Button>
 </div>

 <p className="text-sm text-muted-foreground mb-8">
 Cada lunes, comparamos lo que cada persona prometió vs lo que realmente
 hizo. Sin excusas.
 </p>

 {/* Week indicator */}
 <div className="bg-accent/40 px-4 py-2.5 mb-6 inline-flex items-center gap-2">
 <Clock className="w-4 h-4 text-muted-foreground"/>
 <span className="text-sm font-medium">
 Semana del{""}
 {format(thisMonday,"d 'de' MMMM yyyy", { locale: es })}
 </span>
 </div>

 {/* Error */}
 {error && (
 <div className="bg-destructive/5 border border-destructive/20 px-4 py-3 mb-6">
 <p className="text-sm text-destructive">{error}</p>
 </div>
 )}

 {/* Loading */}
 {orgLoading || loading ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">
 Cargando...
 </p>
 </div>
 ) : capsules.length === 0 ? (
 /* Empty state */
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <Package className="w-8 h-8 text-primary/60"/>
 </div>
 <p className="text-lg font-semibold">Sin cápsulas esta semana</p>
 <p className="text-sm text-muted-foreground text-center max-w-xs">
 Presiona &quot;Generar cápsulas&quot; para que Claude compare las
 promesas de la semana pasada con la realidad.
 </p>
 </div>
 ) : (
 /* Capsule cards */
 <div className="space-y-4">
 {capsules.map((capsule) => {
 const targetProfile = capsule.target_user_id
 ? profiles.get(capsule.target_user_id)
 : null;

 return (
 <Card
 key={capsule.id}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-5">
 <div className="flex items-start gap-4">
 {/* Avatar */}
 <Avatar className="w-10 h-10 ring-2 ring-background shrink-0">
 <AvatarImage
 src={targetProfile?.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/30">
 {getInitials(targetProfile?.full_name ?? null)}
 </AvatarFallback>
 </Avatar>

 <div className="flex-1 min-w-0">
 {/* Header */}
 <div className="flex items-center gap-2 mb-2">
 <span className="text-sm font-semibold">
 {targetProfile?.full_name ??"Miembro del equipo"}
 </span>
 <Badge
 variant="secondary"className="text-[10px]">
 {capsule.emoji ??"📦"} Time Capsule
 </Badge>
 </div>

 {/* Body */}
 <p className="text-sm text-muted-foreground leading-relaxed">
 {capsule.body}
 </p>

 {/* Timestamp */}
 <p className="text-[10px] text-muted-foreground/60 mt-2">
 {format(
 new Date(capsule.created_at),
"d MMM yyyy, HH:mm",
 { locale: es }
 )}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 )}
 </div>
 );
}
