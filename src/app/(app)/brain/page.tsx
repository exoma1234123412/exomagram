// @ts-nocheck
"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Brain,
  Send,
  Loader2,
  Search,
  Shield,
  Swords,
  Users,
  Telescope,
  Zap,
  Coffee,
  Flame,
  User,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  mode?: string;
  data?: Record<string, unknown>;
}

const QUICK_ACTIONS = [
  { mode: "ask", label: "Pregunta libre", icon: Search, placeholder: "¿Quién es el más productivo esta semana?" },
  { mode: "conflict_detector", label: "Detectar conflictos", icon: Swords, placeholder: "" },
  { mode: "team_optimizer", label: "Optimizar equipo", icon: Users, placeholder: "" },
  { mode: "future_sim", label: "Simular futuro", icon: Telescope, placeholder: "" },
];

export default function BrainPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.org_id);
      const { data: memberData } = await supabase.from("org_members").select("user_id, profiles(*)").eq("org_id", m.org_id)
        ;
      setMembers(memberData?.map((md) => md.profiles) ?? []);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage(mode: string, question?: string, targetUserId?: string) {
    if (!orgId) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error: No se pudo cargar tu organización. Recarga la página." }]);
      return;
    }
    if (mode === "ask" && !question?.trim()) return;

    const userMsg: Message = {
      role: "user",
      content: question || QUICK_ACTIONS.find((a) => a.mode === mode)?.label || mode,
      mode,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/claude-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          org_id: orgId,
          question,
          user_id: targetUserId || userId,
          date: new Date().toISOString().split("T")[0],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Claude Brain API error:", res.status, errorText);
        setMessages((prev) => [...prev, { role: "assistant", content: `Error ${res.status}: ${errorText.slice(0, 200)}` }]);
        setLoading(false);
        return;
      }

      const data = await res.json();

      const assistantMsg: Message = {
        role: "assistant",
        content: data.error ? `Error: ${data.error}` : typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2),
        mode,
        data: typeof data.response === "object" ? data.response : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error("Claude Brain fetch error:", err);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error conectando: ${err instanceof Error ? err.message : "Unknown error"}` }]);
    }
    setLoading(false);
  }

  function renderResponse(msg: Message) {
    if (!msg.data) {
      // Render as formatted text
      return (
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {msg.content}
        </div>
      );
    }

    const d = msg.data;

    // Render structured data beautifully based on mode
    return (
      <div className="space-y-3">
        {/* Generic: render all string values as paragraphs, arrays as lists */}
        {Object.entries(d).map(([key, value]) => {
          if (value === null || value === undefined) return null;

          const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

          if (typeof value === "string") {
            return (
              <div key={key}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">{label}</p>
                <p className="text-sm">{value}</p>
              </div>
            );
          }

          if (typeof value === "number") {
            return (
              <div key={key} className="inline-flex mr-4 mb-2">
                <Badge variant="outline" className="text-xs">
                  {label}: {value}
                </Badge>
              </div>
            );
          }

          if (typeof value === "boolean") {
            return (
              <div key={key} className="inline-flex mr-2 mb-2">
                <Badge variant={value ? "destructive" : "secondary"} className="text-xs">
                  {value ? "SI" : "NO"}: {label}
                </Badge>
              </div>
            );
          }

          if (Array.isArray(value)) {
            if (value.length === 0) return null;
            if (typeof value[0] === "string") {
              return (
                <div key={key}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">{label}</p>
                  {value.map((item, i) => (
                    <p key={i} className="text-sm text-muted-foreground mb-0.5">- {item}</p>
                  ))}
                </div>
              );
            }
            // Array of objects
            return (
              <div key={key}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">{label}</p>
                {value.map((item, i) => (
                  <Card key={i} className="mb-2">
                    <CardContent className="p-3 text-xs">
                      {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                        <p key={k}>
                          <span className="font-semibold">{k.replace(/_/g, " ")}:</span>{" "}
                          {typeof v === "number" ? <Badge variant="outline" className="text-[10px] ml-1">{String(v)}</Badge> : String(v)}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          }

          if (typeof value === "object") {
            return (
              <div key={key}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">{label}</p>
                <pre className="text-xs bg-accent/40 p-2 rounded-lg overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto px-4 sm:px-6 py-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          Claude Brain
        </h1>
        <p className="text-muted-foreground text-xs">
          Pregúntale cualquier cosa sobre el equipo. Claude tiene acceso a TODO.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_ACTIONS.map((action) => (
          <Button
            key={action.mode}
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => action.mode === "ask" ? null : sendMessage(action.mode)}
            disabled={loading}
          >
            <action.icon className="w-3 h-3" />
            {action.label}
          </Button>
        ))}

        {/* Per-person actions */}
        <div className="flex items-center gap-1 ml-2">
          <span className="text-[10px] text-muted-foreground mr-1">Hot seat:</span>
          {members.slice(0, 5).map((m) => (
            <Button
              key={m.id}
              variant="ghost"
              size="sm"
              className="text-[10px] h-7 px-2"
              onClick={() => sendMessage("personality_profile", undefined, m.id)}
              disabled={loading}
            >
              <User className="w-3 h-3 mr-1" />
              {m.full_name?.split(" ")[0]}
            </Button>
          ))}
        </div>

        {/* More actions */}
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={loading}
            onClick={() => sendMessage("morning_briefing")}>
            <Coffee className="w-3 h-3" /> Mi briefing
          </Button>
          <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={loading}
            onClick={() => sendMessage("evening_roast")}>
            <Flame className="w-3 h-3" /> Roast del día
          </Button>
        </div>
      </div>

      {/* Chat area */}
      <div ref={chatRef} className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Brain className="w-16 h-16 text-primary/20 mb-4" />
            <p className="text-muted-foreground text-sm">Claude tiene acceso a 30 días de datos de tu equipo.</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Pregunta lo que quieras o usa las acciones rápidas arriba.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3",
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-accent/60 border"
            )}>
              {msg.role === "user" ? (
                <p className="text-sm">{msg.content}</p>
              ) : (
                renderResponse(msg)
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-accent/60 border rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Claude está pensando...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={(e) => { e.preventDefault(); sendMessage("ask", input); }} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregúntale a Claude sobre el equipo..."
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !input.trim()} size="icon">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
