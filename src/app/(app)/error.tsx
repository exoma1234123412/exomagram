"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("App section error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="relative max-w-md w-full border border-border animate-border-pulse p-8 space-y-6">
        {/* Corner marks */}
        <span className="absolute -top-px -left-px w-3 h-3 border-t border-l border-primary" />
        <span className="absolute -top-px -right-px w-3 h-3 border-t border-r border-primary" />
        <span className="absolute -bottom-px -left-px w-3 h-3 border-b border-l border-primary" />
        <span className="absolute -bottom-px -right-px w-3 h-3 border-b border-r border-primary" />

        <div className="flex flex-col items-center gap-4 text-center">
          <Logo size={40} />
          <div className="space-y-1">
            <h2 className="font-mono text-xl font-bold uppercase tracking-tight">
              ERROR DEL SISTEMA
            </h2>
            <p className="text-sm font-mono text-muted-foreground">
              Algo falló — pero la vigilancia continúa.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            El equipo no se va a vigilar solo. Vuelve al dashboard.
          </p>
        </div>

        <div className="flex gap-2 justify-center">
          <Button onClick={reset} className="gap-2 font-mono text-xs bg-primary">
            <RefreshCw className="w-3.5 h-3.5" />
            Reintentar
          </Button>
          <Button variant="outline" className="gap-2 font-mono text-xs" render={<Link href="/dashboard" />}>
            Ir al Dashboard
          </Button>
        </div>

        {(error.message || error.digest) && (
          <div className="space-y-2">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/60 uppercase tracking-widest mx-auto hover:text-muted-foreground transition-colors duration-200"
            >
              Detalles del error
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`}
              />
            </button>
            {showDetails && (
              <div className="bg-destructive/5 border border-destructive/20 p-3 space-y-1">
                {error.message && (
                  <p className="font-mono text-[10px] text-muted-foreground/50 break-all text-left">
                    {error.message}
                  </p>
                )}
                {error.digest && (
                  <p className="font-mono text-[10px] text-muted-foreground/50 text-left">
                    digest: {error.digest}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
