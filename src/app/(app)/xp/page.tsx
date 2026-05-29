"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { Zap, TrendingUp, Star } from "lucide-react";

interface UserXpRow {
 user_id: string;
 total_xp: number;
 level: number;
 profile: Profile;
}

function xpForLevel(level: number): number {
 // Level = floor(sqrt(totalXP / 100)) + 1
 // So totalXP for level L = (L - 1)^2 * 100
 return (level - 1) * (level - 1) * 100;
}

function getLevelTitle(level: number): string {
 if (level >= 40) return"Leyenda";
 if (level >= 30) return"Maestro";
 if (level >= 20) return"Experto";
 if (level >= 15) return"Veterano";
 if (level >= 10) return"Profesional";
 if (level >= 5) return"Aprendiz";
 return"Novato";
}

function getLevelColor(level: number): string {
 if (level >= 40) return"from-yellow-400 to-amber-600";
 if (level >= 30) return"from-purple-400 to-purple-700";
 if (level >= 20) return"from-blue-400 to-blue-700";
 if (level >= 15) return"from-emerald-400 to-emerald-700";
 if (level >= 10) return"from-cyan-400 to-cyan-700";
 if (level >= 5) return"from-slate-400 to-slate-600";
 return"from-gray-300 to-gray-500";
}

export default function XpPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const supabase = createClient();
 const [users, setUsers] = useState<UserXpRow[]>([]);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 if (!orgId) return;

 async function load() {
 setLoading(true);

 const { data: xpData } = await supabase
 .from("user_xp")
 .select("user_id, total_xp, level")
 .eq("org_id", orgId!)
 .order("total_xp", { ascending: false });

 if (!xpData || xpData.length === 0) {
 // If no xp data yet, show members at level 1
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId!);

 setUsers(
 (members ?? []).map((m) => ({
 user_id: m.user_id,
 total_xp: 0,
 level: 1,
 profile: m.profiles as unknown as Profile,
 }))
 );
 setLoading(false);
 return;
 }

 // Fetch profiles for xp users
 const userIds = xpData.map((x) => x.user_id);
 const { data: profiles } = await supabase
 .from("profiles")
 .select("*")
 .in("id", userIds);

 const profileMap = new Map<string, Profile>();
 for (const p of profiles ?? []) {
 profileMap.set(p.id, p);
 }

 setUsers(
 xpData.map((x) => ({
 user_id: x.user_id,
 total_xp: x.total_xp,
 level: x.level,
 profile: profileMap.get(x.user_id) ?? {
 id: x.user_id,
 email:"?",
 full_name: null,
 avatar_url: null,
 role: null,
 timezone:"UTC",
 created_at:"",
 updated_at:"",
 },
 }))
 );
 setLoading(false);
 }
 load();
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 <div className="mb-6">
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <Zap className="w-6 h-6 text-primary"/>
 Sistema de XP
 </h1>
 <p className="text-muted-foreground text-sm">
 Gana experiencia por cada acción diaria. Sube de nivel con tu equipo.
 </p>
 </div>

 {/* XP Legend */}
 <Card className="mb-6">
 <CardContent className="p-4">
 <p className="text-xs font-medium text-muted-foreground mb-2">Acciones que dan XP</p>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
 <div className="bg-accent/40 px-3 py-2">
 <span className="font-semibold tabular-nums tracking-tight">+10</span>{""}
 <span className="text-muted-foreground">Registrar hora</span>
 </div>
 <div className="bg-accent/40 px-3 py-2">
 <span className="font-semibold tabular-nums tracking-tight">+20</span>{""}
 <span className="text-muted-foreground">Hora con evidencia</span>
 </div>
 <div className="bg-accent/40 px-3 py-2">
 <span className="font-semibold tabular-nums tracking-tight">+15</span>{""}
 <span className="text-muted-foreground">Standup</span>
 </div>
 <div className="bg-accent/40 px-3 py-2">
 <span className="font-semibold tabular-nums tracking-tight">+15</span>{""}
 <span className="text-muted-foreground">Closeout</span>
 </div>
 <div className="bg-accent/40 px-3 py-2">
 <span className="font-semibold tabular-nums tracking-tight">+30</span>{""}
 <span className="text-muted-foreground">Promesa cumplida</span>
 </div>
 <div className="bg-accent/40 px-3 py-2">
 <span className="font-semibold text-red-600 tabular-nums tracking-tight">-20</span>{""}
 <span className="text-muted-foreground">Promesa rota</span>
 </div>
 <div className="bg-accent/40 px-3 py-2">
 <span className="font-semibold tabular-nums tracking-tight">+5</span>{""}
 <span className="text-muted-foreground">Shoutout dado</span>
 </div>
 <div className="bg-accent/40 px-3 py-2">
 <span className="font-semibold tabular-nums tracking-tight">+10</span>{""}
 <span className="text-muted-foreground">Shoutout recibido</span>
 </div>
 </div>
 </CardContent>
 </Card>

 {orgLoading || loading ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 ) : users.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 bg-primary/10 flex items-center justify-center">
 <Zap className="w-7 h-7 text-primary/40"/>
 </div>
 <p className="text-sm text-muted-foreground">
 Todavía no hay datos de XP. Se calcula al procesar cada día.
 </p>
 </div>
 ) : (
 <div className="space-y-3">
 {users.map((u, index) => {
 const currentLevelXp = xpForLevel(u.level);
 const nextLevelXp = xpForLevel(u.level + 1);
 const xpInLevel = u.total_xp - currentLevelXp;
 const xpNeeded = nextLevelXp - currentLevelXp;
 const progress = xpNeeded > 0 ? Math.min(100, Math.round((xpInLevel / xpNeeded) * 100)) : 100;

 return (
 <Card
 key={u.user_id}
 className={cn(
"transition-all duration-300 hover:border-primary/30 hover:-translate-y-0.5",
 index === 0 &&
"border-yellow-300/60 dark:border-yellow-700/40 shadow-yellow-500/10 ring-1 ring-yellow-300/30")}
 >
 <CardContent className="p-4">
 <div className="flex items-center gap-4">
 {/* Rank */}
 <div className="w-8 text-center">
 {index === 0 ? (
 <Star className="w-5 h-5 text-yellow-500 mx-auto"/>
 ) : (
 <span className="text-lg font-bold text-muted-foreground tabular-nums tracking-tight">
 {index + 1}
 </span>
 )}
 </div>

 {/* Avatar */}
 <Avatar className="w-10 h-10 ring-2 ring-background">
 <AvatarImage src={u.profile.avatar_url ?? undefined} />
 <AvatarFallback>{getInitials(u.profile.full_name)}</AvatarFallback>
 </Avatar>

 {/* Info */}
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <h3 className="font-semibold truncate">
 {u.profile.full_name ?? u.profile.email}
 </h3>
 <Badge
 variant="secondary"className={cn(
"text-[10px] gap-1 text-white border-0",
`bg-gradient-to-r ${getLevelColor(u.level)}`)}
 >
 Nv. {u.level} — {getLevelTitle(u.level)}
 </Badge>
 </div>

 {/* Progress bar */}
 <div className="mt-2 flex items-center gap-3">
 <div className="flex-1 h-2 bg-accent rounded-full overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-500 bg-gradient-to-r",
 getLevelColor(u.level)
 )}
 style={{ width:`${progress}%`}}
 />
 </div>
 <span className="text-[10px] text-muted-foreground whitespace-nowrap tabular-nums tracking-tight">
 {xpInLevel} / {xpNeeded} XP
 </span>
 </div>
 </div>

 {/* Total XP */}
 <div className="text-center min-w-[70px]">
 <p className="text-2xl font-bold tabular-nums tracking-tight text-primary">
 {u.total_xp.toLocaleString()}
 </p>
 <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
 <TrendingUp className="w-3 h-3"/>
 XP total
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
