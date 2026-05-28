"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { LogEntryDialog } from "@/components/log-entry/log-entry-dialog";
import { HeartbeatProvider } from "@/components/live/heartbeat-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  return (
    <HeartbeatProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
        <MobileNav onLogEntry={() => setLogDialogOpen(true)} />
        <LogEntryDialog open={logDialogOpen} onOpenChange={setLogDialogOpen} />
      </div>
    </HeartbeatProvider>
  );
}
