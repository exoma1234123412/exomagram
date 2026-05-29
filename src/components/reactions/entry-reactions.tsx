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
 await supabase
 .from("entry_reactions")
 .delete()
 .eq("entry_id", entryId)
 .eq("user_id", userId);
 setMyReaction(null);
 setReactions((prev) => prev.filter((r) => r.user_id !== userId));
 } else {
 await supabase.from("entry_reactions").upsert({
 entry_id: entryId,
 user_id: userId,
 reaction,
 }, { onConflict:"entry_id,user_id"});
 setMyReaction(reaction);
 setReactions((prev) => {
 const filtered = prev.filter((r) => r.user_id !== userId);
 return [...filtered, { id:"", entry_id: entryId, user_id: userId, reaction, comment: null, created_at:""}];
 });
 }
 }

 // Count reactions by type
 const counts = new Map<ReactionType, number>();
 for (const r of reactions) {
 counts.set(r.reaction as ReactionType, (counts.get(r.reaction as ReactionType) ?? 0) + 1);
 }

 return (
 <div className="flex items-center gap-1 mt-2.5">
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
"flex items-center gap-1 px-2 py-1 text-xs transition-all duration-200",
 isActive
 ? type ==="suspicious"?"bg-red-50 border border-red-200/60 dark:bg-red-950/20 dark:border-red-800/40":"bg-primary/5 border border-primary/20":"border border-transparent hover:bg-accent/50 hover:border-border/30")}
 >
 <span className="text-sm">{config.emoji}</span>
 {count > 0 && (
 <span className={cn(
"font-semibold tabular-nums text-[11px]",
 isActive ?"text-foreground":"text-muted-foreground/70")}>
 {count}
 </span>
 )}
 </button>
 );
 })}
 </div>
 );
}
