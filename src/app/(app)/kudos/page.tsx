"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TimeEntry } from "@/lib/types/database";
import { CATEGORIES, REACTIONS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Heart } from "lucide-react";

interface KudosEntry {
  id: string;
  reaction: string;
  comment: string | null;
  created_at: string;
  reactor: Profile;
  entry: TimeEntry & { profiles: Profile };
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatHour(h: number) {
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${suffix}`;
}

export default function KudosPage() {
  const [kudos, setKudos] = useState<KudosEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string }>();

      if (!membership) {
        setLoading(false);
        return;
      }

      // Get positive reactions (impressive + helped_me) with entry and profiles
      const { data: reactions } = await supabase
        .from("entry_reactions")
        .select(
          "id, reaction, comment, created_at, user_id, entry_id, time_entries(*, profiles(*))"
        )
        .in("reaction", ["impressive", "helped_me"])
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<
          {
            id: string;
            reaction: string;
            comment: string | null;
            created_at: string;
            user_id: string;
            entry_id: string;
            time_entries: TimeEntry & { profiles: Profile };
          }[]
        >();

      if (!reactions) {
        setLoading(false);
        return;
      }

      // Filter to only entries from this org
      const orgReactions = reactions.filter(
        (r) => r.time_entries?.org_id === membership.org_id
      );

      // Get reactor profiles
      const reactorIds = [...new Set(orgReactions.map((r) => r.user_id))];
      const { data: reactorProfiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", reactorIds.length > 0 ? reactorIds : ["none"])
        .returns<Profile[]>();

      const profileMap = new Map(
        reactorProfiles?.map((p) => [p.id, p]) ?? []
      );

      const kudosList: KudosEntry[] = orgReactions
        .filter((r) => r.time_entries && profileMap.has(r.user_id))
        .map((r) => ({
          id: r.id,
          reaction: r.reaction,
          comment: r.comment,
          created_at: r.created_at,
          reactor: profileMap.get(r.user_id)!,
          entry: r.time_entries,
        }));

      setKudos(kudosList);
      setLoading(false);
    }

    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Heart className="w-6 h-6 text-pink-500" />
        <h1 className="text-2xl font-bold tracking-tight">Kudos</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Reconocimientos del equipo
      </p>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      ) : kudos.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground">
            No hay kudos todavia. Reacciona a las entradas de tus companeros
            con "Impresionante" o "Me ayudo".
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {kudos.map((k) => {
            const reactionInfo =
              REACTIONS[k.reaction as keyof typeof REACTIONS];
            const cat = CATEGORIES[k.entry.category];

            return (
              <Card key={k.id} className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                <CardContent className="p-4">
                  {/* Who gave the kudos */}
                  <div className="flex items-center gap-2 mb-3">
                    <Avatar className="w-7 h-7 ring-2 ring-background shadow-sm">
                      <AvatarImage
                        src={k.reactor.avatar_url ?? undefined}
                      />
                      <AvatarFallback className="text-[10px]">
                        {getInitials(k.reactor.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">
                          {k.reactor.full_name ?? k.reactor.email}
                        </span>{" "}
                        reacciono con{" "}
                        <Badge
                          variant="outline"
                          className="text-[10px] inline-flex"
                        >
                          {reactionInfo.emoji} {reactionInfo.label}
                        </Badge>
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(k.created_at), "d MMM HH:mm", {
                        locale: es,
                      })}
                    </span>
                  </div>

                  {/* The entry that received kudos */}
                  <div className="bg-muted/30 rounded-lg p-3 border">
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar className="w-5 h-5">
                        <AvatarImage
                          src={k.entry.profiles?.avatar_url ?? undefined}
                        />
                        <AvatarFallback className="text-[8px]">
                          {getInitials(k.entry.profiles?.full_name ?? null)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">
                        {k.entry.profiles?.full_name ?? ""}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px]", cat.color, cat.bgColor)}
                      >
                        {cat.emoji} {cat.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {k.entry.date} {formatHour(k.entry.hour)}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{k.entry.title}</p>
                    {k.entry.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {k.entry.description}
                      </p>
                    )}
                  </div>

                  {k.comment && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      &quot;{k.comment}&quot;
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
