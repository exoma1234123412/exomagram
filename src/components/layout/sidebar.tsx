"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, User, Settings, LogOut,
  Crosshair, Swords, Zap, BarChart3, Database, FileText,
  Target, Brain, Eye,
  type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/layout/logo";

interface NavItem { href: string; label: string; icon: LucideIcon }

// ═══════════════════════════════════════════════════════════
// MAXIMUM CONSOLIDATION — 6 core items, flat list
// Every feature is reachable from these 6 pages.
// All 120+ legacy pages still work via direct URL.
// ═══════════════════════════════════════════════════════════

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Analítica", icon: BarChart3 },
  { href: "/data-hub", label: "Hub de Datos", icon: Database },
  { href: "/reports", label: "Reportes", icon: FileText },
  { href: "/focus", label: "Focus", icon: Target },
  { href: "/reflection", label: "Reflexión", icon: Brain },
  { href: "/surveillance", label: "Vigilancia", icon: Eye },
  { href: "/intel", label: "Intel", icon: Crosshair },
  { href: "/arena", label: "Arena", icon: Swords },
  { href: "/xp", label: "Progreso", icon: Zap },
  { href: "/profile", label: "Perfil", icon: User },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden md:flex w-52 flex-col border-r border-border bg-sidebar h-screen sticky top-0">
      {/* Brand header */}
      <div className="px-3 pt-3 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Logo size={30} />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_6px] shadow-green-500/60" />
            </div>
            <div>
              <span className="font-mono text-[12px] font-black tracking-[0.14em] text-foreground block leading-none">
                EXOMAGRAM
              </span>
              <span className="font-mono text-[8px] tracking-[0.2em] text-muted-foreground uppercase mt-0.5 block">
                Sistema de Vigilancia
              </span>
            </div>
          </div>
          <NotificationBell />
        </div>
        <div className="h-px bg-border mt-2" />
        <div className="flex items-center gap-1.5 mt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px] shadow-green-500/50" />
          <span className="font-mono text-[8px] tracking-[0.15em] text-green-500 uppercase font-semibold">Operativo</span>
        </div>
      </div>

      <nav className="flex-1 py-3 px-1.5 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard" || pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-[12px] font-mono font-medium transition-colors relative",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-sidebar-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
              )}
              <item.icon
                className={cn(
                  "w-4 h-4 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-2 border-t border-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-2 py-1.5 text-[10px] font-mono tracking-wide text-muted-foreground hover:text-foreground transition-colors cursor-pointer uppercase"
        >
          <LogOut className="w-3.5 h-3.5" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
