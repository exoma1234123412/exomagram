"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn, formatHour } from "@/lib/utils";
import {
  Settings,
  Briefcase,
  Shield,
  Bell,
  AlertTriangle,
  Check,
  Save,
  Trash2,
  Download,
  UserCog,
  Clock,
  FileText,
  Eye,
  Scale,
  Link2,
  CalendarOff,
  RotateCcw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgSettings {
  // General
  orgName: string;
  slug: string;
  logoUrl: string;
  description: string;

  // Work configuration
  expectedDailyHours: number;
  workHoursStart: number;
  workHoursEnd: number;
  proofRequirement: "none" | "encouraged" | "required";
  maxBackfillHours: number;
  minTitleLength: number;
  weekendLoggingAllowed: boolean;

  // Accountability rules
  autoFlagMissingHours: boolean;
  missingHoursThreshold: number;
  autoFlagNoProof: boolean;
  noProofThresholdPct: number;
  autoFlagLateEntries: boolean;
  lateEntriesThresholdPct: number;
  requireDailyCloseout: boolean;
  trustWeightHours: number;
  trustWeightProof: number;
  trustWeightCloseout: number;
  trustWeightLatePenalty: number;
  trustWeightSuspiciousPenalty: number;

  // Notifications
  dailyDigestEmail: boolean;
  slackWebhookUrl: string;
  flagNotifications: boolean;
  closeoutReminders: boolean;
  closeoutReminderTime: string;
}

const DEFAULT_SETTINGS: OrgSettings = {
  orgName: "",
  slug: "",
  logoUrl: "",
  description: "",

  expectedDailyHours: 8,
  workHoursStart: 7,
  workHoursEnd: 18,
  proofRequirement: "encouraged",
  maxBackfillHours: 24,
  minTitleLength: 10,
  weekendLoggingAllowed: false,

  autoFlagMissingHours: true,
  missingHoursThreshold: 6,
  autoFlagNoProof: true,
  noProofThresholdPct: 50,
  autoFlagLateEntries: true,
  lateEntriesThresholdPct: 30,
  requireDailyCloseout: true,
  trustWeightHours: 30,
  trustWeightProof: 25,
  trustWeightCloseout: 20,
  trustWeightLatePenalty: 15,
  trustWeightSuspiciousPenalty: 10,

  dailyDigestEmail: true,
  slackWebhookUrl: "",
  flagNotifications: true,
  closeoutReminders: true,
  closeoutReminderTime: "17:00",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(orgId: string) {
  return `exomagram_org_settings_${orgId}`;
}

function loadSettings(orgId: string): OrgSettings {
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(orgId: string, settings: OrgSettings) {
  localStorage.setItem(storageKey(orgId), JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Checkbox-like toggle component (inline, no extra dependency)
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OrgSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string>("member");
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [transferEmail, setTransferEmail] = useState("");
  const [activeTab, setActiveTab] = useState("general");
  const supabase = createClient();

  // Load org membership + saved settings
  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) {
        setLoading(false);
        return;
      }

      setOrgId(membership.org_id);
      setCurrentRole(membership.role);

      // Load org info for defaults
      const { data: org } = await supabase
        .from("organizations")
        .select("name, slug, logo_url")
        .eq("id", membership.org_id)
        .single();

      const stored = loadSettings(membership.org_id);
      if (org) {
        stored.orgName = stored.orgName || (org as { name: string }).name || "";
        stored.slug = stored.slug || (org as { slug: string }).slug || "";
        stored.logoUrl =
          stored.logoUrl || (org as { logo_url: string | null }).logo_url || "";
      }
      setSettings(stored);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwnerOrAdmin = currentRole === "owner" || currentRole === "admin";

  // Updater helper
  const update = useCallback(
    <K extends keyof OrgSettings>(key: K, value: OrgSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // Save handler
  function handleSave() {
    if (!orgId) return;
    setSaving(true);
    saveSettings(orgId, settings);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 400);
  }

  // Delete org (localStorage only for now)
  function handleDeleteOrg() {
    if (!orgId) return;
    if (deleteConfirmText !== settings.orgName) return;
    localStorage.removeItem(storageKey(orgId));
    alert("Organizacion eliminada (datos locales). Contacta soporte para eliminar datos del servidor.");
    window.location.href = "/dashboard";
  }

  // Export all data
  function handleExportAll() {
    if (!orgId) return;
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `org_settings_${orgId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Reset to defaults
  function handleReset() {
    if (!confirm("Esto restaurara todos los ajustes a sus valores predeterminados. Continuar?")) return;
    setSettings({ ...DEFAULT_SETTINGS, orgName: settings.orgName, slug: settings.slug, logoUrl: settings.logoUrl });
  }

  // Trust weight total
  const trustWeightTotal =
    settings.trustWeightHours +
    settings.trustWeightProof +
    settings.trustWeightCloseout +
    settings.trustWeightLatePenalty +
    settings.trustWeightSuspiciousPenalty;

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Cargando...
        </p>
      </div>
    );
  }

  // Access restriction
  if (!isOwnerOrAdmin) {
    return (
      <div className="flex items-center justify-center h-screen px-4">
        <Card className="max-w-md w-full rounded-2xl">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold">Acceso restringido</h2>
            <p className="text-muted-foreground mt-2">
              Solo los owners y admins pueden acceder a la configuracion de la organizacion.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Configuracion de organizacion
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {settings.orgName || "Sin nombre"}{" "}
              <Badge variant="secondary" className="text-xs ml-1">
                {currentRole}
              </Badge>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl"
          >
            {saving ? (
              "Guardando..."
            ) : saved ? (
              <>
                <Check className="w-3.5 h-3.5" /> Guardado
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" /> Guardar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" value={activeTab} onValueChange={(v) => setActiveTab(v as string)}>
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="general" className="gap-1.5 text-xs sm:text-sm">
            <Briefcase className="w-3.5 h-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="work" className="gap-1.5 text-xs sm:text-sm">
            <Clock className="w-3.5 h-3.5" />
            Trabajo
          </TabsTrigger>
          <TabsTrigger
            value="accountability"
            className="gap-1.5 text-xs sm:text-sm"
          >
            <Shield className="w-3.5 h-3.5" />
            Reglas
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="gap-1.5 text-xs sm:text-sm"
          >
            <Bell className="w-3.5 h-3.5" />
            Notificaciones
          </TabsTrigger>
          <TabsTrigger value="danger" className="gap-1.5 text-xs sm:text-sm">
            <AlertTriangle className="w-3.5 h-3.5" />
            Peligro
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* TAB: General Settings                                            */}
        {/* ================================================================ */}
        <TabsContent value="general">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5" />
                Informacion general
              </CardTitle>
              <CardDescription>
                Datos basicos de tu organizacion
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="orgName">Nombre de la organizacion</Label>
                <Input
                  id="orgName"
                  value={settings.orgName}
                  onChange={(e) => update("orgName", e.target.value)}
                  placeholder="Acme Corp"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug (URL)</Label>
                <Input
                  id="slug"
                  value={settings.slug}
                  onChange={(e) =>
                    update(
                      "slug",
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                    )
                  }
                  placeholder="acme-corp"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Solo letras minusculas, numeros y guiones
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logoUrl">URL del logo</Label>
                <div className="flex gap-2 items-center">
                  {settings.logoUrl && (
                    <img
                      src={settings.logoUrl}
                      alt="Logo"
                      className="w-10 h-10 rounded-lg object-cover border"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <Input
                    id="logoUrl"
                    value={settings.logoUrl}
                    onChange={(e) => update("logoUrl", e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripcion</Label>
                <Input
                  id="description"
                  value={settings.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Breve descripcion de tu organizacion"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB: Work Configuration                                          */}
        {/* ================================================================ */}
        <TabsContent value="work">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Configuracion de trabajo
              </CardTitle>
              <CardDescription>
                Define las reglas de horario y registro de horas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Expected daily hours */}
              <div className="space-y-2">
                <Label htmlFor="expectedDailyHours">
                  Horas diarias esperadas
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="expectedDailyHours"
                    type="number"
                    min={1}
                    max={12}
                    value={settings.expectedDailyHours}
                    onChange={(e) =>
                      update(
                        "expectedDailyHours",
                        Math.max(1, Math.min(12, parseInt(e.target.value) || 8))
                      )
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">
                    horas (1-12)
                  </span>
                </div>
              </div>

              <Separator />

              {/* Work hours range */}
              <div className="space-y-2">
                <Label>Rango de horas laborales</Label>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Inicio</span>
                    <Select
                      value={String(settings.workHoursStart)}
                      onValueChange={(v) =>
                        update("workHoursStart", parseInt(v as string))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {formatHour(i)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="text-muted-foreground mt-5">a</span>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Fin</span>
                    <Select
                      value={String(settings.workHoursEnd)}
                      onValueChange={(v) =>
                        update("workHoursEnd", parseInt(v as string))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {formatHour(i)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Proof requirement */}
              <div className="space-y-2">
                <Label>
                  <Eye className="w-4 h-4 inline mr-1.5" />
                  Nivel de evidencia requerido
                </Label>
                <Select
                  value={settings.proofRequirement}
                  onValueChange={(v) =>
                    update(
                      "proofRequirement",
                      v as "none" | "encouraged" | "required"
                    )
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguno</SelectItem>
                    <SelectItem value="encouraged">Recomendado</SelectItem>
                    <SelectItem value="required">Obligatorio</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {settings.proofRequirement === "none" &&
                    "No se requiere evidencia para las entradas"}
                  {settings.proofRequirement === "encouraged" &&
                    "Se recomienda agregar evidencia pero no es obligatorio"}
                  {settings.proofRequirement === "required" &&
                    "Todas las entradas deben incluir evidencia"}
                </p>
              </div>

              <Separator />

              {/* Max backfill hours */}
              <div className="space-y-2">
                <Label htmlFor="maxBackfill">
                  <FileText className="w-4 h-4 inline mr-1.5" />
                  Horas maximas de backfill
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="maxBackfill"
                    type="number"
                    min={0}
                    max={168}
                    value={settings.maxBackfillHours}
                    onChange={(e) =>
                      update(
                        "maxBackfillHours",
                        Math.max(
                          0,
                          Math.min(168, parseInt(e.target.value) || 24)
                        )
                      )
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">horas</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cuantas horas hacia atras se permite registrar entradas (anti-gaming)
                </p>
              </div>

              <Separator />

              {/* Min title length */}
              <div className="space-y-2">
                <Label htmlFor="minTitle">Longitud minima del titulo</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="minTitle"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.minTitleLength}
                    onChange={(e) =>
                      update(
                        "minTitleLength",
                        Math.max(
                          0,
                          Math.min(100, parseInt(e.target.value) || 10)
                        )
                      )
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">
                    caracteres
                  </span>
                </div>
              </div>

              <Separator />

              {/* Weekend logging */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-1.5">
                    <CalendarOff className="w-4 h-4" />
                    Permitir registro en fines de semana
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Si esta desactivado, no se podran registrar horas los sabados
                    y domingos
                  </p>
                </div>
                <Toggle
                  checked={settings.weekendLoggingAllowed}
                  onCheckedChange={(v) =>
                    update("weekendLoggingAllowed", v)
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB: Accountability Rules                                        */}
        {/* ================================================================ */}
        <TabsContent value="accountability">
          <div className="space-y-6">
            {/* Auto-flag rules */}
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Reglas de accountability
                </CardTitle>
                <CardDescription>
                  Configura banderas automaticas y umbrales
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Missing hours */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <Label className="font-medium">
                      Auto-flag: horas faltantes
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Marcar automaticamente cuando un miembro registra menos
                      horas que el umbral
                    </p>
                    {settings.autoFlagMissingHours && (
                      <div className="flex items-center gap-2 mt-2">
                        <Label className="text-xs">Umbral:</Label>
                        <Input
                          type="number"
                          min={1}
                          max={12}
                          value={settings.missingHoursThreshold}
                          onChange={(e) =>
                            update(
                              "missingHoursThreshold",
                              Math.max(
                                1,
                                Math.min(12, parseInt(e.target.value) || 6)
                              )
                            )
                          }
                          className="w-20 h-8"
                        />
                        <span className="text-xs text-muted-foreground">
                          horas
                        </span>
                      </div>
                    )}
                  </div>
                  <Toggle
                    checked={settings.autoFlagMissingHours}
                    onCheckedChange={(v) =>
                      update("autoFlagMissingHours", v)
                    }
                  />
                </div>

                <Separator />

                {/* No proof */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <Label className="font-medium">
                      Auto-flag: sin evidencia
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Marcar cuando el porcentaje de entradas sin evidencia
                      supera el umbral
                    </p>
                    {settings.autoFlagNoProof && (
                      <div className="flex items-center gap-2 mt-2">
                        <Label className="text-xs">Umbral:</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={settings.noProofThresholdPct}
                          onChange={(e) =>
                            update(
                              "noProofThresholdPct",
                              Math.max(
                                0,
                                Math.min(100, parseInt(e.target.value) || 50)
                              )
                            )
                          }
                          className="w-20 h-8"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    )}
                  </div>
                  <Toggle
                    checked={settings.autoFlagNoProof}
                    onCheckedChange={(v) => update("autoFlagNoProof", v)}
                  />
                </div>

                <Separator />

                {/* Late entries */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <Label className="font-medium">
                      Auto-flag: entradas tardias
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Marcar cuando el porcentaje de entradas tardias supera el
                      umbral
                    </p>
                    {settings.autoFlagLateEntries && (
                      <div className="flex items-center gap-2 mt-2">
                        <Label className="text-xs">Umbral:</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={settings.lateEntriesThresholdPct}
                          onChange={(e) =>
                            update(
                              "lateEntriesThresholdPct",
                              Math.max(
                                0,
                                Math.min(100, parseInt(e.target.value) || 30)
                              )
                            )
                          }
                          className="w-20 h-8"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    )}
                  </div>
                  <Toggle
                    checked={settings.autoFlagLateEntries}
                    onCheckedChange={(v) =>
                      update("autoFlagLateEntries", v)
                    }
                  />
                </div>

                <Separator />

                {/* Daily closeout */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="font-medium">
                      Requerir cierre diario
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Los miembros deben enviar un cierre al final de cada dia
                    </p>
                  </div>
                  <Toggle
                    checked={settings.requireDailyCloseout}
                    onCheckedChange={(v) =>
                      update("requireDailyCloseout", v)
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Trust score weights */}
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="w-5 h-5" />
                  Pesos del Trust Score
                </CardTitle>
                <CardDescription>
                  Configura como se calcula la puntuacion de confianza. Los pesos
                  deben sumar 100%.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={cn(
                    "text-sm font-medium text-right",
                    trustWeightTotal === 100
                      ? "text-green-600"
                      : "text-red-600"
                  )}
                >
                  Total: {trustWeightTotal}%{" "}
                  {trustWeightTotal === 100 ? (
                    <Check className="w-4 h-4 inline" />
                  ) : (
                    <span>(debe ser 100%)</span>
                  )}
                </div>

                {[
                  {
                    key: "trustWeightHours" as const,
                    label: "Horas registradas",
                    desc: "Peso por completar las horas esperadas",
                  },
                  {
                    key: "trustWeightProof" as const,
                    label: "Evidencia",
                    desc: "Peso por incluir pruebas en las entradas",
                  },
                  {
                    key: "trustWeightCloseout" as const,
                    label: "Cierre diario",
                    desc: "Peso por enviar cierre del dia",
                  },
                  {
                    key: "trustWeightLatePenalty" as const,
                    label: "Penalizacion por tardanza",
                    desc: "Penalizacion por entradas registradas tarde",
                  },
                  {
                    key: "trustWeightSuspiciousPenalty" as const,
                    label: "Penalizacion sospechoso",
                    desc: "Penalizacion por reacciones sospechosas",
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 space-y-0.5">
                      <Label className="text-sm">{item.label}</Label>
                      <p className="text-xs text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={settings[item.key]}
                        onChange={(e) =>
                          update(
                            item.key,
                            Math.max(
                              0,
                              Math.min(100, parseInt(e.target.value) || 0)
                            )
                          )
                        }
                        className="w-20 h-8 text-center"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                ))}

                {/* Visual bar */}
                {trustWeightTotal === 100 && (
                  <div className="flex h-3 rounded-full overflow-hidden mt-2">
                    <div
                      className="bg-blue-500"
                      style={{ width: `${settings.trustWeightHours}%` }}
                      title={`Horas: ${settings.trustWeightHours}%`}
                    />
                    <div
                      className="bg-green-500"
                      style={{ width: `${settings.trustWeightProof}%` }}
                      title={`Evidencia: ${settings.trustWeightProof}%`}
                    />
                    <div
                      className="bg-purple-500"
                      style={{ width: `${settings.trustWeightCloseout}%` }}
                      title={`Cierre: ${settings.trustWeightCloseout}%`}
                    />
                    <div
                      className="bg-amber-500"
                      style={{ width: `${settings.trustWeightLatePenalty}%` }}
                      title={`Tardanza: ${settings.trustWeightLatePenalty}%`}
                    />
                    <div
                      className="bg-red-500"
                      style={{ width: `${settings.trustWeightSuspiciousPenalty}%` }}
                      title={`Sospechoso: ${settings.trustWeightSuspiciousPenalty}%`}
                    />
                  </div>
                )}
                {trustWeightTotal === 100 && (
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      Horas
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      Evidencia
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                      Cierre
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      Tardanza
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      Sospechoso
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB: Notifications                                               */}
        {/* ================================================================ */}
        <TabsContent value="notifications">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notificaciones
              </CardTitle>
              <CardDescription>
                Configura como y cuando se envian notificaciones al equipo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Daily digest */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Resumen diario por email</Label>
                  <p className="text-xs text-muted-foreground">
                    Envia un resumen diario del equipo a los admins
                  </p>
                </div>
                <Toggle
                  checked={settings.dailyDigestEmail}
                  onCheckedChange={(v) => update("dailyDigestEmail", v)}
                />
              </div>

              <Separator />

              {/* Slack webhook */}
              <div className="space-y-2">
                <Label htmlFor="slackWebhook" className="flex items-center gap-1.5">
                  <Link2 className="w-4 h-4" />
                  Slack Webhook URL
                </Label>
                <Input
                  id="slackWebhook"
                  value={settings.slackWebhookUrl}
                  onChange={(e) => update("slackWebhookUrl", e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Conecta un canal de Slack para recibir notificaciones
                  automaticas
                </p>
              </div>

              <Separator />

              {/* Flag notifications */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Notificaciones de banderas</Label>
                  <p className="text-xs text-muted-foreground">
                    Notificar a admins cuando se activan banderas de
                    accountability
                  </p>
                </div>
                <Toggle
                  checked={settings.flagNotifications}
                  onCheckedChange={(v) => update("flagNotifications", v)}
                />
              </div>

              <Separator />

              {/* Closeout reminders */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <Label className="font-medium">Recordatorio de cierre</Label>
                  <p className="text-xs text-muted-foreground">
                    Envia un recordatorio a los miembros que no han hecho su
                    cierre del dia
                  </p>
                  {settings.closeoutReminders && (
                    <div className="flex items-center gap-2 mt-2">
                      <Label className="text-xs">Hora:</Label>
                      <Input
                        type="time"
                        value={settings.closeoutReminderTime}
                        onChange={(e) =>
                          update("closeoutReminderTime", e.target.value)
                        }
                        className="w-32 h-8"
                      />
                    </div>
                  )}
                </div>
                <Toggle
                  checked={settings.closeoutReminders}
                  onCheckedChange={(v) => update("closeoutReminders", v)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB: Danger Zone                                                 */}
        {/* ================================================================ */}
        <TabsContent value="danger">
          <Card className="rounded-2xl border-red-200 dark:border-red-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Zona de peligro
              </CardTitle>
              <CardDescription>
                Acciones irreversibles. Procede con precaucion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Export all data */}
              <div className="flex items-center justify-between p-4 rounded-xl border">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-medium">Exportar todos los datos</h3>
                  <p className="text-xs text-muted-foreground">
                    Descarga la configuracion completa de la organizacion como
                    JSON
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleExportAll}
                  className="gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  Exportar
                </Button>
              </div>

              <Separator />

              {/* Transfer ownership */}
              <div className="p-4 rounded-xl border">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-medium">
                      Transferir propiedad
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Transfiere la propiedad de la organizacion a otro admin
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Input
                    placeholder="Email del nuevo owner"
                    value={transferEmail}
                    onChange={(e) => setTransferEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Dialog>
                    <DialogTrigger
                      render={
                        <Button
                          variant="outline"
                          disabled={!transferEmail.trim()}
                          className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                        />
                      }
                    >
                      <UserCog className="w-4 h-4" />
                      Transferir
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirmar transferencia</DialogTitle>
                        <DialogDescription>
                          Transferiras la propiedad de &quot;{settings.orgName}
                          &quot; a <strong>{transferEmail}</strong>. Tu rol
                          cambiara a admin. Esta accion no se puede deshacer
                          facilmente.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose
                          render={<Button variant="outline" />}
                        >
                          Cancelar
                        </DialogClose>
                        <Button
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={() => {
                            alert(
                              `Transferencia a ${transferEmail} registrada. Contacta soporte para completar el proceso.`
                            );
                            setTransferEmail("");
                          }}
                        >
                          Confirmar transferencia
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <Separator />

              {/* Delete organization */}
              <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10">
                <div className="space-y-0.5 mb-3">
                  <h3 className="text-sm font-medium text-red-700 dark:text-red-400">
                    Eliminar organizacion
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Elimina permanentemente la organizacion y todos sus datos.
                    Esta accion es <strong>irreversible</strong>.
                  </p>
                </div>
                <Dialog>
                  <DialogTrigger
                    render={
                      <Button
                        variant="outline"
                        className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                      />
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar organizacion
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="text-red-600">
                        Eliminar organizacion
                      </DialogTitle>
                      <DialogDescription>
                        Esta accion es permanente y no se puede deshacer. Se
                        eliminaran todos los datos de la organizacion, miembros,
                        entradas, y configuraciones.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                      <Label className="text-sm">
                        Escribe <strong>{settings.orgName || "el nombre"}</strong>{" "}
                        para confirmar:
                      </Label>
                      <Input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder={settings.orgName}
                        className="font-mono"
                      />
                    </div>
                    <DialogFooter>
                      <DialogClose
                        render={<Button variant="outline" />}
                      >
                        Cancelar
                      </DialogClose>
                      <Button
                        variant="destructive"
                        disabled={deleteConfirmText !== settings.orgName}
                        onClick={handleDeleteOrg}
                      >
                        Eliminar permanentemente
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
