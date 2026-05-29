"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function TabLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
        Cargando...
      </div>
    </div>
  );
}

export function TabEmpty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 border border-border flex items-center justify-center">
        <Icon className="w-7 h-7 text-primary/40" />
      </div>
      <p className="text-xs font-mono text-muted-foreground">{text}</p>
    </div>
  );
}

export function StatBox({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={cn("bg-accent/30 border border-border p-3", alert && Number(value) > 0 && "border-red-500/30")}>
      <span className="label-mono text-muted-foreground/40 block mb-1">{label}</span>
      <span className={cn(
        "data-number text-2xl",
        alert && Number(value) > 0 ? "text-red-500" : "text-foreground"
      )}>
        {value}
      </span>
    </div>
  );
}

export const GRADE_STYLE: Record<string, { color: string; bg: string }> = {
  A: { color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20" },
  B: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20" },
  C: { color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/20" },
  D: { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20" },
  F: { color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20" },
};

export function gradeStyle(grade: string | null | undefined) {
  return GRADE_STYLE[grade ?? ""] ?? GRADE_STYLE.C;
}

export const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; bar: string }> = {
  low: { label: "Bajo", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20", bar: "bg-green-500" },
  medium: { label: "Medio", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20", bar: "bg-amber-500" },
  high: { label: "Alto", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20", bar: "bg-orange-500" },
  critical: { label: "Critico", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20", bar: "bg-red-500" },
};
