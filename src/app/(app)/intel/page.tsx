"use client";

import { useState } from "react";
import { useOrg } from "@/lib/context/org-context";
import { cn } from "@/lib/utils";
import {
 Users,
 Calendar,
 Brain,
 AlertTriangle,
 Shield,
 FileSearch,
 Crosshair,
} from "lucide-react";
import { TabEquipo } from "@/components/intel/tab-equipo";
import { TabRituales } from "@/components/intel/tab-rituales";
import { TabAI } from "@/components/intel/tab-ai";
import { TabRiesgo } from "@/components/intel/tab-riesgo";
import { TabVigilancia } from "@/components/intel/tab-vigilancia";
import { TabAuditoria } from "@/components/intel/tab-auditoria";

// ─────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────

type TabKey ="equipo"|"rituales"|"ai"|"riesgo"|"vigilancia"|"auditoria";

const TABS: { key: TabKey; label: string; icon: typeof Users }[] = [
 { key:"equipo", label:"Equipo", icon: Users },
 { key:"rituales", label:"Rituales", icon: Calendar },
 { key:"ai", label:"AI", icon: Brain },
 { key:"riesgo", label:"Riesgo", icon: AlertTriangle },
 { key:"vigilancia", label:"Vigilancia", icon: Shield },
 { key:"auditoria", label:"Auditoría", icon: FileSearch },
];

// ═══════════════════════════════════════════════════════════
// INTEL HUB — Unified intelligence page with 6 tabs
// ═══════════════════════════════════════════════════════════

export default function IntelPage() {
 const { orgId, userId, loading: orgLoading } = useOrg();
 const [activeTab, setActiveTab] = useState<TabKey>("equipo");
 const [loadedTabs, setLoadedTabs] = useState<Set<TabKey>>(new Set(["equipo"]));

 if (orgLoading) {
 return (
 <div className="flex items-center justify-center h-screen">
 <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
 Cargando...
 </div>
 </div>
 );
 }

 if (!orgId || !userId) {
 return (
 <div className="flex items-center justify-center h-screen">
 <p className="text-muted-foreground font-mono text-xs">
 Crea o únete a un equipo desde el Dashboard.
 </p>
 </div>
 );
 }

 function selectTab(tab: TabKey) {
 setActiveTab(tab);
 setLoadedTabs((prev) => new Set(prev).add(tab));
 }

 return (
 <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 bg-grid-palantir min-h-screen">
 {/* Header */}
 <div className="mb-6">
 <div className="flex items-center gap-2.5 mb-1">
 <Crosshair className="w-5 h-5 text-primary"/>
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
 Intel
 </h1>
 </div>
 <p className="text-xs font-mono text-muted-foreground">
 Centro de inteligencia unificado
 </p>
 </div>

 {/* Tab bar */}
 <div className="flex gap-0 border-b border-border mb-6 overflow-x-auto">
 {TABS.map((tab) => (
 <button
 key={tab.key}
 onClick={() => selectTab(tab.key)}
 className={cn(
"px-4 py-2 font-mono text-[11px] uppercase tracking-wide cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1.5",
 activeTab === tab.key
 ?"border-b-2 border-primary text-primary":"text-muted-foreground hover:text-foreground")}
 >
 <tab.icon className="w-3.5 h-3.5"/>
 {tab.label}
 </button>
 ))}
 </div>

 {/* Tab content — lazy loaded */}
 {activeTab ==="equipo"&& loadedTabs.has("equipo") && (
 <TabEquipo orgId={orgId} userId={userId} />
 )}
 {activeTab ==="rituales"&& loadedTabs.has("rituales") && (
 <TabRituales orgId={orgId} userId={userId} />
 )}
 {activeTab ==="ai"&& loadedTabs.has("ai") && (
 <TabAI orgId={orgId} />
 )}
 {activeTab ==="riesgo"&& loadedTabs.has("riesgo") && (
 <TabRiesgo orgId={orgId} />
 )}
 {activeTab ==="vigilancia"&& loadedTabs.has("vigilancia") && (
 <TabVigilancia orgId={orgId} />
 )}
 {activeTab ==="auditoria"&& loadedTabs.has("auditoria") && (
 <TabAuditoria orgId={orgId} />
 )}
 </div>
 );
}
