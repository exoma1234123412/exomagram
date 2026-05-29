"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import { getInitials, timeAgo } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
 Brain,
 RefreshCw,
 Loader2,
 Sparkles,
 Clock,
} from "lucide-react";

interface BioCard {
 user_id: string;
 name: string;
 avatar_url: string | null;
 bio: string;
 updated_at: string | null;
}

export default function BiosPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const supabase = createClient();

 const [bios, setBios] = useState<BioCard[]>([]);
 const [loading, setLoading] = useState(true);
 const [regenerating, setRegenerating] = useState(false);

 const loadBios = useCallback(async () => {
 if (!orgId) return;

 // Load org members with profiles
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId);

 // Load ai_work_profiles for bios
 const { data: workProfiles } = await supabase
 .from("ai_work_profiles")
 .select("user_id, profile_data")
 .eq("org_id", orgId);

 const bioMap = new Map<
 string,
 { bio: string; updated_at: string | null }
 >();
 for (const wp of workProfiles ?? []) {
 const pd = wp.profile_data as Record<string, unknown> | null;
 if (pd?.ai_bio) {
 bioMap.set(wp.user_id, {
 bio: pd.ai_bio as string,
 updated_at: (pd.ai_bio_updated_at as string) ?? null,
 });
 }
 }

 const cards: BioCard[] = (members ?? [])
 .map((m) => {
 const profile = m.profiles as unknown as Profile | null;
 const bioData = bioMap.get(m.user_id);
 return {
 user_id: m.user_id,
 name: profile?.full_name ?? profile?.email ??"?",
 avatar_url: profile?.avatar_url ?? null,
 bio: bioData?.bio ??"",
 updated_at: bioData?.updated_at ?? null,
 };
 })
 .sort((a, b) => {
 // Users with bios first
 if (a.bio && !b.bio) return -1;
 if (!a.bio && b.bio) return 1;
 return a.name.localeCompare(b.name);
 });

 setBios(cards);
 setLoading(false);
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (!orgId) return;
 loadBios();
 }, [orgId, loadBios]);

 async function regenerate() {
 if (!orgId) return;
 setRegenerating(true);

 try {
 await fetch("/api/claude-bio", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({ org_id: orgId }),
 });
 await loadBios();
 } finally {
 setRegenerating(false);
 }
 }

 if (orgLoading || loading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="flex flex-col items-center gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">
 Cargando...
 </p>
 </div>
 </div>
 );
 }

 const hasBios = bios.some((b) => b.bio);

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center justify-between mb-8">
 <div>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <Brain className="w-6 h-6 text-primary"/>
 Bios del equipo
 </h1>
 <p className="text-muted-foreground text-sm mt-1">
 Claude analiza los últimos 30 días y genera una bio brutalmente
 honesta para cada persona.
 </p>
 </div>
 <Button
 className="bg-primary text-white border-0 gap-2"onClick={regenerate}
 disabled={regenerating}
 >
 {regenerating ? (
 <Loader2 className="w-4 h-4 animate-spin"/>
 ) : (
 <RefreshCw className="w-4 h-4"/>
 )}
 {regenerating ?"Generando...":"Regenerar"}
 </Button>
 </div>

 {/* Regeneration loading state */}
 {regenerating && (
 <div className="mb-8 flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/10">
 <Loader2 className="w-5 h-5 text-primary animate-spin"/>
 <p className="text-sm text-muted-foreground">
 Claude está analizando los datos del equipo y generando las bios...
 esto puede tomar un momento.
 </p>
 </div>
 )}

 {/* Bio cards */}
 {hasBios ? (
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 {bios.map((b) => (
 <Card
 key={b.user_id}
 className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-5">
 <div className="flex items-start gap-3 mb-3">
 <Avatar className="w-10 h-10 ring-2 ring-background">
 <AvatarImage src={b.avatar_url ?? undefined} />
 <AvatarFallback>{getInitials(b.name)}</AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <p className="font-semibold text-sm truncate">{b.name}</p>
 {b.updated_at && (
 <p className="text-[10px] text-muted-foreground flex items-center gap-1">
 <Clock className="w-3 h-3"/>
 Actualizada {timeAgo(b.updated_at)}
 </p>
 )}
 </div>
 <Sparkles className="w-4 h-4 text-primary/30 shrink-0"/>
 </div>
 {b.bio ? (
 <p className="text-sm text-muted-foreground leading-relaxed">
 {b.bio}
 </p>
 ) : (
 <p className="text-sm text-muted-foreground italic">
 Sin bio todavía. Presiona &quot;Regenerar&quot; para generar.
 </p>
 )}
 </CardContent>
 </Card>
 ))}
 </div>
 ) : (
 <div className="flex flex-col items-center justify-center py-16 gap-4">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <Brain className="w-7 h-7 text-primary/40"/>
 </div>
 <div className="text-center">
 <p className="text-sm text-muted-foreground">
 No hay bios generadas todavía.
 </p>
 <p className="text-xs text-muted-foreground mt-1">
 Presiona &quot;Regenerar&quot; para que Claude analice al equipo.
 </p>
 </div>
 <Button
 className="bg-primary text-white border-0 gap-2"onClick={regenerate}
 disabled={regenerating}
 >
 <Brain className="w-4 h-4"/>
 Generar bios
 </Button>
 </div>
 )}
 </div>
 );
}
