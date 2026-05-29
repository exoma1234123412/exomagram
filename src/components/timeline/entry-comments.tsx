"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { MessageCircle, Send } from "lucide-react";

interface Comment {
  id: string;
  entry_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: Profile;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function EntryComments({ entryId }: { entryId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!expanded) return;

    async function loadComments() {
      const { data } = await supabase
        .from("entry_comments")
        .select("*, profiles(*)")
        .eq("entry_id", entryId)
        .order("created_at", { ascending: true })
        .returns<Comment[]>();

      setComments(data ?? []);
    }
    loadComments();

    const channel = supabase
      .channel(`comments_${entryId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "entry_comments",
          filter: `entry_id=eq.${entryId}`,
        },
        async () => {
          const { data } = await supabase
            .from("entry_comments")
            .select("*, profiles(*)")
            .eq("entry_id", entryId)
            .order("created_at", { ascending: true })
            .returns<Comment[]>();
          setComments(data ?? []);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [expanded, entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!newComment.trim()) return;
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }

    await supabase.from("entry_comments").insert({
      entry_id: entryId,
      user_id: user.id,
      content: newComment.trim(),
    });

    setNewComment("");
    setSubmitting(false);
  }

  // Inline count display when collapsed
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mt-1 transition-colors"
      >
        <MessageCircle className="w-3 h-3" />
        Comentar
      </button>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t space-y-2">
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar className="w-5 h-5 mt-0.5 ring-2 ring-background shadow-sm">
            <AvatarImage src={c.profiles.avatar_url ?? undefined} />
            <AvatarFallback className="text-[8px]">
              {getInitials(c.profiles.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium">
                {c.profiles.full_name ?? c.profiles.email}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(c.created_at), "d MMM HH:mm", { locale: es })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{c.content}</p>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Escribe un comentario..."
          rows={1}
          className="text-xs min-h-[32px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={submitting || !newComment.trim()}
          className="h-8 w-8 shrink-0 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25"
        >
          <Send className="w-3 h-3" />
        </Button>
      </div>

      <button
        onClick={() => setExpanded(false)}
        className="text-[10px] text-muted-foreground hover:text-foreground"
      >
        Cerrar comentarios
      </button>
    </div>
  );
}
