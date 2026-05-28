"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REACTIONS } from "@/lib/constants";
import type { ReactionType, EntryReaction } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export function EntryReactions({ entryId }: { entryId: string }) {
  const [reactions, setReactions] = useState<EntryReaction[]>([]);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);

      const { data } = await supabase
        .from("entry_reactions")
        .select("*")
        .eq("entry_id", entryId);

      if (data) {
        setReactions(data as EntryReaction[]);
        const mine = data.find((r) => r.user_id === user?.id);
        if (mine) setMyReaction(mine.reaction as ReactionType);
      }
    }
    load();
  }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReaction(reaction: ReactionType) {
    if (!userId) return;

    if (myReaction === reaction) {
      // Remove reaction
      await supabase
        .from("entry_reactions")
        .delete()
        .eq("entry_id", entryId)
        .eq("user_id", userId);
      setMyReaction(null);
      setReactions((prev) => prev.filter((r) => r.user_id !== userId));
    } else {
      // Upsert reaction
      await supabase.from("entry_reactions").upsert({
        entry_id: entryId,
        user_id: userId,
        reaction,
      }, { onConflict: "entry_id,user_id" });
      setMyReaction(reaction);
      setReactions((prev) => {
        const filtered = prev.filter((r) => r.user_id !== userId);
        return [...filtered, { id: "", entry_id: entryId, user_id: userId, reaction, comment: null, created_at: "" }];
      });
    }
  }

  // Count reactions by type
  const counts = new Map<ReactionType, number>();
  for (const r of reactions) {
    counts.set(r.reaction as ReactionType, (counts.get(r.reaction as ReactionType) ?? 0) + 1);
  }

  return (
    <div className="flex items-center gap-1 mt-2">
      {(Object.keys(REACTIONS) as ReactionType[]).map((type) => {
        const config = REACTIONS[type];
        const count = counts.get(type) ?? 0;
        const isActive = myReaction === type;
        return (
          <button
            key={type}
            onClick={() => handleReaction(type)}
            title={config.description}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all border",
              isActive
                ? type === "suspicious"
                  ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
                  : "bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-800"
                : "border-transparent hover:bg-muted"
            )}
          >
            <span>{config.emoji}</span>
            {count > 0 && (
              <span className={cn("font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
