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
      setSuccess(true);
      setTitle("");
      setCategory("");
      setTimeout(() => setSuccess(false), 2000);
    }
    setLoading(false);
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-4 h-4 text-yellow-500" />
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
                  "w-8 h-8 rounded-lg text-sm transition-all flex items-center justify-center",
                  category === key
                    ? "bg-violet-100 dark:bg-violet-900/40 ring-2 ring-violet-500 scale-110"
                    : "bg-muted/50 hover:bg-muted opacity-60 hover:opacity-100"
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

        <Button type="submit" size="icon" disabled={loading || !category || title.length < 10}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
