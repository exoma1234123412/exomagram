"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
 LayoutDashboard, Activity, Trophy, Brain, BarChart3, Gavel,
 Skull, Coins, Eye, Swords, Zap, User, Settings,
 LogOut, Plus, Menu, X, Search,
 type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/layout/logo";

interface MobileNavProps {
 onLogEntry: () => void;
 unreadCount?: number;
}

interface NavItem { href: string; label: string; icon: LucideIcon }

// ═══════════════════════════════════════════════════════════
// 15-HUB MOBILE NAVIGATION — same structure as sidebar
// ═══════════════════════════════════════════════════════════

const menuSections: { id: string; label: string; items: NavItem[] }[] = [
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

export function MobileNav({ onLogEntry, unreadCount = 0 }: MobileNavProps) {
 const pathname = usePathname();
 const router = useRouter();
 const [menuOpen, setMenuOpen] = useState(false);
 const supabase = createClient();

 async function handleLogout() {
  await supabase.auth.signOut();
  router.push("/login");
  router.refresh();
 }

 return (
  <>
   {menuOpen && (
    <div className="md:hidden fixed inset-0 z-[60] bg-background bg-grid-dense pt-[env(safe-area-inset-top)]">
     <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
      <div className="flex items-center gap-2.5">
       <div className="relative">
        <Logo size={32} />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_6px] shadow-primary/60"/>
       </div>
       <div>
        <span className="font-mono text-[12px] font-black tracking-[0.14em] block leading-none">EXOMAGRAM</span>
        <span className="font-mono text-[7px] tracking-[0.3em] text-primary/70 uppercase mt-0.5 block">Vigilancia Total</span>
       </div>
      </div>
      <div className="flex items-center gap-2">
       <NotificationBell />
       <button
        onClick={() => setMenuOpen(false)}
        className="w-8 h-8 flex items-center justify-center hover:bg-accent transition-colors border border-border/40">
        <X className="w-4 h-4"/>
       </button>
      </div>
     </div>

     {/* Search bar -- opens command palette */}
     <button
      onClick={() => {
       setMenuOpen(false);
       setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
       }, 150);
      }}
      className="w-[calc(100%-2rem)] flex items-center gap-3 mx-4 mt-3 mb-4 px-3 py-2.5 border border-border hover:border-primary/30 transition-colors"
     >
      <Search className="w-4 h-4 text-muted-foreground" />
      <span className="font-mono text-xs text-muted-foreground">Buscar funciones...</span>
      <kbd className="ml-auto font-mono text-[8px] text-muted-foreground border border-border px-1.5 py-0.5">{"\u2318"}K</kbd>
     </button>

     <div className="overflow-y-auto h-[calc(100vh-180px-env(safe-area-inset-top))] px-4 py-3 space-y-4">
      {menuSections.map((section) => (
       <div key={section.id}>
        <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-muted-foreground mb-2 px-1">
         {section.label}
        </p>
        <div className="grid grid-cols-3 gap-1">
         {section.items.map((item) => {
          const isActive = item.href === "/dashboard"
           ? pathname === "/dashboard" || pathname === "/"
           : pathname.startsWith(item.href);
          return (
           <Link
            key={item.href}
            href={item.href}
            onClick={() => setMenuOpen(false)}
            className={cn(
             "flex flex-col items-center gap-1 p-2.5 text-center transition-all active:scale-95 border",
             isActive
              ? "bg-primary/8 text-primary border-primary/30"
              : "bg-accent/20 text-muted-foreground hover:bg-accent/40 border-border/30"
            )}
           >
            <item.icon className={cn("w-4 h-4", isActive && "text-primary")} />
            <span className="text-[9px] font-mono font-medium leading-tight truncate w-full">{item.label}</span>
           </Link>
          );
         })}
        </div>
       </div>
      ))}

      {/* Config items */}
      <div>
       <div className="border-t border-border/40 mb-3" />
       <div className="grid grid-cols-3 gap-1">
        {configItems.map((item) => {
         const isActive = pathname.startsWith(item.href);
         return (
          <Link
           key={item.href}
           href={item.href}
           onClick={() => setMenuOpen(false)}
           className={cn(
            "flex flex-col items-center gap-1 p-2.5 text-center transition-all active:scale-95 border",
            isActive
             ? "bg-primary/8 text-primary border-primary/30"
             : "bg-accent/20 text-muted-foreground hover:bg-accent/40 border-border/30"
           )}
          >
           <item.icon className={cn("w-4 h-4", isActive && "text-primary")} />
           <span className="text-[9px] font-mono font-medium leading-tight truncate w-full">{item.label}</span>
          </Link>
         );
        })}
       </div>
      </div>
     </div>

     <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-border/40 bg-background safe-area-pb">
      <button
       onClick={handleLogout}
       className="flex items-center gap-2.5 w-full px-3 py-2 text-[10px] font-mono tracking-wide uppercase text-muted-foreground hover:text-muted-foreground hover:bg-accent/30 transition-colors">
       <LogOut className="w-3 h-3"/>
       Cerrar sesion
      </button>
     </div>
    </div>
   )}

   <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 glass border-t border-border/50 z-50 pb-[env(safe-area-inset-bottom)]">
    <div className="flex items-center justify-around py-1 px-1">
     <Link
      href="/dashboard" className={cn(
       "relative flex flex-col items-center gap-0.5 px-3 py-2 min-h-[44px] justify-center text-[8px] font-mono font-medium tracking-wide uppercase transition-all",
       pathname.startsWith("/dashboard") ? "text-primary" : "text-muted-foreground active:scale-95"
      )}
     >
      <LayoutDashboard className="w-5 h-5"/>
      Dashboard
      {pathname.startsWith("/dashboard") && <span className="w-4 h-[1px] bg-primary mt-0.5"/>}
     </Link>

     <Link
      href="/feed" className={cn(
       "relative flex flex-col items-center gap-0.5 px-3 py-2 min-h-[44px] justify-center text-[8px] font-mono font-medium tracking-wide uppercase transition-all",
       pathname.startsWith("/feed") ? "text-primary" : "text-muted-foreground active:scale-95"
      )}
     >
      <Activity className="w-5 h-5"/>
      Feed
      {pathname.startsWith("/feed") && <span className="w-4 h-[1px] bg-primary mt-0.5"/>}
     </Link>

     <button
      onClick={onLogEntry}
      className="flex flex-col items-center gap-0.5 px-3 py-2 text-[8px] font-mono font-medium tracking-wide uppercase text-white active:scale-95 transition-transform">
      <div className="w-11 h-11 bg-primary flex items-center justify-center -mt-6 border border-primary/80 ring-2 ring-background">
       <Plus className="w-5 h-5"/>
      </div>
      <span className="text-foreground mt-0.5">Registrar</span>
     </button>

     <Link
      href="/leaderboard" className={cn(
       "flex flex-col items-center gap-0.5 px-3 py-2 min-h-[44px] justify-center text-[8px] font-mono font-medium tracking-wide uppercase transition-all",
       pathname.startsWith("/leaderboard") ? "text-primary" : "text-muted-foreground active:scale-95"
      )}
     >
      <Trophy className="w-5 h-5"/>
      Leaderboard
      {pathname.startsWith("/leaderboard") && <span className="w-4 h-[1px] bg-primary mt-0.5"/>}
     </Link>

     <button
      onClick={() => setMenuOpen(true)}
      className={cn(
       "flex flex-col items-center gap-0.5 px-3 py-2 min-h-[44px] justify-center text-[8px] font-mono font-medium tracking-wide uppercase transition-all",
       menuOpen ? "text-primary" : "text-muted-foreground active:scale-95"
      )}
     >
      <Menu className="w-5 h-5"/>
      Menu
     </button>
    </div>
   </nav>
  </>
 );
}
