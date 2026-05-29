"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Grid3X3,
  User,
  Settings,
  LogOut,
  Clock,
  Eye,
  BarChart3,
  Trophy,
  MessageSquare,
  Sparkles,
  Target,
  Brain,
  Heart,
  History,
  FolderKanban,
  BookOpen,
  GitBranch,
  MessageSquareText,
  Wrench,
  Monitor,
  Radio,
  Lightbulb,
  Building2,
  Shield as ShieldIcon,
  Handshake,
  Film,
  GitMerge,
  PieChart,
  BookOpen as Journal,
  HeartPulse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "./theme-toggle";

const mainNav = [
  { href: "/dashboard", label: "Timeline", icon: LayoutDashboard },
  { href: "/grid", label: "Equipo", icon: Grid3X3 },
  { href: "/now", label: "Ahora", icon: Radio },
  { href: "/promises", label: "Promesas", icon: Target },
  { href: "/standup", label: "Standup", icon: MessageSquare },
  { href: "/focus", label: "Focus", icon: Brain },
];

const insightsNav = [
  { href: "/audit-daily", label: "AI Audit", icon: Brain },
  { href: "/accountability", label: "Accountability", icon: Eye },
  { href: "/health", label: "Salud", icon: Heart },
  { href: "/weekly", label: "Semanal", icon: BarChart3 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/heatmap", label: "Heatmap", icon: Grid3X3 },
  { href: "/narrative", label: "Narrativa", icon: BookOpen },
  { href: "/collab", label: "Colaboración", icon: GitBranch },
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/insights", label: "Mis Insights", icon: Lightbulb },
  { href: "/org-stats", label: "Org Stats", icon: Building2 },
  { href: "/compatibility", label: "Compatibilidad", icon: GitMerge },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/compare", label: "Comparar", icon: Eye },
  { href: "/digest", label: "Digest", icon: BookOpen },
];

const socialNav = [
  { href: "/shoutouts", label: "Shoutouts", icon: Sparkles },
  { href: "/kudos", label: "Kudos", icon: Heart },
  { href: "/goals", label: "Objetivos", icon: Target },
  { href: "/feedback", label: "Feedback", icon: MessageSquareText },
  { href: "/pacts", label: "Pactos", icon: Handshake },
  { href: "/audit", label: "Audit Log", icon: History },
  { href: "/journal", label: "Journal", icon: Journal },
  { href: "/pulse", label: "Pulse", icon: HeartPulse },
  { href: "/replay", label: "Replay", icon: Film },
  { href: "/tools", label: "Herramientas", icon: Wrench },
  { href: "/warroom", label: "War Room", icon: Monitor },
];

const bottomNav = [
  { href: "/profile", label: "Mi Perfil", icon: User },
  { href: "/admin", label: "Admin", icon: ShieldIcon },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

function NavSection({ items, label }: { items: typeof mainNav; label?: string }) {
  const pathname = usePathname();
  return (
    <div>
      {label && (
        <p className="px-3 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-2 mt-1">
          {label}
        </p>
      )}
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group/nav flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary shadow-sm shadow-primary/5"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "w-[18px] h-[18px] transition-transform duration-200",
                  isActive && "scale-110",
                  !isActive && "group-hover/nav:translate-x-0.5"
                )}
              />
              <span className={cn(
                "transition-all duration-200",
                !isActive && "group-hover/nav:translate-x-0.5"
              )}>
                {item.label}
              </span>
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden md:flex w-[260px] flex-col border-r border-border/60 bg-sidebar h-screen sticky top-0">
      {/* Logo */}
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Clock className="w-[18px] h-[18px] text-white" />
          </div>
          <div>
            <span className="font-bold text-[15px] tracking-tight">Exomagram</span>
            <p className="text-[10px] text-muted-foreground/60 -mt-0.5 tracking-wide">Transparencia total</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        <NavSection items={mainNav} />
        <NavSection items={insightsNav} label="Insights" />
        <NavSection items={socialNav} label="Social" />
        <NavSection items={bottomNav} />
      </nav>

      {/* Divider */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      {/* Logout */}
      <div className="p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/5 rounded-xl"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
