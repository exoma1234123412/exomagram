"use client";

import { PomodoroTimer } from "@/components/pomodoro/pomodoro-timer";
import { Timer, Brain } from "lucide-react";

export default function FocusPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          Modo Focus
        </h1>
        <p className="text-muted-foreground text-sm">
          Timer Pomodoro integrado. Tu equipo ve que estás en deep work.
        </p>
      </div>

      <PomodoroTimer />

      <div className="mt-8 space-y-4">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Timer className="w-5 h-5" />
          ¿Cómo funciona?
        </h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3 p-3 bg-accent/40 rounded-xl">
            <span className="text-lg">🎯</span>
            <div>
              <p className="font-medium text-foreground">Elige una tarea</p>
              <p>Escribe en qué vas a trabajar. Tu equipo puede ver tu tarea actual.</p>
            </div>
          </div>
          <div className="flex gap-3 p-3 bg-accent/40 rounded-xl">
            <span className="text-lg">⏱️</span>
            <div>
              <p className="font-medium text-foreground">Elige la duración</p>
              <p>15, 25, 45 o 60 minutos. Se recomienda 25 min (Pomodoro clásico).</p>
            </div>
          </div>
          <div className="flex gap-3 p-3 bg-accent/40 rounded-xl">
            <span className="text-lg">🔥</span>
            <div>
              <p className="font-medium text-foreground">Tu estado cambia a Deep Work</p>
              <p>Tu live status muestra que estás enfocado. Las interrupciones quedan registradas.</p>
            </div>
          </div>
          <div className="flex gap-3 p-3 bg-accent/40 rounded-xl">
            <span className="text-lg">📊</span>
            <div>
              <p className="font-medium text-foreground">Se suma a tu Focus Score</p>
              <p>Más pomodoros completos sin interrupciones = mejor Focus Score.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
