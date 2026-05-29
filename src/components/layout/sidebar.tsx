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
  Brain,
  Heart,
  History,
  Flame,
  Target,
  Sparkles,
  Gauge,
  Monitor,
  Gavel,
  TrendingUp,
  Pickaxe,
  Swords,
  Stethoscope,
  Waves,
  Siren,
  FileSignature,
  Shuffle,
  EyeOff,
  Activity,
  Droplets,
  Dna,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";

const dailyNav = [
  { href: "/home", label: "Inicio", icon: Home },
  { href: "/dashboard", label: "Timeline", icon: LayoutDashboard },
  { href: "/standup", label: "Standup", icon: MessageSquare },
  { href: "/promises", label: "Promesas", icon: Target },
  { href: "/grid", label: "Equipo", icon: Grid3X3 },
];

const aiNav = [
  { href: "/brain", label: "Claude Brain", icon: Brain },
  { href: "/claude-audit", label: "Auditoría", icon: Eye },
  { href: "/hotseat", label: "Hot Seat", icon: Flame },
  { href: "/one-on-one", label: "1:1 Prep", icon: MessageSquare },
];

const metricsNav = [
  { href: "/accountability", label: "Accountability", icon: Eye },
  { href: "/efficiency", label: "Eficiencia", icon: Gauge },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/health", label: "Salud", icon: Heart },
  { href: "/retro", label: "Retro semanal", icon: BarChart3 },
];

const moreNav = [
  { href: "/shoutouts", label: "Shoutouts", icon: Sparkles },
  { href: "/goals", label: "Objetivos", icon: Target },
  { href: "/audit", label: "Audit Log", icon: History },
  { href: "/warroom", label: "War Room", icon: Monitor },
];

const creativeNav = [
  { href: "/tribunal", label: "Tribunal Diario", icon: Gavel },
  { href: "/predictions", label: "Predicciones", icon: TrendingUp },
  { href: "/archaeology", label: "Fósiles", icon: Pickaxe },
  { href: "/duel", label: "Focus Duel", icon: Swords },
  { href: "/autopsy", label: "Autopsia Reunión", icon: Stethoscope },
  { href: "/entropy", label: "Entropía", icon: Waves },
  { href: "/panic", label: "Botón Pánico", icon: Siren },
  { href: "/contract", label: "Pacto Semanal", icon: FileSignature },
  { href: "/roulette", label: "Ruleta", icon: Shuffle },
  { href: "/silent-hours", label: "Horas Silencio", icon: EyeOff },
  { href: "/pulse", label: "Pulso EKG", icon: Activity },
  { href: "/trust-decay", label: "Trust Decay", icon: Droplets },
  { href: "/dna-evolution", label: "DNA Evolución", icon: Dna },
];

const configNav = [
  { href: "/profile", label: "Mi Perfil", icon: User },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

function NavSection({ items, label }: { items: typeof dailyNav; label?: string }) {
  const pathname = usePathname();
  return (
    <div>
      {label && (
        <p className="px-3 text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-1.5 mt-1">
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
                "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-normal transition-colors",
                isActive
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
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
    <aside className="hidden md:flex w-56 flex-col border-r border-border/50 bg-sidebar h-screen sticky top-0">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-foreground rounded-md flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 text-background" />
          </div>
          <span className="font-medium text-sm tracking-tight">Exomagram</span>
        </div>
        <NotificationBell />
      </div>

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        <NavSection items={dailyNav} />
        <NavSection items={aiNav} label="AI" />
        <NavSection items={metricsNav} label="Métricas" />
        <NavSection items={moreNav} label="Más" />
        <NavSection items={creativeNav} label="Laboratorio" />
        <NavSection items={configNav} />
      </nav>

      <div className="p-3 border-t border-border/50">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground text-xs"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
