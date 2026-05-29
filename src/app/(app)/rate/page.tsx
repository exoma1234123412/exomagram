"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { Profile, TimeEntry } from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
import { getTodayMTY } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, getInitials } from "@/lib/utils";
import {
  Star,
  Send,
  CheckCircle2,
  Loader2,
  BarChart3,
  User,
} from "lucide-react";

interface AssignedDay {
  targetUserId: string;
  profile: Profile;
  entries: TimeEntry[];
}

export default function RatePage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [assigned, setAssigned] = useState<AssignedDay | null>(null);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [myAvgRating, setMyAvgRating] = useState<number | null>(null);
  const [myRatingCount, setMyRatingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const today = getTodayMTY();

  const loadData = useCallback(async () => {
    if (!orgId || !userId) return;
    setLoading(true);

    // 1. Check if user already rated someone today
    const { data: existingRating } = await supabase
      .from("audit_log")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .eq("action", "entry_created")
      .eq("target_type", "day_rating")
      .gte("created_at", today + "T00:00:00")
      .lte("created_at", today + "T23:59:59")
      .limit(1);

    if (existingRating && existingRating.length > 0) {
      setAlreadyRated(true);
    }

    // 2. Load my average rating received
    const { data: myRatings } = await supabase
      .from("audit_log")
      .select("new_data")
      .eq("org_id", orgId)
      .eq("action", "entry_created")
      .eq("target_type", "day_rating");

    const ratingsForMe = (myRatings ?? []).filter((r) => {
      const nd = r.new_data as Record<string, unknown> | null;
      return nd?.target_user_id === userId;
    });

    if (ratingsForMe.length > 0) {
      const sum = ratingsForMe.reduce((acc, r) => {
        const nd = r.new_data as Record<string, unknown>;
        return acc + (typeof nd.rating === "number" ? nd.rating : 0);
      }, 0);
      setMyAvgRating(Math.round((sum / ratingsForMe.length) * 10) / 10);
      setMyRatingCount(ratingsForMe.length);
    }

    // 3. If not already rated, find a teammate to rate
    if (!existingRating || existingRating.length === 0) {
      // Get all team members
      const { data: members } = await supabase
        .from("org_members")
        .select("user_id, profiles(*)")
        .eq("org_id", orgId);

      const teammates = (members ?? []).filter(
        (m) => m.user_id !== userId && m.profiles
      );

      if (teammates.length > 0) {
        // Check who this user has already rated today (should be none if we got here)
        const { data: todaysRatings } = await supabase
          .from("audit_log")
          .select("new_data")
          .eq("org_id", orgId)
          .eq("user_id", userId)
          .eq("action", "entry_created")
          .eq("target_type", "day_rating")
          .gte("created_at", today + "T00:00:00")
          .lte("created_at", today + "T23:59:59");

        const alreadyRatedIds = new Set(
          (todaysRatings ?? []).map((r) => {
            const nd = r.new_data as Record<string, unknown> | null;
            return nd?.target_user_id as string;
          })
        );

        const available = teammates.filter(
          (t) => !alreadyRatedIds.has(t.user_id)
        );

        if (available.length > 0) {
          // Randomly pick one
          const pick =
            available[Math.floor(Math.random() * available.length)];
          const profile = pick.profiles as unknown as Profile;

          // Load their entries for today
          const { data: entries } = await supabase
            .from("time_entries")
            .select("*")
            .eq("user_id", pick.user_id)
            .eq("org_id", orgId)
            .eq("date", today)
            .order("hour", { ascending: true });

          setAssigned({
            targetUserId: pick.user_id,
            profile,
            entries: entries ?? [],
          });
        }
      }
    }

    setLoading(false);
  }, [orgId, userId, today]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId || !userId) return;
    loadData();
  }, [orgId, userId, loadData]);

  async function submitRating() {
    if (!orgId || !userId || !assigned || rating === 0) return;
    setSubmitting(true);

    await supabase.from("audit_log").insert({
      org_id: orgId,
      user_id: userId,
      action: "entry_created",
      target_type: "day_rating",
      target_id: null,
      new_data: {
        target_user_id: assigned.targetUserId,
        date: today,
        rating,
        comment: comment.trim() || null,
      },
    });

    setSubmitted(true);
    setSubmitting(false);
  }

  if (orgLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Cargando...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Star className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Rate My Day</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Evalúa el día de un compañero de forma anónima. Ellos ven su promedio
        pero no quién los calificó.
      </p>

      {/* My average rating */}
      <Card className="mb-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Tu calificación promedio
              </p>
              {myAvgRating !== null ? (
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-3xl font-black tabular-nums">
                    {myAvgRating}
                  </p>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={cn(
                          "w-5 h-5",
                          s <= Math.round(myAvgRating!)
                            ? "text-yellow-500 fill-yellow-500"
                            : "text-zinc-300 dark:text-zinc-600"
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ({myRatingCount}{" "}
                    {myRatingCount === 1 ? "evaluación" : "evaluaciones"})
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Aún no tienes evaluaciones.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Already rated today */}
      {alreadyRated && !submitted && (
        <Card className="border-green-200 dark:border-green-900">
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <p className="text-sm font-semibold text-green-600">
                Ya evaluaste a alguien hoy
              </p>
              <p className="text-xs text-muted-foreground">
                Vuelve mañana para evaluar a otro compañero.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submitted success */}
      {submitted && (
        <Card className="border-green-200 dark:border-green-900">
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <p className="text-sm font-semibold text-green-600">
                Evaluación enviada
              </p>
              <p className="text-xs text-muted-foreground">
                Tu evaluación es anónima. Gracias por contribuir.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rate assignment */}
      {!alreadyRated && !submitted && assigned && (
        <div className="space-y-6">
          {/* Assigned person */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Evalúa el día de
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="w-12 h-12 ring-2 ring-background shadow-sm">
                  <AvatarImage
                    src={assigned.profile.avatar_url ?? undefined}
                  />
                  <AvatarFallback>
                    {getInitials(assigned.profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">
                    {assigned.profile.full_name ?? assigned.profile.email}
                  </p>
                  {assigned.profile.role && (
                    <p className="text-xs text-muted-foreground">
                      {assigned.profile.role}
                    </p>
                  )}
                </div>
              </div>

              {/* Their entries */}
              {assigned.entries.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                    Entradas de hoy ({assigned.entries.length})
                  </p>
                  {assigned.entries.map((entry) => {
                    const cat =
                      CATEGORIES[
                        entry.category as keyof typeof CATEGORIES
                      ];
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 p-3 bg-accent/40 rounded-xl"
                      >
                        <span className="text-xs tabular-nums text-muted-foreground w-14 shrink-0">
                          {entry.hour}:00
                        </span>
                        <Badge
                          className={cn(
                            "text-[10px] shrink-0",
                            cat?.bgColor,
                            cat?.color
                          )}
                        >
                          {cat?.emoji} {cat?.label}
                        </Badge>
                        <p className="text-sm truncate flex-1">
                          {entry.title}
                        </p>
                        {entry.proof_urls &&
                          entry.proof_urls.length > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[9px] text-green-600 border-green-300 shrink-0"
                            >
                              Con evidencia
                            </Badge>
                          )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    Esta persona no tiene entradas hoy.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rating selector */}
          <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <CardContent className="p-6">
              <p className="text-sm font-semibold mb-4">Calificación</p>
              <div className="flex justify-center gap-3 mb-6">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setRating(s)}
                    className={cn(
                      "w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-all duration-200",
                      rating >= s
                        ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 scale-110"
                        : "border-border hover:border-yellow-300 hover:bg-accent/40"
                    )}
                  >
                    <Star
                      className={cn(
                        "w-7 h-7 transition-colors",
                        rating >= s
                          ? "text-yellow-500 fill-yellow-500"
                          : "text-zinc-300 dark:text-zinc-600"
                      )}
                    />
                  </button>
                ))}
              </div>

              {rating > 0 && (
                <p className="text-center text-sm text-muted-foreground mb-4">
                  {rating === 1
                    ? "Muy mal día"
                    : rating === 2
                      ? "Día flojo"
                      : rating === 3
                        ? "Día normal"
                        : rating === 4
                          ? "Buen día"
                          : "Día excelente"}
                </p>
              )}

              {/* Comment */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-1">
                  Comentario opcional (1 línea)
                </p>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) =>
                    setComment(e.target.value.slice(0, 140))
                  }
                  placeholder="Ej: Buena consistencia pero faltó evidencia..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  maxLength={140}
                />
              </div>

              {/* Submit */}
              <Button
                onClick={submitRating}
                disabled={rating === 0 || submitting}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0 shadow-lg shadow-blue-600/25 gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar evaluación anónima
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No one to rate */}
      {!alreadyRated && !submitted && !assigned && !loading && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Star className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                No hay compañeros disponibles para evaluar hoy.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
