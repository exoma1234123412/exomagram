"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Wrench,
 Calculator,
 Clock,
 Globe,
 Download,
 Link2,
 Plus,
 Layers,
 FileCheck,
 BookOpen,
 Keyboard,
 Users,
 DollarSign,
 AlertTriangle,
 TrendingUp,
 Zap,
 Timer,
 Settings,
 ChevronRight,
} from "lucide-react";
import type { WorkCategory } from "@/lib/types/database";

// ─── Meeting Cost Calculator ────────────────────────────────────────

function MeetingCostSection() {
 const [participants, setParticipants] = useState(4);
 const [durationMin, setDurationMin] = useState(30);
 const [avgHourlyRate, setAvgHourlyRate] = useState(150);

 const personHours = (participants * durationMin) / 60;
 const equivalentDays = personHours / EXPECTED_DAILY_HOURS;
 const totalCost = personHours * avgHourlyRate;

 // Severity thresholds
 const severity =
 totalCost > 2000
 ?"critical": totalCost > 800
 ?"high": totalCost > 300
 ?"medium":"low";

 const severityConfig = {
 critical: {
 bar:"bg-gradient-to-r from-red-500 to-red-600",
 text:"text-red-600 dark:text-red-400",
 bg:"bg-red-50 dark:bg-red-950/20",
 border:"border-red-200 dark:border-red-800/50",
 label:"Costo critico",
 },
 high: {
 bar:"bg-gradient-to-r from-orange-500 to-amber-500",
 text:"text-orange-600 dark:text-orange-400",
 bg:"bg-orange-50 dark:bg-orange-950/20",
 border:"border-orange-200 dark:border-orange-800/50",
 label:"Costo alto",
 },
 medium: {
 bar:"bg-gradient-to-r from-yellow-500 to-amber-400",
 text:"text-yellow-600 dark:text-yellow-400",
 bg:"bg-yellow-50 dark:bg-yellow-950/20",
 border:"border-yellow-200 dark:border-yellow-800/50",
 label:"Costo moderado",
 },
 low: {
 bar:"bg-gradient-to-r from-green-500 to-emerald-500",
 text:"text-green-600 dark:text-green-400",
 bg:"bg-green-50 dark:bg-green-950/20",
 border:"border-green-200 dark:border-green-800/50",
 label:"Costo razonable",
 },
 };

 const config = severityConfig[severity];

 // Cost bar width (max at $3000)
 const barPercent = Math.min((totalCost / 3000) * 100, 100);

 return (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Calculator className="w-5 h-5 text-primary"/>
 Calculadora de Costo de Reunion
 </CardTitle>
 <CardDescription>
 Visualiza el costo real de una reunion antes de agendarla
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-5">
 {/* Inputs */}
 <div className="grid grid-cols-3 gap-3">
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center gap-1">
 <Users className="w-3 h-3"/> Participantes
 </Label>
 <Input
 type="number"min={1}
 max={100}
 value={participants}
 onChange={(e) =>
 setParticipants(Math.max(1, parseInt(e.target.value) || 1))
 }
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center gap-1">
 <Clock className="w-3 h-3"/> Minutos
 </Label>
 <Input
 type="number"min={5}
 max={480}
 step={5}
 value={durationMin}
 onChange={(e) =>
 setDurationMin(Math.max(5, parseInt(e.target.value) || 5))
 }
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs flex items-center gap-1">
 <DollarSign className="w-3 h-3"/> $/hora prom
 </Label>
 <Input
 type="number"min={1}
 value={avgHourlyRate}
 onChange={(e) =>
 setAvgHourlyRate(Math.max(1, parseInt(e.target.value) || 1))
 }
 />
 </div>
 </div>

 {/* Visceral cost visualization */}
 <div
 className={cn(
"border p-4 space-y-3 transition-all",
 config.bg,
 config.border
 )}
 >
 {/* Cost bar */}
 <div className="space-y-1.5">
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">Costo total</span>
 <Badge
 variant="outline"className={cn("text-xs", config.text, config.border)}
 >
 {config.label}
 </Badge>
 </div>
 <div className="h-3 bg-muted rounded-full overflow-hidden">
 <div
 className={cn(
"h-full rounded-full transition-all duration-500",
 config.bar
 )}
 style={{ width:`${barPercent}%`}}
 />
 </div>
 </div>

 {/* Big cost number */}
 <div className="text-center py-2">
 <p
 className={cn(
"text-4xl font-mono font-bold tracking-tight",
 config.text
 )}
 >
 ${totalCost.toLocaleString("en-US", { minimumFractionDigits: 0 })}
 </p>
 <p className="text-sm text-muted-foreground mt-1">
 {personHours.toFixed(1)} persona-horas ={""}
 {equivalentDays.toFixed(1)} dias laborales equivalentes
 </p>
 </div>

 {/* Comparison chips */}
 <div className="flex flex-wrap gap-2 justify-center">
 {totalCost >= 50 && (
 <Badge variant="secondary"className="text-xs">
 {Math.floor(totalCost / 5)} cafes
 </Badge>
 )}
 {totalCost >= 200 && (
 <Badge variant="secondary"className="text-xs">
 {Math.floor(totalCost / 50)} licencias mensuales SaaS
 </Badge>
 )}
 {totalCost >= 500 && (
 <Badge variant="secondary"className="text-xs">
 {(totalCost / 300).toFixed(1)} meses de hosting
 </Badge>
 )}
 {totalCost >= 1000 && (
 <Badge variant="secondary"className="text-xs">
 <AlertTriangle className="w-3 h-3 mr-1"/>
 Esto pudo ser un email?
 </Badge>
 )}
 </div>
 </div>

 {/* Quick presets */}
 <div className="flex flex-wrap gap-2">
 <span className="text-xs text-muted-foreground self-center mr-1">
 Presets:
 </span>
 {[
 { label:"Standup", p: 5, m: 15 },
 { label:"1:1", p: 2, m: 30 },
 { label:"Sprint planning", p: 8, m: 60 },
 { label:"All-hands", p: 20, m: 45 },
 ].map((preset) => (
 <Button
 key={preset.label}
 variant="outline"size="xs"onClick={() => {
 setParticipants(preset.p);
 setDurationMin(preset.m);
 }}
 >
 {preset.label}
 </Button>
 ))}
 </div>
 </CardContent>
 </Card>
 );
}

// ─── Time Estimator ─────────────────────────────────────────────────

const TASK_ESTIMATES: Record<
 WorkCategory,
 { avgMinutes: number; optimalBlock: string; energyTip: string }
> = {
 deep_work: {
 avgMinutes: 120,
 optimalBlock:"9:00 - 11:00 AM",
 energyTip:"Mejor cuando tu energia esta en 4-5. Bloquea notificaciones.",
 },
 meeting: {
 avgMinutes: 45,
 optimalBlock:"2:00 - 3:00 PM",
 energyTip:"Post-almuerzo es ideal. Evita agendar en horario de deep work.",
 },
 review: {
 avgMinutes: 35,
 optimalBlock:"11:00 AM - 12:00 PM",
 energyTip:"Requiere atencion pero menos creatividad. Buen para transicion.",
 },
 admin: {
 avgMinutes: 20,
 optimalBlock:"4:00 - 5:00 PM",
 energyTip:"Tareas de baja energia. Ideal para final del dia.",
 },
 planning: {
 avgMinutes: 60,
 optimalBlock:"10:00 - 11:00 AM",
 energyTip:"Necesitas mente despejada. Hazlo temprano en la semana.",
 },
 learning: {
 avgMinutes: 45,
 optimalBlock:"3:00 - 4:00 PM",
 energyTip:"El aprendizaje activo necesita energia media. Alterna con practica.",
 },
 break: {
 avgMinutes: 15,
 optimalBlock:"Cada 90 min",
 energyTip:"Descansos regulares mantienen tu productividad alta.",
 },
 blocked: {
 avgMinutes: 0,
 optimalBlock:"Resolver ASAP",
 energyTip:"Escala rapido. Cada hora bloqueado es una hora perdida.",
 },
};

function TimeEstimatorSection() {
 const [taskDescription, setTaskDescription] = useState("");
 const [selectedCategory, setSelectedCategory] = useState<WorkCategory |"">(
"");

 // Simple keyword-based category detection
 const detectedCategory = useMemo((): WorkCategory | null => {
 if (!taskDescription.trim()) return null;
 const lower = taskDescription.toLowerCase();

 const keywords: Record<WorkCategory, string[]> = {
 deep_work: [
"codigo",
"code",
"implementar",
"desarrollar",
"feature",
"build",
"construir",
"disenar",
"arquitectura",
 ],
 meeting: [
"reunion",
"meeting",
"call",
"sync",
"standup",
"1:1",
"junta",
"llamada",
 ],
 review: [
"review",
"pr",
"pull request",
"revisar",
"feedback",
"aprobar",
 ],
 admin: [
"email",
"correo",
"slack",
"reporte",
"admin",
"documentar",
"ticket",
 ],
 planning: [
"plan",
"roadmap",
"sprint",
"backlog",
"priorizar",
"estimacion",
"scope",
 ],
 learning: [
"aprender",
"curso",
"tutorial",
"investigar",
"research",
"leer",
"estudiar",
 ],
 break: ["descanso","break","cafe","almuerzo","caminar"],
 blocked: ["bloqueado","blocked","esperando","dependencia","bug"],
 };

 for (const [cat, words] of Object.entries(keywords)) {
 if (words.some((w) => lower.includes(w))) {
 return cat as WorkCategory;
 }
 }
 return null;
 }, [taskDescription]);

 const activeCategory = (selectedCategory ||
 detectedCategory) as WorkCategory | null;
 const estimate = activeCategory ? TASK_ESTIMATES[activeCategory] : null;
 const categoryInfo = activeCategory ? CATEGORIES[activeCategory] : null;

 return (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Timer className="w-5 h-5 text-primary"/>
 Estimador de Tiempo
 </CardTitle>
 <CardDescription>
 Describe tu tarea y obtendras tiempo estimado y bloque optimo
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="space-y-1.5">
 <Label className="text-xs">Descripcion de la tarea</Label>
 <Input
 placeholder="Ej: Revisar PR del feature de autenticacion..."value={taskDescription}
 onChange={(e) => setTaskDescription(e.target.value)}
 />
 </div>

 <div className="space-y-1.5">
 <Label className="text-xs">
 Categoria{""}
 {detectedCategory && !selectedCategory && (
 <span className="text-muted-foreground ml-1">(auto-detectada)</span>
 )}
 </Label>
 <Select
 value={selectedCategory || detectedCategory || undefined}
 onValueChange={(v) => setSelectedCategory(v as WorkCategory)}
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Selecciona o escribe arriba..."/>
 </SelectTrigger>
 <SelectContent>
 {(Object.keys(CATEGORIES) as WorkCategory[]).map((cat) => (
 <SelectItem key={cat} value={cat}>
 {CATEGORIES[cat].emoji} {CATEGORIES[cat].label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 {estimate && categoryInfo && (
 <div className="space-y-3 pt-1">
 <div className="grid grid-cols-2 gap-3">
 <div className="flex gap-3 p-3 bg-accent/40">
 <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0"/>
 <div>
 <p className="text-xs text-muted-foreground">
 Tiempo promedio
 </p>
 <p className="font-semibold text-sm">
 {estimate.avgMinutes > 0
 ?`${estimate.avgMinutes} min`:"Variable"}
 </p>
 </div>
 </div>
 <div className="flex gap-3 p-3 bg-accent/40">
 <TrendingUp className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0"/>
 <div>
 <p className="text-xs text-muted-foreground">Bloque optimo</p>
 <p className="font-semibold text-sm">
 {estimate.optimalBlock}
 </p>
 </div>
 </div>
 </div>

 <div className="flex gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40">
 <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0"/>
 <div>
 <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
 Consejo de energia
 </p>
 <p className="text-sm text-muted-foreground">
 {estimate.energyTip}
 </p>
 </div>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 );
}

// ─── Quick Links ────────────────────────────────────────────────────

const QUICK_LINKS = [
 {
 label:"Registrar entrada",
 href:"/dashboard",
 icon: Plus,
 shortcut:"N",
 description:"Nuevo registro de horas",
 },
 {
 label:"Registro masivo",
 href:"/dashboard",
 icon: Layers,
 shortcut:"B",
 description:"Multiples entradas a la vez",
 },
 {
 label:"Cierre del dia",
 href:"/dashboard",
 icon: FileCheck,
 shortcut:"D",
 description:"Resumen y reflexion diaria",
 },
 {
 label:"Diario semanal",
 href:"/journal",
 icon: BookOpen,
 shortcut:"J",
 description:"Reflexion y metricas de la semana",
 },
];

function QuickLinksSection() {
 return (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Link2 className="w-5 h-5 text-primary"/>
 Acciones Rapidas
 </CardTitle>
 <CardDescription>
 Accesos directos a las acciones mas comunes
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-1.5">
 {QUICK_LINKS.map((link) => (
 <a
 key={link.label}
 href={link.href}
 className="flex items-center gap-3 p-3 hover:bg-accent/60 transition-colors group">
 <div className="w-9 h-9 bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
 <link.icon className="w-4 h-4 text-primary"/>
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium">{link.label}</p>
 <p className="text-xs text-muted-foreground">
 {link.description}
 </p>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 <Badge variant="outline"className="text-[10px] font-mono px-1.5">
 <Keyboard className="w-2.5 h-2.5 mr-0.5"/>
 {link.shortcut}
 </Badge>
 <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"/>
 </div>
 </a>
 ))}
 </CardContent>
 </Card>
 );
}

// ─── Timezone Converter ─────────────────────────────────────────────

interface TimezoneInfo {
 label: string;
 tz: string;
 flag: string;
 teamHint: string;
}

const TIMEZONES: TimezoneInfo[] = [
 {
 label:"Ciudad de Mexico",
 tz:"America/Mexico_City",
 flag:"MX",
 teamHint:"Equipo principal",
 },
 {
 label:"Nueva York",
 tz:"America/New_York",
 flag:"US",
 teamHint:"Equipo East Coast",
 },
 {
 label:"Londres",
 tz:"Europe/London",
 flag:"GB",
 teamHint:"Equipo Europa",
 },
 {
 label:"Tokio",
 tz:"Asia/Tokyo",
 flag:"JP",
 teamHint:"Equipo Asia-Pacific",
 },
];

function getTimeInTimezone(tz: string): { time: string; hour: number } {
 const now = new Date();
 const formatter = new Intl.DateTimeFormat("es-MX", {
 timeZone: tz,
 hour:"2-digit",
 minute:"2-digit",
 hour12: false,
 });
 const time = formatter.format(now);

 const hourFormatter = new Intl.DateTimeFormat("en-US", {
 timeZone: tz,
 hour:"numeric",
 hour12: false,
 });
 const hour = parseInt(hourFormatter.format(now));

 return { time, hour };
}

function getOnlineStatus(hour: number): {
 label: string;
 color: string;
 dotColor: string;
} {
 if (hour >= 9 && hour < 18)
 return {
 label:"En horario laboral",
 color:"text-green-600 dark:text-green-400",
 dotColor:"bg-green-500",
 };
 if (hour >= 8 && hour < 9)
 return {
 label:"Entrando",
 color:"text-yellow-600 dark:text-yellow-400",
 dotColor:"bg-yellow-500",
 };
 if (hour >= 18 && hour < 20)
 return {
 label:"Saliendo",
 color:"text-yellow-600 dark:text-yellow-400",
 dotColor:"bg-yellow-500",
 };
 return {
 label:"Fuera de horario",
 color:"text-muted-foreground",
 dotColor:"bg-gray-400",
 };
}

function TimezoneSection() {
 const [now, setNow] = useState(new Date());

 useEffect(() => {
 const interval = setInterval(() => setNow(new Date()), 30_000);
 return () => clearInterval(interval);
 }, []);

 return (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Globe className="w-5 h-5 text-primary"/>
 Zonas Horarias del Equipo
 </CardTitle>
 <CardDescription>
 Horario actual y disponibilidad estimada
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-2">
 {TIMEZONES.map((zone) => {
 const { time, hour } = getTimeInTimezone(zone.tz);
 const status = getOnlineStatus(hour);

 return (
 <div
 key={zone.tz}
 className="flex items-center gap-3 p-3 bg-accent/30 hover:bg-accent/50 transition-colors">
 <div className="w-9 h-9 bg-muted flex items-center justify-center text-xs font-bold shrink-0">
 {zone.flag}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <p className="text-sm font-medium">{zone.label}</p>
 <div className="flex items-center gap-1.5">
 <span
 className={cn(
"w-1.5 h-1.5 rounded-full",
 status.dotColor
 )}
 />
 <span className={cn("text-[10px]", status.color)}>
 {status.label}
 </span>
 </div>
 </div>
 <p className="text-xs text-muted-foreground">
 {zone.teamHint}
 </p>
 </div>
 <p className="text-lg font-mono font-semibold tabular-nums shrink-0">
 {time}
 </p>
 </div>
 );
 })}
 </CardContent>
 </Card>
 );
}

// ─── Export / Import ────────────────────────────────────────────────

function ExportImportSection() {
 const [exporting, setExporting] = useState(false);
 const [exportDone, setExportDone] = useState(false);
 const supabase = createClient();

 async function exportThisWeek() {
 setExporting(true);
 setExportDone(false);

 try {
 const {
 data: { user },
 } = await supabase.auth.getUser();
 if (!user) return;

 // Get this week's start (Monday)
 const today = new Date();
 const dayOfWeek = today.getDay();
 const monday = new Date(today);
 monday.setDate(
 today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
 );
 const mondayStr = monday.toISOString().split("T")[0];
 const todayStr = today.toISOString().split("T")[0];

 const { data: entries } = await supabase
 .from("time_entries")
 .select("title, category, duration_minutes, date, start_time, end_time, proof_url, notes")
 .eq("user_id", user.id)
 .gte("date", mondayStr)
 .lte("date", todayStr)
 .order("date", { ascending: true })
 .order("start_time", { ascending: true });

 if (!entries || entries.length === 0) {
 alert("No hay entradas esta semana para exportar.");
 setExporting(false);
 return;
 }

 // Build CSV
 const headers = [
"Fecha",
"Titulo",
"Categoria",
"Duracion (min)",
"Hora inicio",
"Hora fin",
"Evidencia",
"Notas",
 ];
 const rows = entries.map((e) => [
 e.date,
`"${(e.title ||"").replace(/"/g, '""')}"`,
 CATEGORIES[e.category as WorkCategory]?.label || e.category,
 e.duration_minutes,
 e.start_time ||"",
 e.end_time ||"",
 e.proof_url ||"",
`"${(e.notes ||"").replace(/"/g, '""')}"`,
 ]);

 const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join(
"\n");

 const blob = new Blob([csv], { type:"text/csv;charset=utf-8;"});
 const url = URL.createObjectURL(blob);
 const link = document.createElement("a");
 link.href = url;
 link.download =`exomagram-semana-${mondayStr}.csv`;
 link.click();
 URL.revokeObjectURL(url);

 setExportDone(true);
 setTimeout(() => setExportDone(false), 3000);
 } catch {
 alert("Error al exportar. Intenta de nuevo.");
 } finally {
 setExporting(false);
 }
 }

 return (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Download className="w-5 h-5 text-primary"/>
 Exportar / Importar
 </CardTitle>
 <CardDescription>
 Descarga tus registros o configura exportaciones completas
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 {/* Quick CSV export */}
 <div className="flex gap-3 p-4 border border-border/50 bg-accent/20">
 <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white shrink-0">
 <Download className="w-5 h-5"/>
 </div>
 <div className="flex-1">
 <p className="text-sm font-medium">Exportar esta semana (CSV)</p>
 <p className="text-xs text-muted-foreground">
 Descarga todas tus entradas de la semana actual en formato CSV
 </p>
 </div>
 <Button
 variant="outline"size="sm"onClick={exportThisWeek}
 disabled={exporting}
 className="shrink-0 self-center">
 {exporting
 ?"Exportando...": exportDone
 ?"Listo!":"Descargar"}
 </Button>
 </div>

 {/* Full export link */}
 <a
 href="/settings"className="flex gap-3 p-4 border border-border/50 hover:bg-accent/40 transition-colors group">
 <div className="w-10 h-10 bg-primary flex items-center justify-center text-white shrink-0">
 <Settings className="w-5 h-5"/>
 </div>
 <div className="flex-1">
 <p className="text-sm font-medium">Exportacion completa</p>
 <p className="text-xs text-muted-foreground">
 Exporta todo tu historial, configura formatos y backups automaticos
 </p>
 </div>
 <ChevronRight className="w-4 h-4 text-muted-foreground self-center opacity-0 group-hover:opacity-100 transition-opacity"/>
 </a>
 </CardContent>
 </Card>
 );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function ToolsPage() {
 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <Wrench className="w-6 h-6 text-primary"/>
 Herramientas
 </h1>
 <p className="text-muted-foreground text-sm">
 Herramientas de productividad para optimizar tu dia a dia
 </p>
 </div>

 {/* Main grid layout */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Left column */}
 <div className="space-y-6">
 <MeetingCostSection />
 <QuickLinksSection />
 </div>

 {/* Right column */}
 <div className="space-y-6">
 <TimeEstimatorSection />
 <TimezoneSection />
 </div>
 </div>

 {/* Full-width bottom section */}
 <div className="mt-6">
 <ExportImportSection />
 </div>
 </div>
 );
}
