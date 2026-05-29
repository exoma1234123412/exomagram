"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { HeartbeatProvider } from "@/components/live/heartbeat-provider";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { ErrorBoundary } from "@/components/error-boundary";
import { AICoachNudge } from "@/components/coach/ai-coach-nudge";
import { FloatingAIButton } from "@/components/coach/floating-ai-button";
import { PresenceIndicator } from "@/components/social/presence-indicator";
import { PublicCountdown } from "@/components/social/public-countdown";
import { RankingStrip } from "@/components/social/ranking-strip";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { GhostEffect } from "@/components/social/ghost-effect";
import { ThroneProvider } from "@/components/social/throne-crown";
import { DynamicTitleProvider } from "@/components/social/dynamic-title";
import { LastPlaceCurse } from "@/components/social/last-place-curse";
import { PerformanceWatermark } from "@/components/social/performance-watermark";
import { ShameNotifications } from "@/components/social/shame-notifications";
import { HerdPressure } from "@/components/social/herd-pressure";
import { OrgProvider } from "@/lib/context/org-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  return (
    <OrgProvider>
      <HeartbeatProvider>
        <DynamicTitleProvider>
          <ThroneProvider>
            <GhostEffect>
              <div className="flex min-h-screen bg-background">
                <Sidebar />
                <main className="flex-1 pb-20 md:pb-0 min-w-0 relative bg-grid-palantir">
                  {/* Top accent line */}
                  <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                  <PublicCountdown />
                  <HerdPressure />
                  <RankingStrip />
                  <div className="relative z-[1]">
                    <ErrorBoundary>
                      {children}
                    </ErrorBoundary>
                  </div>
                </main>
                <MobileNav onLogEntry={() => setLogDialogOpen(true)} />
                <LogEntryDialog open={logDialogOpen} onOpenChange={setLogDialogOpen} />
                <KeyboardShortcuts onNewEntry={() => setLogDialogOpen(true)} />
                <FloatingAIButton />
                <PresenceIndicator />
                <AICoachNudge />
                <LastPlaceCurse />
                <PerformanceWatermark />
                <ShameNotifications />
                <InstallPrompt />
              </div>
            </GhostEffect>
          </ThroneProvider>
        </DynamicTitleProvider>
      </HeartbeatProvider>
    </OrgProvider>
  );
}
