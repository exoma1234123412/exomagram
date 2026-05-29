"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Brain, Send, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function FloatingAIButton() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (m) setOrgId(m.org_id);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!orgId || !input.trim()) return;

    const question = input.trim();
    const userMsg: ChatMessage = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/claude-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "ask",
          org_id: orgId,
          question,
          user_id: userId,
          date: new Date().toISOString().split("T")[0],
        }),
      });
      const data = await res.json();

      const content =
        typeof data.response === "string"
          ? data.response
          : JSON.stringify(data.response, null, 2);

      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error conectando con Claude." },
      ]);
    }
    setLoading(false);
  }, [orgId, userId, input]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-40 bottom-20 right-4 md:bottom-6 md:right-6",
          "w-12 h-12 rounded-full",
          "bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-600/25",
          "flex items-center justify-center",
          "text-white",
          "transition-all duration-200 hover:scale-105 active:scale-95",
          "focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
        )}
        aria-label="Abrir Claude Brain"
      >
        <Brain className="w-5 h-5" />
      </button>

      {/* Chat sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-[85vh] md:h-[70vh] md:max-w-lg md:mx-auto md:rounded-t-2xl flex flex-col p-0"
        >
          {/* Header */}
          <SheetHeader className="border-b px-4 py-3 flex-row items-center justify-between gap-2 space-y-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Brain className="w-4 h-4 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-sm">Claude Brain</SheetTitle>
                <SheetDescription className="text-[10px]">
                  Pregunta lo que quieras sobre el equipo
                </SheetDescription>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </SheetHeader>

          {/* Messages */}
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Brain className="w-8 h-8 text-primary/40" />
                </div>
                <p className="text-muted-foreground text-sm">
                  Claude tiene acceso a los datos de tu equipo.
                </p>
                <p className="text-muted-foreground/60 text-xs mt-1">
                  Escribe tu pregunta abajo.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent/60 border"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-accent/60 border rounded-2xl px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Claude está pensando...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="border-t px-4 py-3 flex gap-2 safe-area-pb"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pregunta sobre el equipo..."
              disabled={loading}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              size="icon"
              className="rounded-xl"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
