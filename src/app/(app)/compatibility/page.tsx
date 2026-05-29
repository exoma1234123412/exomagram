"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { subDays } from "date-fns";
import { GitMerge, Users, Zap } from "lucide-react";

interface PairData {
 userA: Profile;
 userB: Profile;
 sharedProjectHours: number;
 overlapHours: number; // same hour slots
 complementaryScore: number; // how well they cover different hours
 interactionScore: number; // combined metric 0-100
}

export default function CompatibilityPage() {
 const { orgId, loading: orgLoading } = useOrg();
 const [pairs, setPairs] = useState<PairData[]>([]);
 const [loading, setLoading] = useState(true);
 const [memberProfiles, setMemberProfiles] = useState<Map<string, Profile>>(new Map());
 const supabase = createClient();

 useEffect(() => {
 if (!orgId) {
 if (!orgLoading) setLoading(false);
 return;
 }

 async function load() {
 const startDate = subDays(new Date(), 30).toISOString().split("T")[0];

 const [{ data: members }, { data: entries }] = await Promise.all([
 supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId!)
 ,
 supabase
 .from("time_entries")
 .select("user_id, date, hour, project, category")
 .eq("org_id", orgId!)
 .gte("date", startDate),
 ]);

 if (!members || !entries || members.length < 2) { setLoading(false); return; }

 const profileMap = new Map<string, Profile>(members.map((m) => [m.user_id, m.profiles as Profile]));
 setMemberProfiles(profileMap);

 // Build per-user data structures
 const userSlots = new Map<string, Set<string>>(); // user -> set of"date-hour"
const userProjects = new Map<string, Map<string, number>>(); // user -> project -> hours

 for (const e of entries) {
 const slotKey =`${e.date}-${e.hour}`;
 const slots = userSlots.get(e.user_id) ?? new Set();
 slots.add(slotKey);
 userSlots.set(e.user_id, slots);

 if (e.project) {
 const projects = userProjects.get(e.user_id) ?? new Map();
 projects.set(e.project, (projects.get(e.project) ?? 0) + 1);
 userProjects.set(e.user_id, projects);
 }
 }

 // Calculate pair metrics
 const userIds = members.map((m) => m.user_id);
 const pairResults: PairData[] = [];

 for (let i = 0; i < userIds.length; i++) {
 for (let j = i + 1; j < userIds.length; j++) {
 const a = userIds[i];
 const b = userIds[j];
 const slotsA = userSlots.get(a) ?? new Set();
 const slotsB = userSlots.get(b) ?? new Set();

 // Overlap: same time slots
 let overlapCount = 0;
 for (const slot of slotsA) {
 if (slotsB.has(slot)) overlapCount++;
 }

 // Shared projects
 const projA = userProjects.get(a) ?? new Map();
 const projB = userProjects.get(b) ?? new Map();
 let sharedProjectHours = 0;
 for (const [proj, hoursA] of projA) {
 const hoursB = projB.get(proj) ?? 0;
 if (hoursB > 0) sharedProjectHours += Math.min(hoursA, hoursB);
 }

 // Complementary: how well they cover different hours (diversity)
 const allSlots = new Set([...slotsA, ...slotsB]);
 const unionSize = allSlots.size;
 const complementary = unionSize > 0 ? Math.round(((unionSize - overlapCount) / unionSize) * 100) : 0;

 // Interaction score
 const interactionScore = Math.min(100, Math.round(
 sharedProjectHours * 5 + overlapCount * 2 + complementary * 0.3
 ));

 if (interactionScore > 5 || sharedProjectHours > 0) {
 pairResults.push({
 userA: profileMap.get(a)!,
 userB: profileMap.get(b)!,
 sharedProjectHours,
 overlapHours: overlapCount,
 complementaryScore: complementary,
 interactionScore,
 });
 }
 }
 }

 pairResults.sort((a, b) => b.interactionScore - a.interactionScore);
 setPairs(pairResults);
 setLoading(false);
 }
 load();
 }, [orgId, orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 <div className="flex items-center gap-3 mb-2">
 <GitMerge className="w-6 h-6 text-primary"/>
 <h1 className="text-2xl font-bold tracking-tight">Compatibilidad</h1>
 </div>
 <p className="text-muted-foreground text-sm mb-6">
 Patrones de colaboracion entre miembros (30 dias)
 </p>

 {loading || orgLoading ? (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 ) : pairs.length === 0 ? (
 <div className="text-center py-20 text-muted-foreground">
 No hay suficientes datos de colaboracion todavia.
 </div>
 ) : (
 <div className="space-y-3">
 {pairs.map((p, i) => (
 <Card key={`${p.userA.id}-${p.userB.id}`}>
 <CardContent className="p-4">
 <div className="flex items-center gap-4">
 <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>

 <div className="flex items-center gap-2 flex-1 min-w-0">
 <div className="flex -space-x-2">
 <Avatar className="w-9 h-9 border-2 border-background">
 <AvatarImage src={p.userA.avatar_url ?? undefined} />
 <AvatarFallback className="text-[10px]">{getInitials(p.userA.full_name)}</AvatarFallback>
 </Avatar>
 <Avatar className="w-9 h-9 border-2 border-background">
 <AvatarImage src={p.userB.avatar_url ?? undefined} />
 <AvatarFallback className="text-[10px]">{getInitials(p.userB.full_name)}</AvatarFallback>
 </Avatar>
 </div>
 <div className="min-w-0">
 <p className="text-sm font-medium truncate">
 {p.userA.full_name?.split("")[0]} & {p.userB.full_name?.split("")[0]}
 </p>
 </div>
 </div>

 <div className="flex items-center gap-3 shrink-0">
 {p.sharedProjectHours > 0 && (
 <div className="text-center">
 <p className="text-sm font-bold text-primary">{p.sharedProjectHours}h</p>
 <p className="text-[9px] text-muted-foreground">proyecto comun</p>
 </div>
 )}
 <div className="text-center">
 <p className="text-sm font-bold">{p.overlapHours}h</p>
 <p className="text-[9px] text-muted-foreground">overlap</p>
 </div>
 <div className="text-center">
 <p className="text-sm font-bold">{p.complementaryScore}%</p>
 <p className="text-[9px] text-muted-foreground">complemento</p>
 </div>
 <div className={cn(
"w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
 p.interactionScore >= 60 ?"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400":
 p.interactionScore >= 30 ?"bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400":
"bg-muted text-muted-foreground")}>
 {p.interactionScore}
 </div>
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}
 </div>
 );
}
