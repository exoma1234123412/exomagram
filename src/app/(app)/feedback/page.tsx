"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MessageSquareText, Shield, CheckCircle2, Lock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const FEEDBACK_TYPES = {
  constructive: { label: "Constructivo", emoji: "💡", color: "text-blue-600" },
  appreciation: { label: "Apreciación", emoji: "🙏", color: "text-green-600" },
  concern: { label: "Preocupación", emoji: "⚠️", color: "text-yellow-600" },
  suggestion: { label: "Sugerencia", emoji: "🎯", color: "text-primary" },
};

// Anonymous feedback is stored without from_user_id visible to the recipient
// Only admins/owners can see aggregated anonymous feedback

export default function FeedbackPage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [toUserId, setToUserId] = useState("");
  const [feedbackType, setFeedbackType] = useState("");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string; role: string }>();

      if (!membership) { setLoading(false); return; }
      setOrgId(membership.org_id);
      setIsAdmin(membership.role === "owner" || membership.role === "admin");

      const { data: memberData } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", membership.org_id)
        .returns<{ user_id: string; profiles: Profile }[]>();

      setMembers(
        (memberData ?? []).map((m) => m.profiles).filter((p) => p.id !== user.id)
      );
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!toUserId || !feedbackType || !message.trim() || !orgId) return;
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Store in audit log as anonymous feedback
    await supabase.from("audit_log").insert({
      org_id: orgId,
      user_id: anonymous ? "00000000-0000-0000-0000-000000000000" : user.id,
      action: "shoutout_given", // reuse action type
      target_type: "anonymous_feedback",
      target_id: null,
      new_data: {
        to_user_id: toUserId,
        feedback_type: feedbackType,
        message,
        is_anonymous: anonymous,
        actual_from: user.id, // only visible in DB, not exposed to frontend
      },
    });

    setSubmitted(true);
    setSubmitting(false);
    setTimeout(() => {
      setSubmitted(false);
      setMessage("");
      setToUserId("");
      setFeedbackType("");
    }, 3000);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquareText className="w-6 h-6 text-primary" />
          Feedback anónimo
        </h1>
        <p className="text-muted-foreground text-sm">
          Feedback constructivo. Anónimo por defecto. Solo visible para management.
        </p>
      </div>

      <Card className="mb-6 bg-muted/30">
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Reglas de feedback anónimo</p>
            <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
              <li>• El feedback es constructivo, no para atacar</li>
              <li>• Solo admin/owner puede ver el feedback recibido por cada persona</li>
              <li>• Tu identidad no se revela al receptor (si es anónimo)</li>
              <li>• El feedback se usa para mejorar, no para castigar</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {submitted ? (
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold">Feedback enviado</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {anonymous ? "Tu identidad está protegida." : "Se envió con tu nombre."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Enviar feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>¿Para quién?</Label>
                  <Select value={toUserId} onValueChange={(v) => v && setToUserId(v)}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name ?? m.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={feedbackType} onValueChange={(v) => v && setFeedbackType(v)}>
                    <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FEEDBACK_TYPES).map(([key, ft]) => (
                        <SelectItem key={key} value={key}>
                          {ft.emoji} {ft.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mensaje</Label>
                <Textarea
                  placeholder="Sé específico y constructivo. ¿Qué podrían mejorar? ¿Qué aprecias?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  minLength={20}
                  rows={4}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAnonymous(!anonymous)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors",
                    anonymous
                      ? "border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700"
                      : "border-muted"
                  )}
                >
                  <Lock className={cn("w-4 h-4", anonymous ? "text-primary" : "text-muted-foreground")} />
                  {anonymous ? "Anónimo" : "Con tu nombre"}
                </button>
              </div>

              <Button type="submit" className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25" disabled={submitting || !toUserId || !feedbackType}>
                {submitting ? "Enviando..." : "Enviar feedback"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
