"use client";

import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import {
  Eye,
  ShieldCheck,
  Gavel,
  Swords,
  AlertTriangle,
  Flame,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: Eye,
    title: "Pulso en Tiempo Real",
    description:
      "Monitorea qué hace cada persona, ahora mismo. Sin retrasos, sin excusas.",
  },
  {
    icon: ShieldCheck,
    title: "Trust Score",
    description:
      "Puntuación de confianza calculada con IA. Cada acción suma o resta.",
  },
  {
    icon: Gavel,
    title: "Tribunal",
    description:
      "Disputas resueltas por voto del equipo. Democracia radical.",
  },
  {
    icon: Swords,
    title: "Arena",
    description:
      "Duelos, bounties, apuestas entre compañeros. Competencia real.",
  },
  {
    icon: AlertTriangle,
    title: "Detección de Conflictos",
    description:
      "IA encuentra mentiras y patrones sospechosos automáticamente.",
  },
  {
    icon: Flame,
    title: "Presión Social",
    description:
      "Shame boards, streaks, countdown a medianoche. Sin escapatoria.",
  },
] as const;

const steps = [
  {
    number: "01",
    label: "REGISTRA",
    description: "Cada miembro logea su trabajo hora por hora con evidencia.",
  },
  {
    number: "02",
    label: "VIGILA",
    description:
      "IA detecta patrones, huecos y contradicciones automáticamente.",
  },
  {
    number: "03",
    label: "ACTÚA",
    description:
      "Trust scores, tribunales y presión social hacen el resto.",
  },
];

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ===== HERO ===== */}
      <section className="relative min-h-screen flex flex-col items-center justify-center bg-grid-palantir overflow-hidden">
        {/* Scan line */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-x-0 h-px bg-primary/20 animate-scan" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-8 px-4 text-center">
          <Logo size={64} />

          <div className="flex flex-col items-center gap-4">
            <h1 className="font-mono text-4xl sm:text-5xl font-black tracking-[0.2em] uppercase">
              EXOMAGRAM
            </h1>

            <p className="font-mono text-primary text-lg sm:text-xl max-w-xl leading-relaxed">
              Cada hora queda registrada. Cada excusa queda expuesta.
            </p>

            <p className="font-mono text-muted-foreground text-sm max-w-md">
              Vigilancia total para equipos que exigen resultados.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-mono text-sm font-bold uppercase tracking-wider px-8 py-3 border border-primary hover:bg-primary/90 transition-colors"
            >
              Empezar Gratis
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="#features"
              className="inline-flex items-center gap-2 bg-transparent text-primary font-mono text-sm font-bold uppercase tracking-wider px-8 py-3 border border-primary hover:bg-primary/10 transition-colors"
            >
              Ver Demo
            </Link>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ===== STATS BAR ===== */}
      <section className="border-y border-border bg-accent/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { value: "5", label: "EQUIPOS ACTIVOS" },
              { value: "10,000+", label: "HORAS REGISTRADAS" },
              { value: "24/7", label: "VIGILANCIA" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-1 border border-border bg-accent/30 px-6 py-5"
              >
                <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-primary">
                  {stat.value}
                </span>
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES GRID ===== */}
      <section id="features" className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="mb-12">
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              // CAPACIDADES DEL SISTEMA
            </span>
            <h2 className="font-mono text-2xl font-bold uppercase tracking-tight mt-3">
              Todo lo que necesitas para vigilar
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="border border-border hover:border-primary/30 transition-colors p-6 bg-card"
                >
                  <Icon className="w-6 h-6 text-primary mb-4" />
                  <h3 className="font-mono font-bold uppercase text-sm tracking-tight mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== THE HOOK ===== */}
      <section className="py-24 border-y border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="corner-marks px-8 py-12">
            <blockquote className="font-mono text-2xl sm:text-3xl font-bold text-primary leading-snug text-center">
              Tu equipo dice que trabaja 8 horas.
              <br />
              ¿Cuántas son reales?
            </blockquote>
            <p className="font-mono text-muted-foreground text-sm text-center mt-6">
              Exomagram lo revela. Hora por hora. Sin excusas.
            </p>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="mb-12">
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              // PROTOCOLO
            </span>
            <h2 className="font-mono text-2xl font-bold uppercase tracking-tight mt-3">
              Cómo funciona
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div key={step.number} className="flex flex-col gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-primary font-mono text-3xl font-bold tabular-nums">
                    {step.number}
                  </span>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {step.label}
                  </span>
                </div>
                <div className="h-px bg-border" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-24 border-t border-border bg-grid-palantir">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-mono text-2xl sm:text-3xl font-bold uppercase tracking-tight mb-8">
            La vigilancia empieza ahora.
          </h2>

          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-mono text-sm font-bold uppercase tracking-wider px-10 py-4 border border-primary hover:bg-primary/90 transition-colors"
          >
            Empezar Gratis
            <ArrowRight className="w-4 h-4" />
          </Link>

          <p className="font-mono text-muted-foreground text-xs mt-6">
            Sin tarjeta de crédito. Setup en 2 minutos.
          </p>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-border py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Logo size={20} />
              <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                EXOMAGRAM
              </span>
            </div>

            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
              Monterrey, México
            </span>

            <div className="flex items-center gap-6">
              <Link
                href="/login"
                className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground hover:text-primary transition-colors"
              >
                Iniciar Sesión
              </Link>
              <Link
                href="/signup"
                className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground hover:text-primary transition-colors"
              >
                Registrarse
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
