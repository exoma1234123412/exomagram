"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
 LayoutDashboard, Activity, Trophy, Brain, BarChart3, Gavel,
 Skull, Coins, Eye, Swords, Zap, User, Settings,
 Search, Command, LogOut, X,
 PanelLeftClose, PanelLeftOpen,
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
// 15-HUB NAVIGATION — grouped into 4 sections + config
// All 200+ pages still reachable via Cmd+K and direct URL.
// ═══════════════════════════════════════════════════════════

const sections: { id: string; label: string; items: NavItem[] }[] = [
 {
  id: "daily", label: "DIARIO",
  items: [
   { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
   { href: "/feed", label: "Feed", icon: Activity },
   { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  ],
 },
 {
  id: "intel", label: "INTELIGENCIA",
  items: [
   { href: "/ai-center", label: "AI Center", icon: Brain },
   { href: "/analytics", label: "Analytics", icon: BarChart3 },
   { href: "/accountability", label: "Accountability", icon: Gavel },
  ],
 },
 {
  id: "pressure", label: "PRESION",
  items: [
   { href: "/shame", label: "Shame", icon: Skull },
   { href: "/trust-market", label: "Trust Market", icon: Coins },
   { href: "/surveillance", label: "Surveillance", icon: Eye },
  ],
 },
 {
  id: "compete", label: "COMPETENCIA",
  items: [
   { href: "/arena", label: "Arena", icon: Swords },
   { href: "/seasons", label: "Progresion", icon: Zap },
  ],
 },
];

const configItems: NavItem[] = [
 { href: "/profile", label: "Perfil", icon: User },
 { href: "/org-settings", label: "Ajustes Org", icon: Settings },
];

const SIDEBAR_COLLAPSED_KEY = "exomagram_sidebar_collapsed";
const CMDK_HINT_KEY = "exomagram_cmdk_hint_dismissed";

export function Sidebar() {
 const pathname = usePathname();
 const router = useRouter();
 const supabase = createClient();
 const [collapsed, setCollapsed] = useState(false);
 const [showHint, setShowHint] = useState(false);

 useEffect(() => {
  try {
   const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
   if (stored === "true") setCollapsed(true);
   const dismissed = localStorage.getItem(CMDK_HINT_KEY);
   if (!dismissed) setShowHint(true);
  } catch {}
 }, []);

 function dismissHint() {
  try { localStorage.setItem(CMDK_HINT_KEY, "true"); } catch {}
  setShowHint(false);
 }

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

 function isActive(href: string) {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname.startsWith(href);
 }

 function renderNavItem(item: NavItem) {
  const active = isActive(item.href);

  if (collapsed) {
   return (
    <Tooltip key={item.href}>
     <TooltipTrigger
      render={<Link href={item.href} />}
      className={cn(
       "flex items-center justify-center p-2 transition-colors relative",
       active
        ? "text-primary bg-primary/10"
        : "text-sidebar-foreground hover:text-foreground hover:bg-accent"
      )}
     >
      {active && (
       <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
      )}
      <item.icon
       className={cn(
        "w-4 h-4 shrink-0",
        active ? "text-primary" : "text-muted-foreground"
       )}
      />
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
     active
      ? "text-foreground bg-accent"
      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
    )}
   >
    {active && (
     <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-primary" />
    )}
    <item.icon
     className={cn(
      "w-4 h-4 shrink-0",
      active ? "text-primary" : "text-muted-foreground"
     )}
    />
    <span className="flex-1">{item.label}</span>
   </Link>
  );
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
     <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
       <Logo size={26} />
       <span className="text-[13px] font-semibold tracking-tight text-foreground">
        Exomagram
       </span>
      </div>
      <NotificationBell />
     </div>
    )}
   </div>

   <nav className={cn("flex-1 py-3 overflow-y-auto min-h-0", collapsed ? "px-1" : "px-1.5")}>
    {/* Section groups */}
    {sections.map((section) => (
     <div key={section.id} className="mb-3">
      {!collapsed && (
       <p className="font-mono text-[8px] tracking-[0.2em] uppercase text-muted-foreground/60 px-3 mb-1">
        {section.label}
       </p>
      )}
      <div className="space-y-0.5">
       {section.items.map(renderNavItem)}
      </div>
     </div>
    ))}

    {/* Config items separator */}
    {!collapsed && (
     <div className="border-t border-border/40 mt-2 pt-2" />
    )}
    {collapsed && <div className="border-t border-border/40 my-2" />}
    <div className="space-y-0.5">
     {configItems.map(renderNavItem)}
    </div>
   </nav>

   {/* First-visit hint: Cmd+K discovery */}
   {showHint && !collapsed && (
    <div className="mx-1.5 mb-2 p-2.5 border border-primary/20 bg-primary/5 relative">
     <button
      onClick={dismissHint}
      className="absolute top-1 right-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
     >
      <X className="w-3 h-3" />
     </button>
     <p className="font-mono text-[9px] tracking-wide text-primary/80 leading-relaxed pr-3">
      Presiona <kbd className="px-1 py-0.5 bg-primary/10 border border-primary/20 font-bold">{"\u2318"}K</kbd> para acceder a todas las funciones
     </p>
    </div>
   )}

   <div className={cn("px-3 py-2 border-t border-border space-y-0.5", collapsed && "px-1")}>
    {collapsed ? (
     <>
      <Tooltip>
       <TooltipTrigger
        onClick={() => {
         window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
        }}
        className={cn(
         "flex items-center justify-center w-full p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer",
         showHint && "animate-border-pulse"
        )}>
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
       <TooltipContent side="right" className="font-mono text-xs">Cerrar sesion</TooltipContent>
      </Tooltip>
     </>
    ) : (
     <>
      <button
       onClick={() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
       }}
       className={cn(
        "flex items-center gap-2.5 w-full px-2 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer",
        showHint && "animate-border-pulse"
       )}>
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
