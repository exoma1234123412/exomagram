"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { cn, getInitials } from "@/lib/utils";
import { Heart, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const SHOUTOUT_CATEGORIES: Record<string, { label: string; emoji: string; color: string }> = {
 helped_me: { label:"Me ayudó", emoji:"--", color:"bg-blue-100 dark:bg-blue-900/40"},
 great_work: { label:"Gran trabajo", emoji:"--", color:"bg-orange-100 dark:bg-orange-900/40"},
 team_player: { label:"Team player", emoji:"--", color:"bg-green-100 dark:bg-green-900/40"},
 problem_solver: { label:"Problem solver", emoji:"🧠", color:"bg-blue-100 dark:bg-blue-900/40"},
 above_and_beyond: { label:"Más allá", emoji:"--", color:"bg-yellow-100 dark:bg-yellow-900/40"},
};

interface Shoutout {
 id: string;
 from_user_id: string;
 to_user_id: string;
 message: string;
 category: string;
 date: string;
 created_at: string;
 from_profile: Profile;
 to_profile: Profile;
}

export default function ShoutoutsPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [shoutouts, setShoutouts] = useState<Shoutout[]>([]);
 const [members, setMembers] = useState<Profile[]>([]);
 const [toUserId, setToUserId] = useState("");
 const [message, setMessage] = useState("");
 const [category, setCategory] = useState("");
 const [loading, setLoading] = useState(true);
 const [submitting, setSubmitting] = useState(false);
 const supabase = createClient();

 useEffect(() => {
 if (orgLoading) return;
 if (!orgId || !userId) { setLoading(false); return; }

 async function load() {
 const [{ data: memberData }, { data: shoutoutData }] = await Promise.all([
 supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId!)
 ,
 supabase
 .from("shoutouts")
 .select("*")
 .eq("org_id", orgId!)
 .order("created_at", { ascending: false })
 .limit(50),
 ]);

 if (memberData) {
 setMembers(memberData.map((m) => m.profiles).filter((p) => p.id !== userId));
 }

 // Manually attach profiles to shoutouts
 if (shoutoutData && memberData) {
 const profileMap = new Map<string, Profile>();
 for (const m of memberData) profileMap.set(m.user_id, m.profiles);

 const enriched = shoutoutData.map((s) => ({
 ...s,
 from_profile: profileMap.get(s.from_user_id)!,
 to_profile: profileMap.get(s.to_user_id)!,
 })) as Shoutout[];
 setShoutouts(enriched);
 }

 setLoading(false);
 }
 load();
 }, [orgLoading, orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!toUserId || !category || !orgId || !userId) return;
 setSubmitting(true);

 await supabase.from("shoutouts").insert({
 from_user_id: userId,
 to_user_id: toUserId,
 org_id: orgId,
 message,
 category,
 });

 // Refresh
 setMessage("");
 setToUserId("");
 setCategory("");

 const { data } = await supabase
 .from("shoutouts")
 .select("*")
 .eq("org_id", orgId)
 .order("created_at", { ascending: false })
 .limit(50);

 if (data) {
 const { data: memberData } = await supabase
 .from("org_members")
 .select("user_id, profiles(*)")
 .eq("org_id", orgId)
 ;

 if (memberData) {
 const profileMap = new Map<string, Profile>();
 for (const m of memberData) profileMap.set(m.user_id, m.profiles);
 setShoutouts(
 data.map((s) => ({
 ...s,
 from_profile: profileMap.get(s.from_user_id)!,
 to_profile: profileMap.get(s.to_user_id)!,
 })) as Shoutout[]
 );
 }
 }
 setSubmitting(false);
 }

 if (loading) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 );
 }

 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
 <div className="mb-8">
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <Sparkles className="w-6 h-6 text-yellow-500"/>
 Shoutouts
 </h1>
 <p className="text-muted-foreground text-sm">Reconoce el buen trabajo de tu equipo</p>
 </div>

 {/* Give shoutout form */}
 <Card className="mb-8">
 <CardContent className="p-6">
 <form onSubmit={handleSubmit} className="space-y-4">
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-2">
 <Label>¿Para quién?</Label>
 <Select value={toUserId} onValueChange={(v) => v && setToUserId(v)}>
 <SelectTrigger>
 <SelectValue placeholder="Selecciona"/>
 </SelectTrigger>
 <SelectContent>
 {members.map((m) => (
 <SelectItem key={m.id} value={m.id}>
 {m.full_name ?? m.email}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>Categoría</Label>
 <Select value={category} onValueChange={(v) => v && setCategory(v)}>
 <SelectTrigger>
 <SelectValue placeholder="Tipo"/>
 </SelectTrigger>
 <SelectContent>
 {Object.entries(SHOUTOUT_CATEGORIES).map(([key, cat]) => (
 <SelectItem key={key} value={key}>
 {cat.emoji} {cat.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <div className="space-y-2">
 <Label>Mensaje</Label>
 <Textarea
 placeholder="¿Por qué quieres reconocer a esta persona?"value={message}
 onChange={(e) => setMessage(e.target.value)}
 required
 minLength={5}
 rows={2}
 />
 </div>
 <Button type="submit"disabled={submitting || !toUserId || !category} className="bg-primary hover:from-blue-700 hover:to-blue-800 text-white border-0">
 {submitting ?"Enviando...":"Dar shoutout"}
 </Button>
 </form>
 </CardContent>
 </Card>

 {/* Feed */}
 {shoutouts.length === 0 ? (
 <p className="text-center text-muted-foreground py-10">
 Aún no hay shoutouts. Sé el primero en reconocer a alguien.
 </p>
 ) : (
 <div className="space-y-3">
 {shoutouts.map((s) => {
 const cat = SHOUTOUT_CATEGORIES[s.category];
 return (
 <Card key={s.id} className="transition-all duration-300 hover:border-primary/30">
 <CardContent className="p-4">
 <div className="flex items-start gap-3">
 <Avatar className="w-8 h-8 ring-2 ring-background">
 <AvatarImage src={s.from_profile?.avatar_url ?? undefined} />
 <AvatarFallback className="text-xs">
 {getInitials(s.from_profile?.full_name)}
 </AvatarFallback>
 </Avatar>
 <div className="flex-1">
 <p className="text-sm">
 <span className="font-semibold">{s.from_profile?.full_name ??"?"}</span>
 {"→"}
 <span className="font-semibold">{s.to_profile?.full_name ??"?"}</span>
 </p>
 <p className="text-sm mt-1">{s.message}</p>
 <div className="flex items-center gap-2 mt-2">
 <Badge className={cn("text-xs", cat?.color)}>
 {cat?.emoji} {cat?.label}
 </Badge>
 <span className="text-[10px] text-muted-foreground">
 {format(new Date(s.created_at),"d MMM, h:mm a", { locale: es })}
 </span>
 </div>
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
