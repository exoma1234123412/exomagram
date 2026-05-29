"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Home, Grid3X3, User, Settings, LogOut,
  Eye, BarChart3, Trophy, MessageSquare, Brain, Heart, History,
  Flame, Target, Sparkles, Gauge, Monitor, Gavel, TrendingUp,
  Pickaxe, Swords, Stethoscope, Waves, Siren, FileSignature,
  Shuffle, EyeOff, Activity, Droplets, Dna, Skull, Coins,
  Package, ShieldAlert, Zap, Award, Calendar, Users,
  MessageSquareWarning, ChevronDown, type LucideIcon,
  Mail, Crosshair,
  Timer, Hammer, UserMinus, Ghost, Ticket, CandlestickChart, Newspaper,
  AlertTriangle, Link2, Clock3,
  CircleDollarSign, ArrowDownUp, ScrollText, FileText,
  ShieldMinus, ScanSearch, Camera, BookOpen, FileWarning,
  Lock, Play, Handshake, Scale, Shield, Radar,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/layout/logo";

interface NavItem { href: string; label: string; icon: LucideIcon }
interface NavGroup { id: string; label: string; items: NavItem[] }

const sections: NavGroup[] = [
  {
    id: "ops", label: "OPS",
    items: [
      { href: "/home", label: "Inicio", icon: Home },
      { href: "/dashboard", label: "Timeline", icon: LayoutDashboard },
      { href: "/standup", label: "Standup", icon: MessageSquare },
      { href: "/promises", label: "Promesas", icon: Target },
      { href: "/contract", label: "Pacto Semanal", icon: FileSignature },
      { href: "/auto-capture", label: "Auto-Captura", icon: Radar },
      { href: "/grid", label: "Equipo", icon: Grid3X3 },
    ],
  },
  {
    id: "intel", label: "INTEL",
    items: [
      { href: "/brain", label: "Claude Brain", icon: Brain },
      { href: "/hotseat", label: "Hot Seat", icon: Flame },
      { href: "/one-on-one", label: "1:1 Prep", icon: MessageSquare },
      { href: "/claude-audit", label: "Auditoría", icon: Eye },
      { href: "/bios", label: "Bios AI", icon: Brain },
      { href: "/archaeology", label: "Fósiles", icon: Pickaxe },
      { href: "/excuses", label: "Detector Excusas", icon: MessageSquareWarning },
      { href: "/resign-risk", label: "Riesgo Renuncia", icon: UserMinus },
    ],
  },
  {
    id: "pressure", label: "PRESIÓN",
    items: [
      { href: "/shame", label: "Muro Vergüenza", icon: AlertTriangle },
      { href: "/chain", label: "Cadena Equipo", icon: Link2 },
      { href: "/speedometer", label: "Velocímetro", icon: Gauge },
      { href: "/response-time", label: "Tiempo Respuesta", icon: Clock3 },
      { href: "/capital", label: "Trust Capital", icon: ShieldMinus },
      { href: "/debt", label: "Deuda Acumulada", icon: Scale },
      { href: "/inspection", label: "La Inspección", icon: ScanSearch },
      { href: "/envelope", label: "Sobre Sellado", icon: FileWarning },
      { href: "/mirror-mode", label: "Modo Espejo", icon: Eye },
      { href: "/live-flow", label: "Flujo Vivo", icon: Play },
      { href: "/chronicle", label: "La Crónica", icon: BookOpen },
      { href: "/dossier", label: "Expediente", icon: ScrollText },
      { href: "/irrevocable", label: "Apuesta Irrevocable", icon: Lock },
      { href: "/collateral", label: "Colateral", icon: Handshake },
      { href: "/transparency", label: "Transparencia", icon: Eye },
      { href: "/daily-replay", label: "Replay Diario", icon: Camera },
    ],
  },
  {
    id: "monitor", label: "VIGILANCIA",
    items: [
      { href: "/pulse", label: "Pulso EKG", icon: Activity },
      { href: "/trust-decay", label: "Trust Decay", icon: Droplets },
      { href: "/entropy", label: "Entropía", icon: Waves },
      { href: "/accountability", label: "Accountability", icon: Eye },
      { href: "/tribunal", label: "Tribunal", icon: Gavel },
      { href: "/roulette", label: "Ruleta", icon: Shuffle },
      { href: "/silent-hours", label: "Horas Silencio", icon: EyeOff },
      { href: "/twin", label: "Accountability Twin", icon: Users },
      { href: "/deadman", label: "Dead Man's Switch", icon: Timer },
      { href: "/ghost-radar", label: "Fantasma Inverso", icon: Ghost },
      { href: "/lottery", label: "Lotería Auditoría", icon: Ticket },
      { href: "/inverted", label: "Modo Invertido", icon: ArrowDownUp },
    ],
  },
  {
    id: "data", label: "RENDIMIENTO",
    items: [
      { href: "/analytics", label: "Centro Comando", icon: Activity },
      { href: "/efficiency", label: "Eficiencia", icon: Gauge },
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/dna-evolution", label: "DNA Evolución", icon: Dna },
      { href: "/autopsy", label: "Autopsia Reunión", icon: Stethoscope },
      { href: "/retro", label: "Retro semanal", icon: BarChart3 },
      { href: "/health", label: "Salud", icon: Heart },
    ],
  },
  {
    id: "tactical", label: "TÁCTICO",
    items: [
      { href: "/duel", label: "Focus Duel", icon: Swords },
      { href: "/predictions", label: "Predicciones", icon: TrendingUp },
      { href: "/bets", label: "Apuestas", icon: Coins },
      { href: "/confession", label: "Confesión", icon: Skull },
      { href: "/panic", label: "Pánico", icon: Siren },
      { href: "/shoutouts", label: "Shoutouts", icon: Sparkles },
      { href: "/warroom", label: "War Room", icon: Monitor },
      { href: "/future-letter", label: "Carta al Futuro", icon: Mail },
      { href: "/bounties", label: "Bounties", icon: Crosshair },
      { href: "/elimination", label: "Eliminación", icon: Skull },
      { href: "/survivor", label: "Battle Royale", icon: Swords },
      { href: "/subastas", label: "Subasta Tareas", icon: Hammer },
      { href: "/trust-market", label: "Mercado Confianza", icon: CandlestickChart },
      { href: "/black-market", label: "Mercado Negro", icon: CircleDollarSign },
      { href: "/obituario", label: "Obituario", icon: Newspaper },
      { href: "/price-game", label: "Precio Correcto", icon: ArrowDownUp },
    ],
  },
  {
    id: "progress", label: "PROGRESIÓN",
    items: [
      { href: "/xp", label: "XP y Niveles", icon: Zap },
      { href: "/achievements", label: "Logros", icon: Award },
      { href: "/seasons", label: "Temporadas", icon: Calendar },
    ],
  },
  {
    id: "control", label: "CONTROL",
    items: [
      { href: "/goals", label: "Objetivos", icon: Target },
      { href: "/audit", label: "Audit Log", icon: History },
      { href: "/capsule", label: "Time Capsule", icon: Package },
      { href: "/retention", label: "Retención", icon: ShieldAlert },
      { href: "/inheritance", label: "Herencia Digital", icon: ScrollText },
      { href: "/insurance", label: "Seguro Trust Score", icon: Shield },
      { href: "/reports", label: "Reportes", icon: FileText },
    ],
  },
];

const configItems: NavItem[] = [
  { href: "/profile", label: "Mi Perfil", icon: User },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

function Section({ group, defaultOpen }: { group: NavGroup; defaultOpen: boolean }) {
  const pathname = usePathname();
  const hasActive = group.items.some((i) => pathname.startsWith(i.href));
  const [open, setOpen] = useState(defaultOpen || hasActive);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1 group cursor-pointer"
      >
        <span className="font-mono text-[9px] font-semibold tracking-[0.18em] text-muted-foreground/40 group-hover:text-muted-foreground transition-colors select-none">
          {group.label}
        </span>
        <ChevronDown
          className={cn(
            "w-2.5 h-2.5 text-muted-foreground/25 transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
      </button>
      {open && (
        <div className="mt-0.5 space-y-px">
          {group.items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-[5px] text-[11px] font-mono transition-colors relative group/item",
                  isActive
                    ? "text-primary font-medium bg-primary/8"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
                )}
                <item.icon
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground/50 group-hover/item:text-muted-foreground"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
    <aside className="hidden md:flex w-56 flex-col border-r border-border/60 bg-sidebar h-screen sticky top-0 bg-grid-dense">
      {/* Brand header */}
      <div className="px-3 pt-3 pb-3 border-b border-border/50 glow-line-top">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Logo size={32} />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_6px] shadow-primary/60" />
            </div>
            <div>
              <span className="font-mono text-[12px] font-black tracking-[0.14em] text-foreground block leading-none">
                EXOMAGRAM
              </span>
              <span className="font-mono text-[7px] tracking-[0.3em] text-primary/70 uppercase mt-0.5 block">
                Vigilancia Total
              </span>
            </div>
          </div>
          <NotificationBell />
        </div>
        <div className="flex items-center gap-1.5 px-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_6px] shadow-green-500/60" />
          <span className="font-mono text-[8px] tracking-[0.2em] text-green-500/80 uppercase">Sistema activo</span>
        </div>
      </div>

      <nav className="flex-1 py-2 px-1 space-y-3 overflow-y-auto">
        {sections.map((group, i) => (
          <Section key={group.id} group={group} defaultOpen={i < 3} />
        ))}
        <div className="pt-1 border-t border-border/30">
          <div className="space-y-px">
            {configItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-[5px] text-[11px] font-mono transition-colors relative",
                    isActive
                      ? "text-primary font-medium bg-primary/8"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
                  )}
                  <item.icon className={cn("w-3.5 h-3.5 shrink-0", isActive && "text-primary")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="px-3 py-2 border-t border-border/30">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-2 py-1 text-[10px] font-mono tracking-wide text-muted-foreground/30 hover:text-muted-foreground transition-colors cursor-pointer uppercase"
        >
          <LogOut className="w-3 h-3" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
