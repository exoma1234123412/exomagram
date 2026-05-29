"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useOrg } from "@/lib/context/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Coins,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Users,
  ShieldOff,
  TrendingDown,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  getDay,
  isMonday,
  isBefore,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Policy {
  date: string; // YYYY-MM-DD
  xpCost: number;
  status: "active" | "used" | "expired";
}

interface InsuranceData {
  policies: Policy[];
  xpBalance: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = (orgId: string, userId: string) =>
  `exomagram_insurance_${orgId}_${userId}`;

const DEFAULT_DATA: InsuranceData = {
  policies: [],
  xpBalance: 500,
};

const MAX_POLICIES_PER_MONTH = 3;

function getXpCost(date: Date): number {
  return isMonday(date) ? 50 : 100;
}

function getTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey" }).format(new Date());
}

function loadInsurance(orgId: string, userId: string): InsuranceData {
  if (typeof window === "undefined") return DEFAULT_DATA;
  try {
    const raw = localStorage.getItem(STORAGE_KEY(orgId, userId));
    if (!raw) return DEFAULT_DATA;
    return JSON.parse(raw) as InsuranceData;
  } catch {
    return DEFAULT_DATA;
  }
}

function saveInsurance(orgId: string, userId: string, data: InsuranceData) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY(orgId, userId), JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InsurancePage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [data, setData] = useState<InsuranceData>(DEFAULT_DATA);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const todayStr = getTodayStr();
  const todayDate = new Date(todayStr + "T12:00:00");

  // Load from localStorage
  useEffect(() => {
    if (!orgId || !userId) return;
    const stored = loadInsurance(orgId, userId);

    // Expire old active policies
    const now = startOfDay(new Date());
    const updated: Policy[] = stored.policies.map((p) => {
      if (p.status === "active" && isBefore(new Date(p.date + "T23:59:59"), now)) {
        return { ...p, status: "used" as const };
      }
      return p;
    });

    const newData = { ...stored, policies: updated };
    saveInsurance(orgId, userId, newData);
    setData(newData);
    setLoading(false);
  }, [orgId, userId]);

  // Derived state
  const monthStart = startOfMonth(todayDate);
  const monthEnd = endOfMonth(todayDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const policiesThisMonth = useMemo(() => {
    return data.policies.filter((p) => {
      const pDate = new Date(p.date + "T12:00:00");
      return pDate >= monthStart && pDate <= monthEnd;
    });
  }, [data.policies, monthStart, monthEnd]);

  const policiesUsed = policiesThisMonth.length;
  const policiesRemaining = MAX_POLICIES_PER_MONTH - policiesUsed;

  const todayHasInsurance = data.policies.some(
    (p) => p.date === todayStr && (p.status === "active" || p.status === "used")
  );

  const todayCost = getXpCost(todayDate);
  const canActivate = !todayHasInsurance && policiesRemaining > 0 && data.xpBalance >= todayCost;

  const totalXpSpent = data.policies.reduce((sum, p) => sum + p.xpCost, 0);

  // Team count simulation (localStorage-based, shows a deterministic number)
  const teamInsuredToday = useMemo(() => {
    const seed = todayStr.split("-").reduce((a, b) => a + parseInt(b, 10), 0);
    return seed % 3; // 0-2 team members
  }, [todayStr]);

  const activateInsurance = useCallback(() => {
    if (!orgId || !userId || !canActivate) return;

    const newPolicy: Policy = {
      date: todayStr,
      xpCost: todayCost,
      status: "active",
    };

    const newData: InsuranceData = {
      policies: [...data.policies, newPolicy],
      xpBalance: data.xpBalance - todayCost,
    };

    saveInsurance(orgId, userId, newData);
    setData(newData);
    setConfirmOpen(false);
  }, [orgId, userId, canActivate, todayStr, todayCost, data]);

  // Protection percentage for the month
  const daysPassed = daysInMonth.filter((d) => isBefore(d, todayDate) || isSameDay(d, todayDate)).length;
  const protectedDays = policiesThisMonth.length;
  const protectionPct = daysPassed > 0 ? Math.round((protectedDays / daysPassed) * 100) : 0;

  // Loading state
  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Seguro de Trust Score
        </h1>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Protege tu Trust Score en dias dificiles. Maximo {MAX_POLICIES_PER_MONTH} polizas por mes.
        </p>
      </div>

      {/* Today's Status — Big Shield */}
      <div className="mb-8">
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2 block">
          Estado de hoy
        </span>
        <Card
          className={cn(
            "border border-border transition-colors duration-200",
            todayHasInsurance ? "border-emerald-600/40 bg-emerald-500/5" : "border-border"
          )}
        >
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "w-16 h-16 flex items-center justify-center border",
                  todayHasInsurance
                    ? "border-emerald-600/30 bg-emerald-500/10"
                    : "border-border bg-accent/30"
                )}
              >
                {todayHasInsurance ? (
                  <ShieldCheck className="w-8 h-8 text-emerald-500" />
                ) : (
                  <ShieldOff className="w-8 h-8 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-mono font-bold text-sm uppercase tracking-tight">
                  {todayHasInsurance ? "Trust Score protegido" : "Sin proteccion"}
                </p>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">
                  {format(todayDate, "EEEE d 'de' MMMM, yyyy", { locale: es })}
                </p>
                {todayHasInsurance && (
                  <Badge variant="outline" className="mt-2 text-emerald-600 border-emerald-600/30 font-mono text-[10px]">
                    <ShieldCheck className="w-3 h-3 mr-1" />
                    Poliza activa
                  </Badge>
                )}
              </div>
              {!todayHasInsurance && (
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canActivate}
                  className="bg-primary font-mono text-xs"
                >
                  <Shield className="w-4 h-4 mr-1.5" />
                  Activar seguro
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Row */}
      <div className="mb-8">
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2 block">
          Resumen
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-1">
                <Coins className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                  Balance XP
                </span>
              </div>
              <p className="font-mono tabular-nums tracking-tight text-xl font-bold">{data.xpBalance}</p>
            </CardContent>
          </Card>

          <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                  Disponibles
                </span>
              </div>
              <p className="font-mono tabular-nums tracking-tight text-xl font-bold">
                {policiesRemaining}
                <span className="text-muted-foreground text-xs font-normal">/{MAX_POLICIES_PER_MONTH}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                  XP gastado
                </span>
              </div>
              <p className="font-mono tabular-nums tracking-tight text-xl font-bold">{totalXpSpent}</p>
            </CardContent>
          </Card>

          <Card className="border border-border transition-colors duration-200 hover:border-primary/30">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
                  Equipo hoy
                </span>
              </div>
              <p className="font-mono tabular-nums tracking-tight text-xl font-bold">
                {teamInsuredToday}
                <span className="text-muted-foreground text-xs font-normal"> asegurados</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Protection Meter */}
      <div className="mb-8">
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2 block">
          Medidor de proteccion — {format(todayDate, "MMMM yyyy", { locale: es })}
        </span>
        <Card className="border border-border">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-muted-foreground">
                {protectedDays} dia{protectedDays !== 1 ? "s" : ""} protegido{protectedDays !== 1 ? "s" : ""} de {daysPassed}
              </span>
              <span className="font-mono tabular-nums text-sm font-bold">{protectionPct}%</span>
            </div>
            <div className="w-full h-2 bg-accent/30 border border-border overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${protectionPct}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar View */}
      <div className="mb-8">
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2 block">
          Calendario del mes
        </span>
        <Card className="border border-border">
          <CardContent className="py-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map((d) => (
                <div key={d} className="text-center font-mono text-[9px] tracking-wider uppercase text-muted-foreground/40 py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for offset */}
              {Array.from({ length: (getDay(monthStart) + 6) % 7 }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {daysInMonth.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const policy = data.policies.find((p) => p.date === dateStr);
                const isProtected = !!policy;
                const isCurrentDay = isToday(day);
                const isPast = isBefore(day, startOfDay(new Date())) && !isCurrentDay;

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center relative border transition-colors duration-200",
                      isCurrentDay && "border-primary/50 bg-primary/5",
                      !isCurrentDay && isProtected && "border-emerald-600/30 bg-emerald-500/5",
                      !isCurrentDay && !isProtected && isPast && "border-border/50 bg-accent/10",
                      !isCurrentDay && !isProtected && !isPast && "border-border/30"
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono tabular-nums text-[10px]",
                        isCurrentDay && "font-bold text-primary",
                        isPast && !isProtected && "text-muted-foreground/40",
                        isProtected && "text-emerald-600 font-medium"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {isProtected && (
                      <ShieldCheck className="w-2.5 h-2.5 text-emerald-500 mt-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Policy History & Strategy side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* History */}
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2 block">
            Historial de polizas
          </span>
          <Card className="border border-border">
            <CardContent className="py-4">
              {data.policies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="w-16 h-16 border border-border flex items-center justify-center">
                    <Shield className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    Sin polizas activadas
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {[...data.policies].reverse().map((policy, idx) => (
                    <div
                      key={`${policy.date}-${idx}`}
                      className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        {policy.status === "active" ? (
                          <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        ) : policy.status === "used" ? (
                          <CheckCircle className="w-4 h-4 text-muted-foreground/50" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-amber-500" />
                        )}
                        <div>
                          <p className="font-mono text-xs">
                            {format(new Date(policy.date + "T12:00:00"), "EEEE d MMM", { locale: es })}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {policy.status === "active" ? "Activa" : policy.status === "used" ? "Utilizada" : "Expirada"}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="font-mono tabular-nums text-[10px]">
                        <Coins className="w-2.5 h-2.5 mr-1" />
                        -{policy.xpCost} XP
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Strategy Tips */}
        <div>
          <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2 block">
            Estrategia
          </span>
          <Card className="border border-border">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs font-medium">Mejor dia para usar seguro</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Viernes — dia de cierre semanal cuando el Trust Score se recalcula.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Coins className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs font-medium">Descuento de lunes</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Los lunes cuestan solo 50 XP (vs 100 XP normal). Pero los lunes generalmente son dias fuertes.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs font-medium">Usa con cautela</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Solo {MAX_POLICIES_PER_MONTH} polizas por mes. Guardalas para emergencias reales: citas medicas, viajes, imprevistos.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs font-medium">Planifica con anticipacion</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Si sabes que tendras un dia dificil, activa el seguro temprano en la manana.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pricing Card */}
      <div className="mb-8">
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40 mb-2 block">
          Precios
        </span>
        <Card className="border border-border">
          <CardContent className="py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 border border-border">
                <Clock className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-mono text-xs font-medium">Dia normal</p>
                  <p className="font-mono tabular-nums text-lg font-bold">100 <span className="text-xs font-normal text-muted-foreground">XP</span></p>
                  <p className="font-mono text-[10px] text-muted-foreground">Martes a domingo</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border border-emerald-600/30 bg-emerald-500/5">
                <Coins className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="font-mono text-xs font-medium">Lunes</p>
                  <p className="font-mono tabular-nums text-lg font-bold">50 <span className="text-xs font-normal text-muted-foreground">XP</span></p>
                  <p className="font-mono text-[10px] text-emerald-600">50% descuento</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Activar seguro
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Protege tu Trust Score por el resto del dia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">Fecha</span>
                <span className="font-mono text-xs font-medium">
                  {format(todayDate, "EEEE d 'de' MMMM", { locale: es })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">Costo</span>
                <span className="font-mono tabular-nums text-xs font-bold">
                  {todayCost} XP {isMonday(todayDate) && "(descuento lunes)"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">Balance despues</span>
                <span className="font-mono tabular-nums text-xs font-bold">
                  {data.xpBalance - todayCost} XP
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">Polizas restantes</span>
                <span className="font-mono tabular-nums text-xs font-bold">
                  {policiesRemaining - 1}/{MAX_POLICIES_PER_MONTH}
                </span>
              </div>
            </div>

            <div className="bg-destructive/5 border border-destructive/20 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="font-mono text-[10px] text-destructive">
                  Esta accion no se puede deshacer. El XP se descontara inmediatamente.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="font-mono text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={activateInsurance}
              className="bg-primary font-mono text-xs"
            >
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              Confirmar — {todayCost} XP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
