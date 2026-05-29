"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import { Brain, MessageSquare, AlertTriangle, Sparkles, Target, CheckCircle2 } from "lucide-react";

interface OneOnOneData {
  agenda_items: Array<{
    topic: string;
    talking_points: string[];
    tone: string;
    data_backing: string;
  }>;
  opening_question: string;
  hard_question: string;
  praise_point: string;
  development_area: string;
  action_items_suggestion: string[];
}

export default function OneOnOnePage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [data, setData] = useState<OneOnOneData | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.org_id);
      const { data: memberData } = await supabase.from("org_members").select("user_id, profiles(*)").eq("org_id", m.org_id)
        ;
      setMembers(memberData?.map((md) => md.profiles) ?? []);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function generateAgenda(userId: string, name: string) {
    if (!orgId) return;
    setSelectedUser(userId);
    setSelectedName(name);
    setLoading(true);
    setData(null);

    const res = await fetch("/api/claude-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, user_id: userId, type: "one_on_one_prep" }),
    });
    const json = await res.json();
    if (json.response && typeof json.response === "object") setData(json.response);
    setLoading(false);
  }

  const toneIcon: Record<string, typeof Sparkles> = {
    praise: Sparkles,
    concern: AlertTriangle,
    neutral: MessageSquare,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-primary" />
          Prep de 1:1
        </h1>
        <p className="text-muted-foreground text-sm">
          Claude genera la agenda de tu 1:1 basada en datos reales. No más reuniones improvisadas.
        </p>
      </div>

      {/* Member selector */}
      <div className="flex flex-wrap gap-3 mb-8">
        {members.map((m) => (
          <Button
            key={m.id}
            variant={selectedUser === m.id ? "default" : "outline"}
            onClick={() => generateAgenda(m.id, m.full_name ?? "?")}
            disabled={loading}
            className="gap-2"
          >
            <Avatar className="w-6 h-6">
              <AvatarImage src={m.avatar_url ?? undefined} />
              <AvatarFallback className="text-[9px]">{getInitials(m.full_name)}</AvatarFallback>
            </Avatar>
            {m.full_name}
          </Button>
        ))}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Brain className="w-10 h-10 text-primary animate-pulse" />
          <p className="text-sm text-muted-foreground">Claude está preparando la agenda para tu 1:1 con {selectedName}...</p>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-6">
          {/* Opening */}
          <Card className="border-primary/20">
            <CardContent className="p-5">
              <p className="text-[10px] font-semibold text-primary uppercase mb-2">Pregunta para abrir</p>
              <p className="text-lg font-medium">&ldquo;{data.opening_question}&rdquo;</p>
            </CardContent>
          </Card>

          {/* Agenda items */}
          <div className="space-y-4">
            {data.agenda_items?.map((item, i) => {
              const ToneIcon = toneIcon[item.tone] ?? MessageSquare;
              return (
                <Card key={i} className={cn(
                  "border transition-all",
                  item.tone === "concern" && "border-orange-200 dark:border-orange-800",
                  item.tone === "praise" && "border-green-200 dark:border-green-800",
                )}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                        item.tone === "praise" ? "bg-green-100 dark:bg-green-900/30" :
                        item.tone === "concern" ? "bg-orange-100 dark:bg-orange-900/30" :
                        "bg-accent/40"
                      )}>
                        <ToneIcon className={cn("w-4 h-4",
                          item.tone === "praise" ? "text-green-600" :
                          item.tone === "concern" ? "text-orange-600" :
                          "text-muted-foreground"
                        )} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{item.topic}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 italic">{item.data_backing}</p>
                        <ul className="mt-2 space-y-1">
                          {item.talking_points.map((tp, j) => (
                            <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-primary mt-1">-</span> {tp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Hard question */}
          <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10">
            <CardContent className="p-5">
              <p className="text-[10px] font-bold text-red-600 uppercase mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> La pregunta incómoda
              </p>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">&ldquo;{data.hard_question}&rdquo;</p>
            </CardContent>
          </Card>

          {/* Praise + Development */}
          <div className="grid grid-cols-2 gap-4">
            {data.praise_point && (
              <Card className="border-green-200 dark:border-green-800">
                <CardContent className="p-4">
                  <p className="text-[10px] font-bold text-green-600 uppercase mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Reconocer
                  </p>
                  <p className="text-sm">{data.praise_point}</p>
                </CardContent>
              </Card>
            )}
            {data.development_area && (
              <Card className="border-orange-200 dark:border-orange-800">
                <CardContent className="p-4">
                  <p className="text-[10px] font-bold text-orange-600 uppercase mb-1 flex items-center gap-1">
                    <Target className="w-3 h-3" /> Área de desarrollo
                  </p>
                  <p className="text-sm">{data.development_area}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Action items */}
          {data.action_items_suggestion?.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <p className="text-[10px] font-semibold text-primary uppercase mb-3 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Action items sugeridos
                </p>
                <div className="space-y-2">
                  {data.action_items_suggestion.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">{i + 1}</div>
                      <p className="text-sm">{item}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
