"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
 Sparkles,
 Rss,
 Eye,
 Trophy,
 UserCircle,
 AlertTriangle,
 Brain,
 Camera,
 CalendarClock,
 ClipboardCheck,
 Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChangelogEntry {
 date: string;
 title: string;
 description: string;
 category:"Feature"|"Mejora"|"AI";
 icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const CHANGELOG: ChangelogEntry[] = [
 {
 date:"Mayo 2026",
 title:"Feed Social",
 description:"Feed tipo Instagram para ver el trabajo del equipo",
 category:"Feature",
 icon: <Rss className="w-5 h-5"/>,
 },
 {
 date:"Mayo 2026",
 title:"Vigilancia Total",
 description:
"Muro de vigilancia en tiempo real, activity log, timeline visual",
 category:"Feature",
 icon: <Eye className="w-5 h-5"/>,
 },
 {
 date:"Mayo 2026",
 title:"Power Rankings",
 description:
"Rankings semanales con hot takes y jugador de la semana",
 category:"Feature",
 icon: <Trophy className="w-5 h-5"/>,
 },
 {
 date:"Mayo 2026",
 title:"El Espejo",
 description:
"Ve exactamente cómo te ve tu equipo + calculadora de arrepentimiento",
 category:"Mejora",
 icon: <UserCircle className="w-5 h-5"/>,
 },
 {
 date:"Mayo 2026",
 title:"Sistema de Presión",
 description:
"Urgency engine, ghost detector, gap analyzer, inactivity alarm",
 category:"Feature",
 icon: <AlertTriangle className="w-5 h-5"/>,
 },
 {
 date:"Mayo 2026",
 title:"Claude Brain",
 description:"Pregúntale a Claude cualquier cosa sobre tu equipo",
 category:"AI",
 icon: <Brain className="w-5 h-5"/>,
 },
 {
 date:"Mayo 2026",
 title:"Stories",
 description:"Historias de trabajo estilo Instagram",
 category:"Feature",
 icon: <Camera className="w-5 h-5"/>,
 },
 {
 date:"Mayo 2026",
 title:"Sprints & Capacidad",
 description:"Planificación de sprints y capacidad del equipo",
 category:"Feature",
 icon: <CalendarClock className="w-5 h-5"/>,
 },
 {
 date:"Mayo 2026",
 title:"Performance Reviews",
 description:"Reviews automáticos por empleado",
 category:"AI",
 icon: <ClipboardCheck className="w-5 h-5"/>,
 },
 {
 date:"Mayo 2026",
 title:"Accountability Buddies",
 description:"Sistema de parejas de accountability",
 category:"Feature",
 icon: <Users className="w-5 h-5"/>,
 },
];

// ---------------------------------------------------------------------------
// Category badge config
// ---------------------------------------------------------------------------

const CATEGORY_STYLES: Record<
 ChangelogEntry["category"],
 { bg: string; text: string }
> = {
 Feature: {
 bg:"bg-blue-100 dark:bg-blue-950/40",
 text:"text-blue-700 dark:text-blue-300",
 },
 Mejora: {
 bg:"bg-emerald-100 dark:bg-emerald-950/40",
 text:"text-emerald-700 dark:text-emerald-300",
 },
 AI: {
 bg:"bg-violet-100 dark:bg-violet-950/40",
 text:"text-violet-700 dark:text-violet-300",
 },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChangelogPage() {
 return (
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="flex items-center gap-3 mb-1">
 <Sparkles className="w-6 h-6 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">Novedades</h1>
 </div>
 <p className="text-sm text-muted-foreground mb-8">
 Las últimas funcionalidades y mejoras de Exomagram.
 </p>

 {/* Timeline */}
 <div className="relative">
 {/* Timeline line */}
 <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border"/>

 <div className="space-y-6">
 {CHANGELOG.map((entry, idx) => {
 const catStyle = CATEGORY_STYLES[entry.category];

 return (
 <div key={idx} className="relative flex gap-5">
 {/* Timeline dot */}
 <div className="relative z-10 flex-shrink-0">
 <div
 className={cn(
"w-10 h-10 rounded-full flex items-center justify-center",
"bg-card border-2 border-border text-primary")}
 >
 {entry.icon}
 </div>
 </div>

 {/* Card */}
 <Card className="flex-1 transition-all duration-200 hover:border-primary/30">
 <CardContent className="p-4 sm:p-5">
 {/* Top row: date + category */}
 <div className="flex items-center gap-2 mb-2 flex-wrap">
 <Badge
 variant="outline"className="text-[10px] font-semibold px-2 py-0.5 tabular-nums tracking-tight">
 {entry.date}
 </Badge>
 <Badge
 className={cn(
"text-[10px] font-semibold px-2 py-0.5 border-0",
 catStyle.bg,
 catStyle.text
 )}
 >
 {entry.category}
 </Badge>
 </div>

 {/* Title */}
 <h3 className="text-base font-bold leading-snug mb-1">
 {entry.title}
 </h3>

 {/* Description */}
 <p className="text-sm text-muted-foreground leading-relaxed">
 {entry.description}
 </p>
 </CardContent>
 </Card>
 </div>
 );
 })}
 </div>
 </div>
 </div>
 );
}
