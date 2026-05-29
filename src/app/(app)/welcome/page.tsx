"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Eye, Shield, Activity, ArrowRight } from "lucide-react";
import { Logo } from "@/components/layout/logo";

const STEPS = [
  {
    number: 1,
    icon: Eye,
    title: "REGISTRA TU PRIMERA HORA",
    description:
      "El reloj ya corre. Tu equipo puede ver que no has registrado nada. Hora por hora, con evidencia.",
    href: "/dashboard",
    cta: "Ir al timeline",
  },
  {
    number: 2,
    icon: Shield,
    title: "DECLARA TU STANDUP",
    description:
      "Di qué hiciste, qué harás y qué te bloquea. Sin rodeos. 60 segundos.",
    href: "/standup",
    cta: "Ir al Standup",
  },
  {
    number: 3,
    icon: Activity,
    title: "ENFRENTA TU DASHBOARD",
    description:
      "Ve tu Trust Score, tu posición en el equipo y qué dice la IA sobre tu rendimiento. La verdad no se esconde.",
    href: "/dashboard",
    cta: "Ver dashboard",
  },
] as const;

export default function WelcomePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      {/* Hero */}
      <section className="text-center mb-14">
        <div className="flex justify-center mb-6">
          <Logo size={48} />
        </div>

        <h1 className="font-mono text-xl font-bold tracking-[0.14em] uppercase mb-3">
          BIENVENIDO A EXOMAGRAM
        </h1>
        <p className="text-primary font-mono text-sm mb-4">
          A partir de ahora, cada hora cuenta.
        </p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          No hay donde esconderse. No hay excusas que valgan. Solo trabajo real, registrado y verificable.
        </p>
      </section>

      {/* Steps */}
      <section className="space-y-3 mb-14">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div
              key={step.number}
              className="group relative border border-border hover:border-primary/30 transition-colors p-6"
            >
              <div className="flex gap-5 items-start">
                {/* Number + connector */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center font-mono font-bold text-lg">
                    {step.number}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="w-px h-6 bg-border mt-2 hidden sm:block" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-4 h-4 text-primary" />
                    <h3 className="font-mono text-sm font-bold tracking-tight uppercase">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    {step.description}
                  </p>
                  <Link href={step.href}>
                    <Button variant="outline" size="sm" className="gap-1.5 font-mono text-xs">
                      {step.cta}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* CTA */}
      <section className="text-center space-y-3">
        <Link href="/home">
          <Button size="lg" className="px-10 py-6 font-mono font-bold text-sm tracking-wide">
            Empezar
            <ArrowRight className="w-5 h-5 ml-1.5" />
          </Button>
        </Link>
        <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
          La vigilancia ya está activa.
        </p>
      </section>
    </div>
  );
}
