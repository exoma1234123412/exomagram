"use client";

import { MeetingCostCalculator } from "@/components/meeting/meeting-cost";
import { PomodoroTimer } from "@/components/pomodoro/pomodoro-timer";
import { Wrench } from "lucide-react";

export default function ToolsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="w-6 h-6 text-violet-600" />
          Herramientas
        </h1>
        <p className="text-muted-foreground text-sm">
          Herramientas de productividad para tu día a día
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PomodoroTimer />
        <MeetingCostCalculator />
      </div>
    </div>
  );
}
