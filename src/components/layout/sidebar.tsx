"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Home,
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
  Plug,
  FileText,
  Gauge,
  Flag,
  CreditCard,
  Settings2,
  ScanEye,
  ScrollText,
  GanttChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "./theme-toggle";

// ─── TRABAJO DIARIO ─────────────────────────────────────
const dailyNav = [
  { href: "/home", label: "Inicio", icon: Home },
  { href: "/dashboard", label: "Timeline", icon: LayoutDashboard },
  { href: "/now", label: "Ahora", icon: Radio },
  { href: "/standup", label: "Standup", icon: MessageSquare },
  { href: "/focus", label: "Focus", icon: Brain },
  { href: "/brain", label: "Claude Brain", icon: Brain },
  { href: "/one-on-one", label: "1:1 Prep", icon: MessageSquare },
  { href: "/grid", label: "Equipo", icon: Grid3X3 },
];

// ─── VIGILANCIA ──────────────────────────────────────────
const vigilanceNav = [
  { href: "/vigilance", label: "Vigilancia", icon: ScanEye },
  { href: "/timeline-view", label: "Timeline Visual", icon: GanttChart },
  { href: "/activity-log", label: "Activity Log", icon: ScrollText },
  { href: "/accountability", label: "Accountability", icon: Eye },
];

// ─── RENDIMIENTO ─────────────────────────────────────────
const performanceNav = [
  { href: "/mirror", label: "El Espejo", icon: Eye },
  { href: "/power-rankings", label: "Power Rankings", icon: Trophy },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/performance", label: "Performance", icon: Gauge },
  { href: "/health", label: "Salud", icon: Heart },
];

// ─── ANÁLISIS ────────────────────────────────────────────
const analyticsNav = [
  { href: "/weekly", label: "Semanal", icon: BarChart3 },
  { href: "/heatmap", label: "Heatmap", icon: Grid3X3 },
  { href: "/insights", label: "Mis Insights", icon: Lightbulb },
  { href: "/org-stats", label: "Org Stats", icon: Building2 },
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/compare", label: "Comparar", icon: Eye },
  { href: "/compatibility", label: "Compatibilidad", icon: GitMerge },
  { href: "/collab", label: "Colaboración", icon: GitBranch },
];

// ─── PLANIFICACIÓN ───────────────────────────────────────
const planningNav = [
  { href: "/sprints", label: "Sprints", icon: Flag },
  { href: "/capacity", label: "Capacidad", icon: Gauge },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/goals", label: "Objetivos", icon: Target },
  { href: "/promises", label: "Promesas", icon: Target },
];

// ─── EQUIPO & SOCIAL ─────────────────────────────────────
const socialNav = [
  { href: "/shoutouts", label: "Shoutouts", icon: Sparkles },
  { href: "/kudos", label: "Kudos", icon: Heart },
  { href: "/feedback", label: "Feedback", icon: MessageSquareText },
  { href: "/pacts", label: "Pactos", icon: Handshake },
  { href: "/pulse", label: "Pulse", icon: HeartPulse },
];

// ─── REPORTES ────────────────────────────────────────────
const reportsNav = [
  { href: "/reports", label: "Reportes", icon: FileText },
  { href: "/narrative", label: "Narrativa AI", icon: BookOpen },
  { href: "/digest", label: "Digest", icon: BookOpen },
  { href: "/audit", label: "Audit Log", icon: History },
  { href: "/journal", label: "Journal", icon: Journal },
];

// ─── HERRAMIENTAS ────────────────────────────────────────
const toolsNav = [
  { href: "/tools", label: "Herramientas", icon: Wrench },
  { href: "/replay", label: "Replay", icon: Film },
  { href: "/warroom", label: "War Room", icon: Monitor },
];

// ─── CONFIGURACIÓN ───────────────────────────────────────
const configNav = [
  { href: "/profile", label: "Mi Perfil", icon: User },
  { href: "/admin", label: "Admin", icon: ShieldIcon },
  { href: "/org-settings", label: "Org Config", icon: Settings2 },
  { href: "/integrations", label: "Integraciones", icon: Plug },
  { href: "/pricing", label: "Plan", icon: CreditCard },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

function NavSection({ items, label }: { items: typeof dailyNav; label?: string }) {
  const pathname = usePathname();
  return (
    <div>
      {label && (
        <p className="px-3 text-[9px] font-bold text-primary/40 uppercase tracking-[0.25em] mb-2 mt-1 font-data flex items-center gap-2">
          <span className="w-2 h-px bg-primary/20" />
          {label}
          <span className="flex-1 h-px bg-primary/10" />
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
    <aside className="hidden md:flex w-[260px] flex-col border-r border-primary/10 bg-sidebar h-screen sticky top-0">
      {/* Logo — Palantir command header */}
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-primary/80 to-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20 animate-surveillance">
            <Eye className="w-[18px] h-[18px] text-primary-foreground" />
          </div>
          <div>
            <span className="font-bold text-[15px] tracking-widest uppercase font-data">Exomagram</span>
            <p className="text-[9px] text-primary/50 -mt-0.5 tracking-[0.2em] uppercase">Sistema de vigilancia</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>

      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        <NavSection items={dailyNav} />
        <NavSection items={vigilanceNav} label="Vigilancia" />
        <NavSection items={performanceNav} label="Rendimiento" />
        <NavSection items={analyticsNav} label="Análisis" />
        <NavSection items={planningNav} label="Planificación" />
        <NavSection items={socialNav} label="Social" />
        <NavSection items={reportsNav} label="Reportes" />
        <NavSection items={toolsNav} label="Herramientas" />
        <NavSection items={configNav} label="Configuración" />
      </nav>

      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/5 rounded-xl text-[12px] tracking-wider uppercase"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
