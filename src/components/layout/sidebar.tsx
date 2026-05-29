"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
 LayoutDashboard, User, Settings, LogOut, Bell,
 Crosshair, Swords, Zap, BarChart3, Database, FileText,
 Target, Brain, Eye, Skull, FolderKanban, Scale, Cpu,
 Activity, ShieldAlert, Search, Command, ScrollText, UserX, DollarSign,
 FileWarning, ShieldCheck, Bot, MessageSquare, ScanSearch, Newspaper, Heart,
 PanelLeftClose, PanelLeftOpen, Split, ArrowRightLeft,
 type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/layout/logo";
import { AudioToggle } from "@/components/audio/audio-toggle";
import {
 Tooltip,
 TooltipContent,
 TooltipProvider,
 TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem { href: string; label: string; icon: LucideIcon }

// ═══════════════════════════════════════════════════════════
// MAXIMUM CONSOLIDATION — 6 core items, flat list
// Every feature is reachable from these 6 pages.
// All 120+ legacy pages still work via direct URL.
// ═══════════════════════════════════════════════════════════

const navItems: NavItem[] = [
 { href:"/alerts", label:"Alertas", icon: Bell },
 { href:"/dashboard", label:"Dashboard", icon: LayoutDashboard },
 { href:"/projects", label:"Proyectos", icon: FolderKanban },
 { href:"/analytics", label:"Analítica", icon: BarChart3 },
 { href:"/data-hub", label:"Hub de Datos", icon: Database },
 { href:"/ai-center", label:"AI Center", icon: Cpu },
 { href:"/reports", label:"Reportes", icon: FileText },
 { href:"/auto-standup", label:"Auto-Standup", icon: Bot },
 { href:"/focus", label:"Focus", icon: Target },
 { href:"/reflection", label:"Reflexión", icon: Brain },
 { href:"/surveillance", label:"Vigilancia", icon: Eye },
 { href:"/intel", label:"Intel", icon: Crosshair },
 { href:"/wellbeing", label:"Bienestar", icon: Heart },
 { href:"/team-narrative", label:"Cronica", icon: Newspaper },
 { href:"/consistency", label:"Consistencia", icon: ScanSearch },
 { href:"/contradictions", label:"Contradicciones", icon: Split },
 { href:"/ask-claude", label:"Ask Claude", icon: MessageSquare },
 { href:"/conflicts", label:"Conflictos", icon: ShieldAlert },
 { href:"/ai-predictions", label:"Predicciones", icon: Activity },
 { href:"/arena", label:"Arena", icon: Swords },
 { href:"/shame", label:"Presión", icon: Skull },
 { href:"/hour-price", label:"Precio/Hora", icon: DollarSign },
 { href:"/intervention", label:"Intervención", icon: UserX },
 { href:"/broken-promises", label:"Promesas Rotas", icon: ScrollText },
 { href:"/shame-contract", label:"Contrato Verguenza", icon: FileWarning },
 { href:"/reliability", label:"Confiabilidad", icon: ShieldCheck },
 { href:"/reciprocity", label:"Reciprocidad", icon: ArrowRightLeft },
 { href:"/peer-verdict", label:"Peer Verdict", icon: Scale },
 { href:"/xp", label:"Progreso", icon: Zap },
 { href:"/profile", label:"Perfil", icon: User },
 { href:"/settings", label:"Ajustes", icon: Settings },
];

const SIDEBAR_COLLAPSED_KEY = "exomagram_sidebar_collapsed";

export function Sidebar() {
 const pathname = usePathname();
 const router = useRouter();
 const supabase = createClient();
 const [collapsed, setCollapsed] = useState(false);
 const [alertCriticalCount, setAlertCriticalCount] = useState(0);

 useEffect(() => {
 try {
 const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
 if (stored === "true") setCollapsed(true);
 } catch {}
 }, []);

 // Fetch unresolved high-severity flags count for badge
 useEffect(() => {
 async function fetchAlertCount() {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;
 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id")
 .eq("user_id", user.id)
 .limit(1)
 .single();
 if (!membership) return;
 const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
 const { count } = await supabase
 .from("accountability_flags")
 .select("id", { count: "exact", head: true })
 .eq("org_id", membership.org_id)
 .eq("resolved", false)
 .in("flag_type", ["missing_hours", "no_closeout", "no_standup", "suspicious_pattern"])
 .gte("date", sevenDaysAgo);
 setAlertCriticalCount(count || 0);
 }
 fetchAlertCount();
 const interval = setInterval(fetchAlertCount, 120_000);
 return () => clearInterval(interval);
 }, [supabase]);

 function toggleCollapsed() {
 const next = !collapsed;
 setCollapsed(next);
 try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch {}
 }

 async function handleLogout() {
 await supabase.auth.signOut();
 router.push("/login");
 router.refresh();
 }

 return (
 <TooltipProvider delay={0}>
 <aside className={cn(
 "hidden md:flex flex-col border-r border-border bg-sidebar h-screen sticky top-0 transition-all duration-200",
 collapsed ? "w-14" : "w-52"
 )}>
 {/* Brand header */}
 <div className={cn("px-3 pt-3 pb-3 border-b border-border", collapsed && "px-2")}>
 {collapsed ? (
 <div className="flex flex-col items-center gap-2">
 <div className="relative">
 <Logo size={24} />
 <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_6px] shadow-green-500/60"/>
 </div>
 </div>
 ) : (
 <>
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Logo size={26} />
 <span className="text-[13px] font-semibold tracking-tight text-foreground">
 Exomagram
 </span>
 </div>
 <NotificationBell />
 </div>
 </>
 )}
 </div>

 <nav className={cn("flex-1 py-3 space-y-0.5 overflow-y-auto", collapsed ? "px-1" : "px-1.5")}>
 {navItems.map((item) => {
 const isActive =
 item.href ==="/dashboard"? pathname ==="/dashboard"|| pathname ==="/": pathname.startsWith(item.href);
 const isAlerts = item.href === "/alerts";
 const showAlertBadge = isAlerts && alertCriticalCount > 0;

 if (collapsed) {
 return (
 <Tooltip key={item.href}>
 <TooltipTrigger
 render={<Link href={item.href} />}
 className={cn(
 "flex items-center justify-center p-2 transition-colors relative",
 isActive
 ?"text-primary bg-primary/10":"text-sidebar-foreground hover:text-foreground hover:bg-accent")}
 >
 {isActive && (
 <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary"/>
 )}
 <div className="relative">
 <item.icon
 className={cn(
 "w-4 h-4 shrink-0",
 isActive ?"text-primary":"text-muted-foreground")}
 />
 {showAlertBadge && (
 <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[7px] font-mono font-bold flex items-center justify-center animate-pulse">
 {alertCriticalCount > 9 ? "9+" : alertCriticalCount}
 </span>
 )}
 </div>
 </TooltipTrigger>
 <TooltipContent side="right" className="font-mono text-xs">
 {item.label}
 </TooltipContent>
 </Tooltip>
 );
 }

 return (
 <Link
 key={item.href}
 href={item.href}
 className={cn(
 "flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors relative",
 isActive
 ?"text-foreground bg-accent":"text-muted-foreground hover:text-foreground hover:bg-accent/50")}
 >
 {isActive && (
 <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-primary"/>
 )}
 <div className="relative">
 <item.icon
 className={cn(
 "w-4 h-4 shrink-0",
 isActive ?"text-primary":"text-muted-foreground")}
 />
 {showAlertBadge && (
 <span className="absolute -top-1 -right-1.5 w-3 h-3 bg-red-500 text-white text-[7px] font-mono font-bold flex items-center justify-center">
 {alertCriticalCount > 9 ? "+" : alertCriticalCount}
 </span>
 )}
 </div>
 <span className="flex-1">{item.label}</span>
 {showAlertBadge && (
 <span className="bg-red-500/15 text-red-400 text-[10px] font-mono font-semibold px-1.5 py-0.5 tabular-nums">
 {alertCriticalCount}
 </span>
 )}
 </Link>
 );
 })}
 </nav>

 <div className={cn("px-3 py-2 border-t border-border space-y-0.5", collapsed && "px-1")}>
 {collapsed ? (
 <>
 <Tooltip>
 <TooltipTrigger
 onClick={() => {
 window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
 }}
 className="flex items-center justify-center w-full p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
 <Search className="w-3.5 h-3.5"/>
 </TooltipTrigger>
 <TooltipContent side="right" className="font-mono text-xs">Buscar</TooltipContent>
 </Tooltip>
 <AudioToggle collapsed />
 <Tooltip>
 <TooltipTrigger
 onClick={handleLogout}
 className="flex items-center justify-center w-full p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
 <LogOut className="w-3.5 h-3.5"/>
 </TooltipTrigger>
 <TooltipContent side="right" className="font-mono text-xs">Cerrar sesión</TooltipContent>
 </Tooltip>
 </>
 ) : (
 <>
 <button
 onClick={() => {
 window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
 }}
 className="flex items-center gap-2.5 w-full px-2 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer">
 <Search className="w-3.5 h-3.5"/>
 <span className="flex-1 text-left">Buscar</span>
 <kbd className="border border-border px-1.5 py-0.5 bg-accent/50 font-mono text-[9px] inline-flex items-center gap-0.5">
 <Command className="w-2.5 h-2.5" />K
 </kbd>
 </button>
 <AudioToggle />
 <button
 onClick={handleLogout}
 className="flex items-center gap-2.5 w-full px-2 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer">
 <LogOut className="w-3.5 h-3.5"/>
 Cerrar sesion
 </button>
 </>
 )}

 {/* Collapse toggle */}
 <button
 onClick={toggleCollapsed}
 className={cn(
 "flex items-center w-full py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer",
 collapsed ? "justify-center p-2" : "gap-2.5 px-2"
 )}>
 {collapsed ? (
 <PanelLeftOpen className="w-3.5 h-3.5"/>
 ) : (
 <>
 <PanelLeftClose className="w-3.5 h-3.5"/>
 Colapsar
 </>
 )}
 </button>
 </div>
 </aside>
 </TooltipProvider>
 );
}
