"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { HeartbeatProvider } from "@/components/live/heartbeat-provider";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  return (
    <HeartbeatProvider>
      <div className="flex min-h-screen bg-background noise">
        <Sidebar />
        <main className="flex-1 pb-20 md:pb-0 min-w-0 relative">
          {/* Subtle ambient background */}
          <div className="pointer-events-none fixed top-0 right-0 w-[600px] h-[600px] bg-violet-200/20 dark:bg-violet-900/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3" />
          <div className="pointer-events-none fixed bottom-0 left-1/3 w-[400px] h-[400px] bg-indigo-200/15 dark:bg-indigo-900/5 rounded-full blur-[100px] translate-y-1/2" />
          <div className="relative z-[1]">
            {children}
          </div>
        </main>
        <MobileNav onLogEntry={() => setLogDialogOpen(true)} />
        <LogEntryDialog open={logDialogOpen} onOpenChange={setLogDialogOpen} />
        <KeyboardShortcuts onNewEntry={() => setLogDialogOpen(true)} />
      </div>
    </HeartbeatProvider>
  );
}
