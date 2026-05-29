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
import { ShameStreakBadge } from "@/components/social/shame-streak";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { CommandPalette } from "@/components/layout/command-palette";
import { GhostEffect } from "@/components/social/ghost-effect";
import { ThroneProvider } from "@/components/social/throne-crown";
import { DynamicTitleProvider } from "@/components/social/dynamic-title";
import { LastPlaceCurse } from "@/components/social/last-place-curse";
import { PerformanceWatermark } from "@/components/social/performance-watermark";
import { ShameNotifications } from "@/components/social/shame-notifications";
import { HerdPressure } from "@/components/social/herd-pressure";
import { EscalationTimer } from "@/components/social/escalation-timer";
import { ScreenTint } from "@/components/social/screen-tint";
import { EntryVerdict } from "@/components/social/entry-verdict";
import { MomentumKiller } from "@/components/social/momentum-killer";
import { ProductivityPrison } from "@/components/social/productivity-prison";
import { AIMorningBriefing } from "@/components/ai/ai-morning-briefing";
import { MorningShameRecap } from "@/components/social/morning-shame-recap";
import { OrgProvider } from "@/lib/context/org-context";
import { ActivityTrackerProvider } from "@/components/tracking/activity-tracker";
import { DataPipelineProvider } from "@/components/tracking/data-pipeline";
import { ClaudeLiveCommentary } from "@/components/ai/claude-live-commentary";
import { AIAutoFlags } from "@/components/ai/ai-auto-flags";
import { AudioProvider } from "@/components/audio/audio-provider";
import { NegativePriming } from "@/components/shame/negative-priming";
import { FomoEngine } from "@/components/shame/fomo-engine";
import { ForcedComparisonTicker } from "@/components/shame/forced-comparison-ticker";
import { PredictiveGuilt } from "@/components/shame/predictive-guilt";
import { LossFramingAlerts } from "@/components/shame/loss-framing";
import { PanicCountdown } from "@/components/shame/panic-countdown";

export default function AppLayout({ children }: { children: React.ReactNode }) {
 const [logDialogOpen, setLogDialogOpen] = useState(false);

 useEffect(() => {
 if ("serviceWorker"in navigator) {
 navigator.serviceWorker.register("/sw.js");
 }
 }, []);

 return (
 <OrgProvider>
 <AudioProvider>
 <ActivityTrackerProvider>
 <DataPipelineProvider>
 <HeartbeatProvider>
 <DynamicTitleProvider>
 <ThroneProvider>
 <GhostEffect>
 <AIMorningBriefing />
 <MorningShameRecap />
 <NegativePriming />
 <FomoEngine />
 <div className="flex min-h-screen bg-background">
 <Sidebar />
 <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 min-w-0 relative">
 <PublicCountdown />
 <ForcedComparisonTicker />
 <HerdPressure />
 <PredictiveGuilt />
 <LossFramingAlerts />
 <PanicCountdown />
 <RankingStrip />
 <ShameStreakBadge />
 <div className="relative z-[1]">
 <ProductivityPrison>
 <ErrorBoundary>
 {children}
 </ErrorBoundary>
 </ProductivityPrison>
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
 <EscalationTimer />
 <EntryVerdict />
 <MomentumKiller />
 <ScreenTint />
 <InstallPrompt />
 <CommandPalette />
 <ClaudeLiveCommentary />
 <AIAutoFlags />
 </div>
 </GhostEffect>
 </ThroneProvider>
 </DynamicTitleProvider>
 </HeartbeatProvider>
 </DataPipelineProvider>
 </ActivityTrackerProvider>
 </AudioProvider>
 </OrgProvider>
 );
}
