"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Send, Zap } from "lucide-react";

// Ultra-fast entry: pick category + type title, done in 5 seconds
export function QuickLog({ orgId }: { orgId: string }) {
  const [category, setCategory] = useState<WorkCategory | "">("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || title.length < 10) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const now = new Date();
    const { error } = await supabase.from("time_entries").upsert({
      user_id: user.id,
      org_id: orgId,
      date: now.toISOString().split("T")[0],
      hour: now.getHours(),
      category,
      title,
      logged_at: now.toISOString(),
      is_late: false,
      minutes_late: 0,
      verification_status: "unverified",
    }, { onConflict: "user_id,org_id,date,hour" });

    if (!error) {
      // Capture values before resetting state
      const savedTitle = title;
      const savedCategory = category;

      setSuccess(true);
      setTitle("");
      setCategory("");
      setTimeout(() => setSuccess(false), 2000);

      // Fire claude-react in background (fire and forget)
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single()
        .then(({ data: profile }) => {
          fetch("/api/claude-react", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              org_id: orgId,
              event_type: "entry_created",
              event_data: {
                user_name: profile?.full_name ?? "Usuario",
                title: savedTitle,
                category: savedCategory,
                hour: now.getHours(),
                has_proof: false,
              },
            }),
          }).catch(() => {});
        });
    }
    setLoading(false);
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
          <Zap className="w-4 h-4 text-yellow-500" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground uppercase">Quick Log — {new Date().getHours()}:00</span>
        {success && <span className="text-xs text-green-600 font-medium ml-auto">Guardado</span>}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        {/* Category quick-pick */}
        <div className="flex gap-1 shrink-0">
          {(Object.keys(CATEGORIES) as WorkCategory[]).map((key) => {
            const cat = CATEGORIES[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(category === key ? "" : key)}
                className={cn(
                  "w-8 h-8 rounded-xl text-sm transition-all flex items-center justify-center",
                  category === key
                    ? "bg-primary/10 dark:bg-primary/20 ring-2 ring-primary scale-110"
                    : "bg-accent/40 hover:bg-accent opacity-60 hover:opacity-100"
                )}
                title={cat.label}
              >
                {cat.emoji}
              </button>
            );
          })}
        </div>

        {/* Title input */}
        <Input
          placeholder={category ? `¿Qué hiciste en ${CATEGORIES[category as WorkCategory]?.label}?` : "Selecciona categoría..."}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1"
          disabled={!category}
          minLength={10}
        />

        <Button type="submit" size="icon" disabled={loading || !category || title.length < 10} className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
