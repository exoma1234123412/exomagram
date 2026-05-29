"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
 Clock,
 MessageSquare,
 BarChart3,
 ArrowRight,
 Sparkles,
} from "lucide-react";

const STEPS = [
 {
 number: 1,
 icon: Clock,
 title:"Registra tu primera hora",
 description:
"Cada hora de trabajo cuenta. Ve a tu timeline, registra qué hiciste, en qué proyecto y cuánto tiempo dedicaste. Así de simple.",
 href:"/dashboard",
 cta:"Ir al timeline",
 },
 {
 number: 2,
 icon: MessageSquare,
 title:"Haz tu Standup",
 description:
"Comparte con tu equipo qué lograste ayer, qué harás hoy y si tienes algún bloqueo. Toma menos de un minuto.",
 href:"/standup",
 cta:"Ir al Standup",
 },
 {
 number: 3,
 icon: BarChart3,
 title:"Explora el dashboard",
 description:
"Revisa tu progreso, las horas registradas y el pulso de tu equipo. Todo en un solo lugar.",
 href:"/dashboard",
 cta:"Ver dashboard",
 },
] as const;

export default function WelcomePage() {
 return (
 <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
 {/* Hero */}
 <section className="text-center mb-14">
 <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
 <Sparkles className="w-4 h-4"/>
 Bienvenido a Exomagram
 </div>

 <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
 Empieza en 3 pasos
 </h1>
 <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
 Configura lo esencial para que tu equipo tenga transparencia total desde el primer día.
 </p>
 </section>

 {/* Steps */}
 <section className="space-y-4 mb-14">
 {STEPS.map((step, i) => {
 const Icon = step.icon;
 return (
 <div
 key={step.number}
 className={cn(
"group relative border border-border/60 bg-card/80 p-6",
"transition-all duration-300 hover:border-primary/30 hover:-translate-y-0.5")}
 >
 <div className="flex gap-5 items-start">
 {/* Number + connector */}
 <div className="flex flex-col items-center shrink-0">
 <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-md">
 {step.number}
 </div>
 {i < STEPS.length - 1 && (
 <div className="w-px h-6 bg-border mt-2 hidden sm:block"/>
 )}
 </div>

 {/* Content */}
 <div className="flex-1 min-w-0 pt-0.5">
 <div className="flex items-center gap-2 mb-1.5">
 <Icon className="w-4.5 h-4.5 text-primary"/>
 <h3 className="text-base font-semibold tracking-tight">
 {step.title}
 </h3>
 </div>
 <p className="text-sm text-muted-foreground leading-relaxed mb-4">
 {step.description}
 </p>
 <Link href={step.href}>
 <Button
 variant="outline"size="sm"className="gap-1.5 text-xs">
 {step.cta}
 <ArrowRight className="w-3.5 h-3.5"/>
 </Button>
 </Link>
 </div>
 </div>
 </div>
 );
 })}
 </section>

 {/* CTA */}
 <section className="text-center">
 <Link href="/home">
 <Button
 size="lg"className="px-10 py-6 text-base font-semibold shadow-primary/20 transition-all duration-300 hover:scale-[1.02]">
 Empezar
 <ArrowRight className="w-5 h-5 ml-1.5"/>
 </Button>
 </Link>
 </section>
 </div>
 );
}
