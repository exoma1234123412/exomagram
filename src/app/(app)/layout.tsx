"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { HeartbeatProvider } from "@/components/live/heartbeat-provider";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { ErrorBoundary } from "@/components/error-boundary";
import { AICoachNudge } from "@/components/coach/ai-coach-nudge";
import { FloatingAIButton } from "@/components/coach/floating-ai-button";
import { PresenceIndicator } from "@/components/social/presence-indicator";
import { OrgProvider } from "@/lib/context/org-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  return (
    <OrgProvider>
      <HeartbeatProvider>
        <div className="flex min-h-screen bg-background">
          <Sidebar />
          <main className="flex-1 pb-20 md:pb-0 min-w-0 relative">
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
        </div>
      </HeartbeatProvider>
    </OrgProvider>
  );
}
