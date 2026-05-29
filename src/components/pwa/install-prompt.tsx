"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Download, X, Smartphone } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Don't show if dismissed recently
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = Number(dismissed);
      if (Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // Only show on mobile-sized screens
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-20 left-3 right-3 z-50 md:hidden",
        "animate-in slide-in-from-bottom-4 fade-in duration-300"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-border/60",
          "bg-card/95 p-3 shadow-lg backdrop-blur-md"
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">
              Instala Exomagram en tu dispositivo
            </p>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              App
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDismiss}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleInstall} className="rounded-xl">
            <Download className="h-3.5 w-3.5" />
            Instalar
          </Button>
        </div>
      </div>
    </div>
  );
}
