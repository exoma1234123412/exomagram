"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Clock,
  Camera,
  ClipboardCheck,
  Users,
  ArrowRight,
  Command,
  Sparkles,
} from "lucide-react";

const STEPS = [
  {
    number: 1,
    emoji: "\u23F1\uFE0F",
    icon: Clock,
    title: "Registra tu primera hora",
    description:
      "Cada hora de trabajo cuenta. Registra que hiciste, en que proyecto, y cuanto tiempo dedicaste. Asi de simple.",
    cta: "Registrar ahora",
    href: "/dashboard",
    gradient: "from-violet-500 to-indigo-500",
    glow: "shadow-violet-500/20",
    bgLight: "bg-violet-50 dark:bg-violet-950/30",
    borderLight: "border-violet-200/60 dark:border-violet-800/40",
  },
  {
    number: 2,
    emoji: "\uD83D\uDCF8",
    icon: Camera,
    title: "Agrega evidencia",
    description:
      "Sube capturas de pantalla, links, o archivos que demuestren tu trabajo. La transparencia se construye con pruebas.",
    cta: "Ver como funciona",
    href: "/dashboard",
    gradient: "from-indigo-500 to-blue-500",
    glow: "shadow-indigo-500/20",
    bgLight: "bg-indigo-50 dark:bg-indigo-950/30",
    borderLight: "border-indigo-200/60 dark:border-indigo-800/40",
  },
  {
    number: 3,
    emoji: "\u2705",
    icon: ClipboardCheck,
    title: "Completa tu cierre diario",
    description:
      "Al final del dia, haz tu closeout: resumen del dia, mood, y reflexion. Tu equipo sabra exactamente que lograste.",
    cta: "Explorar cierres",
    href: "/dashboard",
    gradient: "from-blue-500 to-cyan-500",
    glow: "shadow-blue-500/20",
    bgLight: "bg-blue-50 dark:bg-blue-950/30",
    borderLight: "border-blue-200/60 dark:border-blue-800/40",
  },
  {
    number: 4,
    emoji: "\uD83D\uDC40",
    icon: Users,
    title: "Revisa la accountability del equipo",
    description:
      "Ve quien esta cumpliendo, quien tiene racha, y donde hay banderas rojas. Sin sorpresas, sin excusas.",
    cta: "Ver accountability",
    href: "/accountability",
    gradient: "from-cyan-500 to-teal-500",
    glow: "shadow-cyan-500/20",
    bgLight: "bg-cyan-50 dark:bg-cyan-950/30",
    borderLight: "border-cyan-200/60 dark:border-cyan-800/40",
  },
] as const;

const SHORTCUTS = [
  { keys: ["Cmd", "K"], label: "Busqueda rapida" },
  { keys: ["Cmd", "N"], label: "Nuevo registro" },
];

export default function WelcomePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24">
      {/* Hero */}
      <section className="relative text-center py-12 sm:py-16 mb-12">
        {/* Background blurs */}
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[400px] bg-violet-300/20 dark:bg-violet-800/10 rounded-full blur-[100px]" />
        <div className="pointer-events-none absolute top-10 right-0 w-[300px] h-[300px] bg-indigo-300/15 dark:bg-indigo-900/10 rounded-full blur-[80px]" />

        <div className="relative">
          {/* Logo */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-2xl shadow-violet-500/30 mb-8">
            <Clock className="w-9 h-9 text-white" />
          </div>

          {/* Badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              Bienvenido a Exomagram
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.15] mb-4">
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              Transparencia total
            </span>
            <br />
            del trabajo
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Registra cada hora, agrega evidencia, y demuestra el impacto real de tu trabajo.
            Sin reportes vagos. Sin sorpresas.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="mb-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <ArrowRight className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            Empieza en 4 pasos
          </h2>
        </div>

        <div className="space-y-4">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className={cn(
                  "group relative rounded-2xl border p-6 transition-all duration-300",
                  "bg-card/80 backdrop-blur-sm hover:shadow-xl hover:-translate-y-0.5",
                  step.borderLight,
                  `hover:${step.glow}`
                )}
              >
                {/* Subtle gradient overlay on hover */}
                <div
                  className={cn(
                    "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                    `bg-gradient-to-br ${step.gradient}`,
                    "pointer-events-none [mask-image:linear-gradient(to_bottom,transparent_60%,black)]"
                  )}
                  style={{ opacity: 0.03 }}
                />

                <div className="relative flex gap-5 items-start">
                  {/* Numbered circle */}
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <div
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg",
                        `bg-gradient-to-br ${step.gradient} ${step.glow}`
                      )}
                    >
                      {step.number}
                    </div>
                    {step.number < 4 && (
                      <div className="w-px h-6 bg-gradient-to-b from-border to-transparent hidden sm:block" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="text-2xl">{step.emoji}</span>
                      <h3 className="text-lg font-semibold tracking-tight">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                      {step.description}
                    </p>
                    <Link href={step.href}>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "rounded-xl gap-1.5 transition-all duration-300",
                          "hover:bg-gradient-to-r hover:text-white hover:border-transparent hover:shadow-lg",
                          `hover:${step.gradient} hover:${step.glow}`
                        )}
                      >
                        {step.cta}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>

                  {/* Background icon */}
                  <Icon className="w-20 h-20 text-muted-foreground/[0.04] absolute right-4 top-4 pointer-events-none" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Keyboard shortcuts */}
      <section className="mb-16">
        <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <Command className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold tracking-tight">Atajos de teclado</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.label}
                className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3"
              >
                <span className="text-sm text-muted-foreground">
                  {shortcut.label}
                </span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key) => (
                    <kbd
                      key={key}
                      className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg bg-background border border-border text-xs font-medium text-foreground shadow-sm"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center">
        <div className="relative rounded-2xl overflow-hidden p-10 sm:p-14">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMSIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
              Listo para empezar?
            </h2>
            <p className="text-white/70 mb-8 max-w-md mx-auto">
              Tu equipo merece transparencia real. Registra tu primera hora y
              empieza a construir confianza.
            </p>
            <Link href="/dashboard">
              <Button
                size="lg"
                className="rounded-2xl px-10 py-6 text-lg font-semibold bg-white text-violet-700 hover:bg-white/90 shadow-2xl shadow-black/20 transition-all duration-300 hover:scale-105 border-0"
              >
                Comenzar
                <ArrowRight className="w-5 h-5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
