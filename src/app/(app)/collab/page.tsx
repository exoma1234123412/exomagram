"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { GitBranch, ArrowRight } from "lucide-react";

interface CollabEdge {
  from: Profile;
  to: Profile;
  strength: number; // 1-10
  types: string[]; // ['meeting', 'shoutout', 'verification']
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function CollabPage() {
  const [edges, setEdges] = useState<CollabEdge[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();
      if (!membership) { setLoading(false); return; }

      const orgId = membership.org_id;

      // Get members
      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId)
        .returns<{ user_id: string; profiles: Profile }[]>();

      if (!memberData) { setLoading(false); return; }

      const profiles = memberData.map((m) => m.profiles);
      setMembers(profiles);
      const profileMap = new Map(profiles.map((p) => [p.id, p]));

      // Build collaboration graph from:
      // 1. Shoutouts
      const { data: shoutouts } = await supabase
        .from("shoutouts")
        .select("from_user_id, to_user_id")
        .eq("org_id", orgId);

      // 2. Reactions on each other's entries
      const { data: entries } = await supabase
        .from("time_entries")
        .select("id, user_id")
        .eq("org_id", orgId);

      const entryOwner = new Map<string, string>();
      for (const e of entries ?? []) entryOwner.set(e.id, e.user_id);

      const { data: reactions } = await supabase
        .from("entry_reactions")
        .select("entry_id, user_id")
        .eq("reaction", "verified");

      // 3. Same-hour meetings (people in meetings at the same hour = connected)
      const { data: meetingEntries } = await supabase
        .from("time_entries")
        .select("user_id, date, hour")
        .eq("org_id", orgId)
        .eq("category", "meeting");

      // Build edge weights
      const edgeMap = new Map<string, { weight: number; types: Set<string> }>();

      function addEdge(from: string, to: string, type: string, weight: number = 1) {
        if (from === to) return;
        const key = [from, to].sort().join("-");
        const existing = edgeMap.get(key) ?? { weight: 0, types: new Set() };
        existing.weight += weight;
        existing.types.add(type);
        edgeMap.set(key, existing);
      }

      // Shoutouts (weight = 3)
      for (const s of shoutouts ?? []) {
        addEdge(s.from_user_id, s.to_user_id, "shoutout", 3);
      }

      // Reactions (weight = 1)
      for (const r of reactions ?? []) {
        const owner = entryOwner.get(r.entry_id);
        if (owner) addEdge(r.user_id, owner, "verification", 1);
      }

      // Co-meetings (weight = 2)
      const meetingSlots = new Map<string, string[]>(); // "date-hour" -> user_ids
      for (const m of meetingEntries ?? []) {
        const key = `${m.date}-${m.hour}`;
        const list = meetingSlots.get(key) ?? [];
        list.push(m.user_id);
        meetingSlots.set(key, list);
      }
      for (const [, userIds] of meetingSlots) {
        if (userIds.length < 2) continue;
        for (let i = 0; i < userIds.length; i++) {
          for (let j = i + 1; j < userIds.length; j++) {
            addEdge(userIds[i], userIds[j], "meeting", 2);
          }
        }
      }

      // Convert to edges
      const maxWeight = Math.max(...Array.from(edgeMap.values()).map((e) => e.weight), 1);
      const collabEdges: CollabEdge[] = Array.from(edgeMap.entries()).map(([key, val]) => {
        const [fromId, toId] = key.split("-");
        return {
          from: profileMap.get(fromId)!,
          to: profileMap.get(toId)!,
          strength: Math.min(10, Math.round((val.weight / maxWeight) * 10)),
          types: Array.from(val.types),
        };
      }).filter((e) => e.from && e.to).sort((a, b) => b.strength - a.strength);

      setEdges(collabEdges);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  // Calculate "most connected" and "most isolated"
  const connectionCount = new Map<string, number>();
  for (const edge of edges) {
    connectionCount.set(edge.from.id, (connectionCount.get(edge.from.id) ?? 0) + edge.strength);
    connectionCount.set(edge.to.id, (connectionCount.get(edge.to.id) ?? 0) + edge.strength);
  }

  const mostConnected = members.sort((a, b) =>
    (connectionCount.get(b.id) ?? 0) - (connectionCount.get(a.id) ?? 0)
  );

  const TYPE_EMOJI: Record<string, string> = {
    shoutout: "⭐",
    verification: "✅",
    meeting: "🤝",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-primary" />
          Mapa de Colaboración
        </h1>
        <p className="text-muted-foreground text-sm">
          Quién trabaja con quién — basado en reuniones, verificaciones y shoutouts
        </p>
      </div>

      {/* Connection ranking */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Conectividad del equipo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mostConnected.map((m, i) => {
              const score = connectionCount.get(m.id) ?? 0;
              const maxScore = connectionCount.get(mostConnected[0]?.id) ?? 1;
              const percent = Math.round((score / maxScore) * 100);
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-muted-foreground w-6">{i + 1}</span>
                  <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm">
                    <AvatarImage src={m.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">{getInitials(m.full_name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium w-32 truncate">{m.full_name ?? m.email}</span>
                  <div className="flex-1 h-3 bg-muted/30 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{score}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Edge list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conexiones ({edges.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {edges.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No hay conexiones detectadas. Las conexiones se generan con shoutouts, verificaciones y reuniones compartidas.
            </p>
          ) : (
            <div className="space-y-2">
              {edges.slice(0, 20).map((edge, i) => (
                <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                  <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm">
                    <AvatarImage src={edge.from.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">{getInitials(edge.from.full_name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm truncate max-w-[100px]">{edge.from.full_name?.split(" ")[0]}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm">
                    <AvatarImage src={edge.to.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">{getInitials(edge.to.full_name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm truncate max-w-[100px]">{edge.to.full_name?.split(" ")[0]}</span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-1">
                    {edge.types.map((t) => (
                      <span key={t} className="text-xs" title={t}>{TYPE_EMOJI[t] ?? "🔗"}</span>
                    ))}
                  </div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <div key={j} className={cn(
                        "w-1.5 h-3 rounded-full",
                        j < edge.strength ? "bg-blue-500" : "bg-muted/30"
                      )} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
