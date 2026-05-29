"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useAudio } from "@/components/audio/audio-provider";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AudioToggleProps {
  collapsed?: boolean;
}

export function AudioToggle({ collapsed = false }: AudioToggleProps) {
  const { enabled, setEnabled, play } = useAudio();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (next) {
      // Play a tick so the user hears it's on
      // Small delay to let state update
      setTimeout(() => play("tick"), 50);
    }
  }

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          onClick={toggle}
          className="flex items-center justify-center w-full p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {enabled ? (
            <Volume2 className="w-3.5 h-3.5" />
          ) : (
            <VolumeX className="w-3.5 h-3.5" />
          )}
        </TooltipTrigger>
        <TooltipContent side="right" className="font-mono text-xs">
          {enabled ? "Silenciar" : "Activar sonido"}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "flex items-center gap-2.5 w-full px-2 py-1.5",
        "text-[10px] font-mono tracking-wide uppercase",
        "text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      )}
    >
      {enabled ? (
        <Volume2 className="w-3.5 h-3.5" />
      ) : (
        <VolumeX className="w-3.5 h-3.5" />
      )}
      <span className="flex-1 text-left">
        {enabled ? "Sonido on" : "Sonido off"}
      </span>
    </button>
  );
}
