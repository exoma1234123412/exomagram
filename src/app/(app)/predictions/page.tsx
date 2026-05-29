"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { Prediction, PredictionBet, Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn, getInitials } from "@/lib/utils";
import { format, isPast } from "date-fns";
import { es } from "date-fns/locale";
import {
  TrendingUp,
  Plus,
  Calendar,
  Users,
  Target,
  CheckCircle2,
  XCircle,
  Trophy,
  ChevronRight,
  Sparkles,
  HelpCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PredictionWithBets extends Prediction {
  bets: PredictionBet[];
  creator: Profile | null;
}

interface UserAccuracy {
  profile: Profile;
  total: number;
  correct: number;
  accuracy: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXAMPLE_PREDICTIONS = [
  "¿Alguien se salta el closeout hoy?",
  "¿Superamos 30hrs de Deep Work esta semana?",
  "¿Quién registra primero mañana?",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PredictionsPage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const supabase = createClient();

  const [predictions, setPredictions] = useState<PredictionWithBets[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("open");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newDate, setNewDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Bet dialog
  const [betDialogOpen, setBetDialogOpen] = useState(false);
  const [betPrediction, setBetPrediction] = useState<PredictionWithBets | null>(null);
  const [betChoice, setBetChoice] = useState<"yes" | "no" | null>(null);
  const [betConfidence, setBetConfidence] = useState(50);
  const [betSubmitting, setBetSubmitting] = useState(false);

  // -----------------------------------------------------------------------
  // Load data
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    if (!orgId) return;

    const { data: preds } = await supabase
      .from("predictions")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (!preds) {
      setLoading(false);
      return;
    }

    const predIds = preds.map((p) => p.id);
    const { data: bets } = predIds.length > 0
      ? await supabase
          .from("prediction_bets")
          .select("*")
          .in("prediction_id", predIds)
      : { data: [] as PredictionBet[] };

    // Collect user IDs
    const userIds = new Set<string>();
    for (const p of preds) userIds.add(p.created_by);
    for (const b of bets ?? []) userIds.add(b.user_id);

    const { data: profs } = userIds.size > 0
      ? await supabase
          .from("profiles")
          .select("*")
          .in("id", Array.from(userIds))
      : { data: [] as Profile[] };

    const profileMap = new Map<string, Profile>();
    for (const p of profs ?? []) profileMap.set(p.id, p);
    setProfiles(profileMap);

    const betsByPred = new Map<string, PredictionBet[]>();
    for (const b of bets ?? []) {
      const arr = betsByPred.get(b.prediction_id) ?? [];
      arr.push(b);
      betsByPred.set(b.prediction_id, arr);
    }

    const combined: PredictionWithBets[] = preds.map((p) => ({
      ...p,
      bets: betsByPred.get(p.id) ?? [],
      creator: profileMap.get(p.created_by) ?? null,
    }));

    setPredictions(combined);
    setLoading(false);
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel("predictions_rt")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "predictions",
        filter: `org_id=eq.${orgId}`,
      }, () => loadData())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "prediction_bets",
      }, () => loadData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Create prediction
  // -----------------------------------------------------------------------

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !userId || !newQuestion.trim() || !newDate) return;

    setSubmitting(true);
    await supabase.from("predictions").insert({
      org_id: orgId,
      created_by: userId,
      question: newQuestion.trim(),
      type: "yes_no",
      resolution_date: newDate,
      status: "open",
    });

    setNewQuestion("");
    setNewDate("");
    setSubmitting(false);
    setCreateOpen(false);
  }

  // -----------------------------------------------------------------------
  // Place bet
  // -----------------------------------------------------------------------

  function openBetDialog(prediction: PredictionWithBets) {
    setBetPrediction(prediction);
    setBetChoice(null);
    setBetConfidence(50);
    setBetDialogOpen(true);
  }

  async function handlePlaceBet() {
    if (!betPrediction || !betChoice || !userId) return;

    setBetSubmitting(true);
    await supabase.from("prediction_bets").insert({
      prediction_id: betPrediction.id,
      user_id: userId,
      bet: betChoice,
      confidence: betConfidence,
    });

    setBetSubmitting(false);
    setBetDialogOpen(false);
  }

  // -----------------------------------------------------------------------
  // Computed
  // -----------------------------------------------------------------------

  const openPredictions = predictions.filter((p) => p.status === "open");
  const resolvedPredictions = predictions.filter((p) =>
    p.status === "resolved_yes" || p.status === "resolved_no"
  );

  // Accuracy leaderboard
  const accuracyMap = new Map<string, { total: number; correct: number }>();
  for (const p of resolvedPredictions) {
    for (const b of p.bets) {
      if (b.is_correct === null) continue;
      const entry = accuracyMap.get(b.user_id) ?? { total: 0, correct: 0 };
      entry.total++;
      if (b.is_correct) entry.correct++;
      accuracyMap.set(b.user_id, entry);
    }
  }

  const leaderboard: UserAccuracy[] = Array.from(accuracyMap.entries())
    .map(([uid, stats]) => ({
      profile: profiles.get(uid)!,
      total: stats.total,
      correct: stats.correct,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
    }))
    .filter((u) => u.profile)
    .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  function BetDistribution({ bets }: { bets: PredictionBet[] }) {
    const yesBets = bets.filter((b) => b.bet === "yes");
    const noBets = bets.filter((b) => b.bet === "no");
    const total = bets.length;
    const yesPercent = total > 0 ? Math.round((yesBets.length / total) * 100) : 50;
    const noPercent = total > 0 ? 100 - yesPercent : 50;
    const avgYesConf = yesBets.length > 0
      ? Math.round(yesBets.reduce((s, b) => s + b.confidence, 0) / yesBets.length)
      : 0;
    const avgNoConf = noBets.length > 0
      ? Math.round(noBets.reduce((s, b) => s + b.confidence, 0) / noBets.length)
      : 0;

    if (total === 0) {
      return (
        <p className="text-xs text-muted-foreground italic">
          Sin apuestas aún
        </p>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-600 font-medium w-8 text-right tabular-nums">
            {yesPercent}%
          </span>
          <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-500"
              style={{ width: `${yesPercent}%` }}
            />
            <div
              className="h-full bg-gradient-to-r from-red-400 to-red-500 transition-all duration-500"
              style={{ width: `${noPercent}%` }}
            />
          </div>
          <span className="text-red-600 font-medium w-8 tabular-nums">
            {noPercent}%
          </span>
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>
            {yesBets.length} Sí · {avgYesConf}% confianza
          </span>
          <span>
            {noBets.length} No · {avgNoConf}% confianza
          </span>
        </div>
      </div>
    );
  }

  function PredictionCard({ prediction }: { prediction: PredictionWithBets }) {
    const isResolved = prediction.status !== "open";
    const userBet = prediction.bets.find((b) => b.user_id === userId);
    const isExpired = isPast(new Date(prediction.resolution_date + "T23:59:59"));
    const resolvedYes = prediction.status === "resolved_yes";

    return (
      <Card
        className={cn(
          "transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
          isResolved && resolvedYes && "border-green-200 dark:border-green-900/40",
          isResolved && !resolvedYes && prediction.status === "resolved_no" && "border-red-200 dark:border-red-900/40"
        )}
      >
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              isResolved
                ? resolvedYes
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-red-100 dark:bg-red-900/30"
                : "bg-primary/10"
            )}>
              {isResolved ? (
                resolvedYes ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )
              ) : (
                <HelpCircle className="w-5 h-5 text-primary" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm leading-tight mb-1">
                {prediction.question}
              </h3>

              {/* Meta */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                <span className="flex items-center gap-1">
                  <Avatar className="w-4 h-4">
                    <AvatarImage src={prediction.creator?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[8px]">
                      {getInitials(prediction.creator?.full_name ?? null)}
                    </AvatarFallback>
                  </Avatar>
                  {prediction.creator?.full_name?.split(" ")[0] ?? "Anónimo"}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(prediction.resolution_date), "d MMM", { locale: es })}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {prediction.bets.length} apuesta{prediction.bets.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Bet distribution */}
              <BetDistribution bets={prediction.bets} />

              {/* Resolution badge */}
              {isResolved && (
                <div className="mt-3">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-xs",
                      resolvedYes
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    )}
                  >
                    {resolvedYes ? "Resultado: Sí" : "Resultado: No"}
                  </Badge>
                </div>
              )}

              {/* User bet status */}
              {userBet && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px]">
                    Tu apuesta: {userBet.bet === "yes" ? "Sí" : "No"} · {userBet.confidence}%
                  </Badge>
                  {userBet.is_correct !== null && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[11px]",
                        userBet.is_correct
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}
                    >
                      {userBet.is_correct ? "Acertaste" : "Fallaste"}
                    </Badge>
                  )}
                </div>
              )}

              {/* Action */}
              {!isResolved && !userBet && !isExpired && (
                <Button
                  size="sm"
                  className="mt-3 rounded-xl gap-1.5"
                  onClick={() => openBetDialog(prediction)}
                >
                  <Target className="w-3.5 h-3.5" />
                  Apostar
                </Button>
              )}

              {!isResolved && isExpired && !userBet && (
                <p className="mt-2 text-xs text-muted-foreground italic">
                  Plazo expirado
                </p>
              )}
            </div>
          </div>

          {/* Bet avatars */}
          {prediction.bets.length > 0 && (
            <div className="mt-3 pt-3 border-t flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground mr-1">Apostaron:</span>
              <div className="flex -space-x-1.5">
                {prediction.bets.slice(0, 6).map((b) => {
                  const prof = profiles.get(b.user_id);
                  return (
                    <Avatar
                      key={b.id}
                      className={cn(
                        "w-6 h-6 ring-2 ring-background shadow-sm",
                        b.bet === "yes" ? "ring-green-300" : "ring-red-300"
                      )}
                    >
                      <AvatarImage src={prof?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[8px]">
                        {getInitials(prof?.full_name ?? null)}
                      </AvatarFallback>
                    </Avatar>
                  );
                })}
              </div>
              {prediction.bets.length > 6 && (
                <span className="text-[11px] text-muted-foreground">
                  +{prediction.bets.length - 6}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Predicciones
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Predice lo que pasa en el equipo y mide tu precisión
          </p>
        </div>
        <Button
          className="rounded-xl gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25 border-0"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-4 h-4" />
          Nueva Predicción
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="open" value={activeTab} onValueChange={(v) => setActiveTab(v as string)}>
        <TabsList className="mb-6">
          <TabsTrigger value="open" className="gap-1.5 text-xs sm:text-sm">
            <HelpCircle className="w-3.5 h-3.5" />
            Abiertas
            {openPredictions.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {openPredictions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved" className="gap-1.5 text-xs sm:text-sm">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Resueltas
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-1.5 text-xs sm:text-sm">
            <Trophy className="w-3.5 h-3.5" />
            Precisión
          </TabsTrigger>
        </TabsList>

        {/* Open predictions */}
        <TabsContent value="open">
          {openPredictions.length > 0 ? (
            <div className="space-y-3">
              {openPredictions.map((p) => (
                <PredictionCard key={p.id} prediction={p} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-7 h-7 text-primary/40" />
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  No hay predicciones abiertas
                </p>
                <div className="space-y-2 max-w-sm mx-auto">
                  <p className="text-xs text-muted-foreground mb-2">Ideas para empezar:</p>
                  {EXAMPLE_PREDICTIONS.map((ex, i) => (
                    <button
                      key={i}
                      className="w-full text-left text-sm px-4 py-2.5 rounded-xl bg-accent/40 hover:bg-accent/60 transition-colors flex items-center gap-2"
                      onClick={() => {
                        setNewQuestion(ex);
                        setCreateOpen(true);
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                      {ex}
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Resolved predictions */}
        <TabsContent value="resolved">
          {resolvedPredictions.length > 0 ? (
            <div className="space-y-3">
              {resolvedPredictions.map((p) => (
                <PredictionCard key={p.id} prediction={p} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-primary/40" />
              </div>
              <p className="text-sm text-muted-foreground">
                No hay predicciones resueltas aún
              </p>
            </div>
          )}
        </TabsContent>

        {/* Leaderboard */}
        <TabsContent value="leaderboard">
          {leaderboard.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 mb-6">
                {leaderboard.slice(0, 3).map((u, i) => (
                  <Card key={u.profile.id} className={cn(
                    "transition-all duration-300",
                    i === 0 && "border-yellow-300/60 dark:border-yellow-700/40 shadow-lg shadow-yellow-500/10 ring-1 ring-yellow-300/30"
                  )}>
                    <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                      <div className="relative">
                        <Avatar className="w-12 h-12 ring-2 ring-background shadow-sm">
                          <AvatarImage src={u.profile.avatar_url ?? undefined} />
                          <AvatarFallback>
                            {getInitials(u.profile.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className={cn(
                          "absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                          i === 0 ? "bg-yellow-500" : i === 1 ? "bg-gray-400" : "bg-amber-700"
                        )}>
                          {i + 1}
                        </div>
                      </div>
                      <p className="font-medium text-sm truncate w-full">
                        {u.profile.full_name?.split(" ")[0] ?? "?"}
                      </p>
                      <p className={cn(
                        "text-2xl font-bold tabular-nums tracking-tight",
                        u.accuracy >= 70 ? "text-green-600" :
                        u.accuracy >= 50 ? "text-yellow-600" : "text-red-600"
                      )}>
                        {u.accuracy}%
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {u.correct}/{u.total} correctas
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {leaderboard.length > 3 && (
                <div className="space-y-2">
                  {leaderboard.slice(3).map((u, i) => (
                    <Card key={u.profile.id} className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                      <CardContent className="p-3 flex items-center gap-3">
                        <span className="w-8 text-center text-sm font-bold text-muted-foreground tabular-nums">
                          {i + 4}
                        </span>
                        <Avatar className="w-8 h-8 ring-2 ring-background shadow-sm">
                          <AvatarImage src={u.profile.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(u.profile.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {u.profile.full_name ?? u.profile.email}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {u.correct}/{u.total} correctas
                          </p>
                        </div>
                        <span className={cn(
                          "text-lg font-bold tabular-nums tracking-tight",
                          u.accuracy >= 70 ? "text-green-600" :
                          u.accuracy >= 50 ? "text-yellow-600" : "text-red-600"
                        )}>
                          {u.accuracy}%
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Trophy className="w-7 h-7 text-primary/40" />
              </div>
              <p className="text-sm text-muted-foreground">
                Resuelve predicciones para ver el ranking de precisión
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Prediction Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Nueva Predicción</DialogTitle>
            <DialogDescription>
              Crea una pregunta de sí/no sobre el equipo
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Pregunta</Label>
              <Input
                placeholder="¿Superamos 30hrs de Deep Work esta semana?"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha de resolución</Label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                required
              />
            </div>

            {/* Example suggestions */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Sugerencias:</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_PREDICTIONS.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-accent/60 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    onClick={() => setNewQuestion(ex)}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0"
              disabled={submitting || !newQuestion.trim() || !newDate}
            >
              {submitting ? "Creando..." : "Crear Predicción"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bet Dialog */}
      <Dialog open={betDialogOpen} onOpenChange={setBetDialogOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Tu Apuesta</DialogTitle>
            <DialogDescription>
              {betPrediction?.question}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {/* Yes/No choice */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setBetChoice("yes")}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
                  betChoice === "yes"
                    ? "border-green-500 bg-green-50 dark:bg-green-950/30 shadow-lg shadow-green-500/10"
                    : "border-border hover:border-green-300 hover:bg-green-50/50 dark:hover:bg-green-950/10"
                )}
              >
                <CheckCircle2 className={cn(
                  "w-8 h-8 transition-colors",
                  betChoice === "yes" ? "text-green-600" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "font-semibold",
                  betChoice === "yes" ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
                )}>
                  Sí
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBetChoice("no")}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
                  betChoice === "no"
                    ? "border-red-500 bg-red-50 dark:bg-red-950/30 shadow-lg shadow-red-500/10"
                    : "border-border hover:border-red-300 hover:bg-red-50/50 dark:hover:bg-red-950/10"
                )}
              >
                <XCircle className={cn(
                  "w-8 h-8 transition-colors",
                  betChoice === "no" ? "text-red-600" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "font-semibold",
                  betChoice === "no" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"
                )}>
                  No
                </span>
              </button>
            </div>

            {/* Confidence slider */}
            {betChoice && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Confianza</Label>
                  <span className={cn(
                    "text-lg font-bold tabular-nums tracking-tight",
                    betConfidence >= 80 ? "text-green-600" :
                    betConfidence >= 50 ? "text-yellow-600" : "text-red-600"
                  )}>
                    {betConfidence}%
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={betConfidence}
                  onChange={(e) => setBetConfidence(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary bg-muted"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Poca confianza</span>
                  <span>Muy seguro</span>
                </div>

                {/* Confidence progress bar */}
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      betChoice === "yes"
                        ? "bg-gradient-to-r from-green-400 to-green-500"
                        : "bg-gradient-to-r from-red-400 to-red-500"
                    )}
                    style={{ width: `${betConfidence}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0"
              disabled={!betChoice || betSubmitting}
              onClick={handlePlaceBet}
            >
              {betSubmitting ? "Apostando..." : `Apostar ${betChoice === "yes" ? "Sí" : betChoice === "no" ? "No" : ""} al ${betConfidence}%`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
