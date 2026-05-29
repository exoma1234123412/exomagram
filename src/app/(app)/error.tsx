"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App section error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Algo salió mal</h2>
          <p className="text-sm text-muted-foreground">
            Ocurrió un error inesperado. Intenta recargar la página.
          </p>
          {process.env.NODE_ENV === "development" && error.message && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
              <p className="text-xs text-destructive/70 font-mono break-all text-left">
                {error.message}
              </p>
              {error.digest && (
                <p className="text-[10px] text-muted-foreground/40 font-mono mt-1 text-left">
                  Digest: {error.digest}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-2 justify-center pt-2">
            <Button onClick={reset} variant="outline" className="gap-2 rounded-xl">
              <RefreshCw className="w-4 h-4" />
              Reintentar
            </Button>
            <Button className="gap-2 rounded-xl" render={<Link href="/feed" />}>
              <Home className="w-4 h-4" />
              Volver al inicio
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
