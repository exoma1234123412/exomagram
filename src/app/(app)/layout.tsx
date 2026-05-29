// @ts-nocheck
"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { HeartbeatProvider } from "@/components/live/heartbeat-provider";
import { SpotCheckProvider } from "@/components/accountability/spot-check";
import { ProofSnapshotProvider } from "@/components/accountability/proof-snapshot";
import { MicroCheckinProvider } from "@/components/accountability/micro-checkin";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { ErrorBoundary } from "@/components/error-boundary";
import { ScreenPulse } from "@/components/pressure/screen-pulse";
import { InactivityAlarm } from "@/components/pressure/inactivity-alarm";
import { AICoachNudge } from "@/components/coach/ai-coach-nudge";
import { MandatoryProofGate } from "@/components/pressure/mandatory-proof-gate";
import { StandupEnforcer } from "@/components/pressure/standup-enforcer";
import { WeeklyConfession } from "@/components/pressure/weekly-confession";
import { AdaptiveTheme } from "@/components/pressure/adaptive-theme";
import { MorningIntention } from "@/components/pressure/morning-intention";
import { AccountabilityBuddy } from "@/components/pressure/accountability-buddy";
import { PersistentStatusBar } from "@/components/pressure/persistent-status-bar";
import { CelebrationProvider } from "@/components/pressure/celebrations";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  return (
    <CelebrationProvider>
    <HeartbeatProvider>
      <SpotCheckProvider>
        <ProofSnapshotProvider>
          <MicroCheckinProvider>
            <div className="flex min-h-screen bg-background noise bg-grid-pattern">
              <Sidebar />
              <main className="flex-1 pb-20 md:pb-0 min-w-0 relative data-stream">
                {/* Cold ambient glow — Palantir surveillance feel */}
                <div className="pointer-events-none fixed top-0 right-0 w-[500px] h-[500px] bg-primary/3 rounded-full blur-[150px] -translate-y-1/2 translate-x-1/3" />
                <div className="pointer-events-none fixed bottom-0 left-1/4 w-[400px] h-[400px] bg-primary/2 rounded-full blur-[120px] translate-y-1/2" />
                <div className="relative z-[1]">
                  <ErrorBoundary>
                    {children}
                  </ErrorBoundary>
                </div>
              </main>
              <MobileNav onLogEntry={() => setLogDialogOpen(true)} />
              <LogEntryDialog open={logDialogOpen} onOpenChange={setLogDialogOpen} />
              <KeyboardShortcuts onNewEntry={() => setLogDialogOpen(true)} />
              <ScreenPulse />
              <InactivityAlarm />
              <AICoachNudge />
              <AdaptiveTheme />
              <MorningIntention />
              <MandatoryProofGate />
              <StandupEnforcer />
              <WeeklyConfession />
              <AccountabilityBuddy />
              <PersistentStatusBar />
            </div>
          </MicroCheckinProvider>
        </ProofSnapshotProvider>
      </SpotCheckProvider>
    </HeartbeatProvider>
    </CelebrationProvider>
  );
}
