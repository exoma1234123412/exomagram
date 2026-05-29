"use client";

import Link from "next/link";
import {
  Ghost,
  Clock,
  Users,
  Trophy,
  Search,
  Rss,
  Sparkles,
  ArrowRight,
  Plus,
  UserPlus,
  Star,
  SearchX,
  CalendarClock,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Shared wrapper
// ---------------------------------------------------------------------------

function EmptyStateShell({
  icon,
  accentFrom,
  accentTo,
  title,
  description,
  ctaLabel,
  ctaHref,
  className,
  children,
}: EmptyStateProps & {
  icon: React.ReactNode;
  accentFrom: string;
  accentTo: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 rounded-2xl border border-border/60 bg-card px-6 py-12 text-center shadow-sm",
        className
      )}
    >
      {/* Icon container with gradient ring */}
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full p-5",
          "bg-gradient-to-br",
          accentFrom,
          accentTo
        )}
      >
        <div className="absolute inset-0 rounded-full bg-card/80 backdrop-blur-sm" />
        <div className="relative z-10 text-muted-foreground">{icon}</div>
      </div>

      {/* Text */}
      <div className="flex max-w-xs flex-col gap-1.5">
        {title && (
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        )}
        {description && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {/* Extra content (composable slot) */}
      {children}

      {/* CTA */}
      {ctaLabel && ctaHref && (
        <Button variant="default" size="default" render={<Link href={ctaHref} />}>
          {ctaLabel}
          <ArrowRight data-icon="inline-end" className="size-4" />
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. NoDataYet
// ---------------------------------------------------------------------------

export function NoDataYet(props: EmptyStateProps) {
  return (
    <EmptyStateShell
      icon={
        <div className="relative">
          <Ghost className="size-10 stroke-[1.5]" />
          <Sparkles className="absolute -right-2 -top-2 size-5 text-primary/60" />
        </div>
      }
      accentFrom="from-primary/10"
      accentTo="to-secondary/20"
      title={props.title ?? "Sin datos todavia"}
      description={
        props.description ??
        "Aun no hay informacion para mostrar. Cuando haya actividad, aparecera aqui."
      }
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// 2. NoEntriesState
// ---------------------------------------------------------------------------

export function NoEntriesState(props: EmptyStateProps) {
  return (
    <EmptyStateShell
      icon={
        <div className="relative">
          <Clock className="size-10 stroke-[1.5]" />
          <CalendarClock className="absolute -bottom-1.5 -right-2 size-5 text-primary/60" />
        </div>
      }
      accentFrom="from-blue-500/10"
      accentTo="to-primary/15"
      title={props.title ?? "Sin registros para este dia"}
      description={
        props.description ??
        "Todavia no tienes entradas registradas hoy. Registra tu primera hora para empezar."
      }
      ctaLabel={props.ctaLabel ?? "Registrar primera entrada"}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// 3. NoMembersState
// ---------------------------------------------------------------------------

export function NoMembersState(props: EmptyStateProps) {
  return (
    <EmptyStateShell
      icon={
        <div className="relative">
          <Users className="size-10 stroke-[1.5]" />
          <UserPlus className="absolute -bottom-1 -right-2 size-5 text-primary/60" />
        </div>
      }
      accentFrom="from-green-500/10"
      accentTo="to-emerald-500/15"
      title={props.title ?? "Sin miembros aun"}
      description={
        props.description ??
        "Tu equipo todavia no tiene miembros. Invita a tus companeros para empezar a colaborar."
      }
      ctaLabel={props.ctaLabel ?? "Invitar miembros"}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// 4. NoAchievementsState
// ---------------------------------------------------------------------------

export function NoAchievementsState(props: EmptyStateProps) {
  return (
    <EmptyStateShell
      icon={
        <div className="relative">
          <Trophy className="size-10 stroke-[1.5]" />
          <Star className="absolute -right-1.5 -top-1.5 size-5 text-yellow-500/70" />
        </div>
      }
      accentFrom="from-yellow-500/10"
      accentTo="to-amber-500/15"
      title={props.title ?? "Sin logros desbloqueados"}
      description={
        props.description ??
        "Los logros se desbloquean a medida que avanzas. Sigue asi, cada paso cuenta."
      }
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// 5. SearchNoResults
// ---------------------------------------------------------------------------

export function SearchNoResults(props: EmptyStateProps) {
  return (
    <EmptyStateShell
      icon={
        <div className="relative">
          <Search className="size-10 stroke-[1.5]" />
          <SearchX className="absolute -bottom-1 -right-2 size-5 text-destructive/50" />
        </div>
      }
      accentFrom="from-muted/40"
      accentTo="to-muted/60"
      title={props.title ?? "Sin resultados"}
      description={
        props.description ??
        "No encontramos nada con esa busqueda. Intenta con otros terminos o revisa los filtros."
      }
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// 6. EmptyFeed
// ---------------------------------------------------------------------------

export function EmptyFeed(props: EmptyStateProps) {
  return (
    <EmptyStateShell
      icon={
        <div className="relative">
          <Rss className="size-10 stroke-[1.5]" />
          <Plus className="absolute -right-1.5 -top-1.5 size-5 text-primary/60" />
        </div>
      }
      accentFrom="from-violet-500/10"
      accentTo="to-primary/15"
      title={props.title ?? "Tu feed esta vacio"}
      description={
        props.description ??
        "Aqui veras la actividad de tu equipo. Empieza registrando tu primer entrada del dia."
      }
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// 7. ComingSoon
// ---------------------------------------------------------------------------

export function ComingSoon(props: EmptyStateProps) {
  return (
    <EmptyStateShell
      icon={
        <div className="relative">
          <Rocket className="size-10 stroke-[1.5]" />
          <Sparkles className="absolute -right-2 -top-2 size-5 text-primary/60 animate-pulse" />
        </div>
      }
      accentFrom="from-primary/10"
      accentTo="to-violet-500/15"
      title={props.title ?? "Proximamente"}
      description={
        props.description ??
        "Estamos trabajando en esta funcionalidad. Muy pronto estara disponible para ti."
      }
      {...props}
    />
  );
}
