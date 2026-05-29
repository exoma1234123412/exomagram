"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Home, Grid3X3, User, Settings, Clock,
  Eye, BarChart3, Trophy, MessageSquare, Brain, Heart, History,
  Flame, Target, Sparkles, Gauge, Monitor, Gavel, TrendingUp,
  Pickaxe, Swords, Stethoscope, Waves, Siren, FileSignature,
  Shuffle, EyeOff, Activity, Droplets, Dna, Skull, Coins,
  Package, ShieldAlert, Zap, Award, Calendar, Users,
  MessageSquareWarning, ScanEye, Radio,
  Mail, Crosshair,
  ArrowDownUp, CandlestickChart, Hammer, Newspaper, Ghost, Timer, Ticket,
  UserMinus, Link2, Clock3, ShieldMinus, Lock, Handshake, Shield,
  Radar, FileText, Bone, Database, Table2, Scale, Search, Command,
  type LucideIcon,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════
// Command palette item type
// ═══════════════════════════════════════════════════════════

interface CommandItem {
  href: string;
  label: string;
  icon: LucideIcon;
  section: string;
}

// ═══════════════════════════════════════════════════════════
// All navigation items — extracted from mobile-nav menuSections
// ═══════════════════════════════════════════════════════════

const ALL_ITEMS: CommandItem[] = [
  // OPS
  { href: "/home", label: "Inicio", icon: Home, section: "OPS" },
  { href: "/dashboard", label: "Timeline", icon: LayoutDashboard, section: "OPS" },
  { href: "/standup", label: "Standup", icon: MessageSquare, section: "OPS" },
  { href: "/promises", label: "Promesas", icon: Target, section: "OPS" },
  { href: "/contract", label: "Pacto Semanal", icon: FileSignature, section: "OPS" },
  { href: "/auto-capture", label: "Auto-Captura", icon: Radar, section: "OPS" },
  { href: "/grid", label: "Equipo", icon: Grid3X3, section: "OPS" },

  // INTEL
  { href: "/command", label: "Centro de Mando", icon: Crosshair, section: "INTEL" },
  { href: "/brain", label: "Claude Brain", icon: Brain, section: "INTEL" },
  { href: "/hotseat", label: "Hot Seat", icon: Flame, section: "INTEL" },
  { href: "/one-on-one", label: "1:1 Prep", icon: MessageSquare, section: "INTEL" },
  { href: "/claude-audit", label: "Auditoría", icon: Eye, section: "INTEL" },
  { href: "/bios", label: "Bios AI", icon: Brain, section: "INTEL" },
  { href: "/archaeology", label: "Fósiles", icon: Pickaxe, section: "INTEL" },
  { href: "/excuses", label: "Detector Excusas", icon: MessageSquareWarning, section: "INTEL" },
  { href: "/excuse-archaeology", label: "Arqueología Excusas", icon: Bone, section: "INTEL" },
  { href: "/brutal-truth", label: "Verdad Brutal", icon: Skull, section: "INTEL" },

  // PRESION
  { href: "/chain", label: "Cadena Equipo", icon: Link2, section: "PRESION" },
  { href: "/speedometer", label: "Velocímetro", icon: Gauge, section: "PRESION" },
  { href: "/response-time", label: "Tiempo Respuesta", icon: Clock3, section: "PRESION" },
  { href: "/capital", label: "Trust Capital", icon: ShieldMinus, section: "PRESION" },
  { href: "/irrevocable", label: "Apuesta Irrevocable", icon: Lock, section: "PRESION" },
  { href: "/collateral", label: "Colateral", icon: Handshake, section: "PRESION" },
  { href: "/shame-score", label: "Indice Verguenza", icon: Skull, section: "PRESION" },
  { href: "/weekly-shame", label: "Informe Semanal", icon: Newspaper, section: "PRESION" },
  { href: "/peer-verdict", label: "Peer Verdict", icon: Scale, section: "PRESION" },

  // VIGILANCIA
  { href: "/surveillance", label: "Vigilancia Total", icon: Eye, section: "VIGILANCIA" },
  { href: "/radar", label: "Radar", icon: Radar, section: "VIGILANCIA" },
  { href: "/pulse", label: "Pulso EKG", icon: Activity, section: "VIGILANCIA" },
  { href: "/trust-decay", label: "Trust Decay", icon: Droplets, section: "VIGILANCIA" },
  { href: "/entropy", label: "Entropía", icon: Waves, section: "VIGILANCIA" },
  { href: "/accountability", label: "Accountability", icon: Eye, section: "VIGILANCIA" },
  { href: "/tribunal", label: "Tribunal", icon: Gavel, section: "VIGILANCIA" },
  { href: "/roulette", label: "Ruleta", icon: Shuffle, section: "VIGILANCIA" },
  { href: "/silent-hours", label: "Horas Silencio", icon: EyeOff, section: "VIGILANCIA" },
  { href: "/twin", label: "Accountability Twin", icon: Users, section: "VIGILANCIA" },
  { href: "/deadman", label: "Dead Man's Switch", icon: Timer, section: "VIGILANCIA" },
  { href: "/ghost-radar", label: "Fantasma Inverso", icon: Ghost, section: "VIGILANCIA" },
  { href: "/ghost-mode", label: "Modo Fantasma", icon: Ghost, section: "VIGILANCIA" },
  { href: "/lottery", label: "Lotería Auditoría", icon: Ticket, section: "VIGILANCIA" },
  { href: "/inverted", label: "Modo Invertido", icon: ArrowDownUp, section: "VIGILANCIA" },

  // RENDIMIENTO
  { href: "/analytics", label: "Centro Comando", icon: Activity, section: "RENDIMIENTO" },
  { href: "/efficiency", label: "Eficiencia", icon: Gauge, section: "RENDIMIENTO" },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, section: "RENDIMIENTO" },
  { href: "/dna-evolution", label: "DNA Evolución", icon: Dna, section: "RENDIMIENTO" },
  { href: "/autopsy", label: "Autopsia Reunión", icon: Stethoscope, section: "RENDIMIENTO" },
  { href: "/retro", label: "Retro semanal", icon: BarChart3, section: "RENDIMIENTO" },
  { href: "/health", label: "Salud", icon: Heart, section: "RENDIMIENTO" },
  { href: "/matrix", label: "Matriz", icon: Table2, section: "RENDIMIENTO" },

  // TACTICO
  { href: "/arena", label: "Competencias", icon: Swords, section: "TACTICO" },
  { href: "/duel", label: "Focus Duel", icon: Swords, section: "TACTICO" },
  { href: "/predictions", label: "Predicciones", icon: TrendingUp, section: "TACTICO" },
  { href: "/bets", label: "Apuestas", icon: Coins, section: "TACTICO" },
  { href: "/confession", label: "Confesión", icon: Skull, section: "TACTICO" },
  { href: "/panic", label: "Pánico", icon: Siren, section: "TACTICO" },
  { href: "/shoutouts", label: "Shoutouts", icon: Sparkles, section: "TACTICO" },
  { href: "/warroom", label: "War Room", icon: Monitor, section: "TACTICO" },
  { href: "/future-letter", label: "Carta Futuro", icon: Mail, section: "TACTICO" },
  { href: "/bounties", label: "Bounties", icon: Crosshair, section: "TACTICO" },
  { href: "/blood-contract", label: "Contrato Sangre", icon: Droplets, section: "TACTICO" },
  { href: "/elimination", label: "Eliminación", icon: Skull, section: "TACTICO" },
  { href: "/survivor", label: "Battle Royale", icon: Swords, section: "TACTICO" },
  { href: "/subastas", label: "Subasta Tareas", icon: Hammer, section: "TACTICO" },
  { href: "/trust-market", label: "Mercado Confianza", icon: CandlestickChart, section: "TACTICO" },
  { href: "/black-market", label: "Mercado Negro", icon: CandlestickChart, section: "TACTICO" },
  { href: "/obituario", label: "Obituario", icon: Newspaper, section: "TACTICO" },
  { href: "/price-game", label: "Precio Correcto", icon: ArrowDownUp, section: "TACTICO" },

  // PROGRESION
  { href: "/xp", label: "XP y Niveles", icon: Zap, section: "PROGRESION" },
  { href: "/achievements", label: "Logros", icon: Award, section: "PROGRESION" },
  { href: "/seasons", label: "Temporadas", icon: Calendar, section: "PROGRESION" },

  // CONTROL
  { href: "/goals", label: "Objetivos", icon: Target, section: "CONTROL" },
  { href: "/audit", label: "Audit Log", icon: History, section: "CONTROL" },
  { href: "/capsule", label: "Time Capsule", icon: Package, section: "CONTROL" },
  { href: "/retention", label: "Retención", icon: ShieldAlert, section: "CONTROL" },
  { href: "/insurance", label: "Seguro Trust Score", icon: Shield, section: "CONTROL" },
  { href: "/inheritance", label: "Herencia Digital", icon: Users, section: "CONTROL" },
  { href: "/reports", label: "Reportes", icon: FileText, section: "CONTROL" },
  { href: "/raw-data", label: "Raw Data", icon: Database, section: "CONTROL" },

  // PERFIL
  { href: "/profile", label: "Mi Perfil", icon: User, section: "PERFIL" },
  { href: "/settings", label: "Ajustes", icon: Settings, section: "PERFIL" },
];

// Section display names for labels
const SECTION_LABELS: Record<string, string> = {
  RECIENTES: "RECIENTES",
  OPS: "OPS",
  INTEL: "INTEL",
  PRESION: "PRESION",
  VIGILANCIA: "VIGILANCIA",
  RENDIMIENTO: "RENDIMIENTO",
  TACTICO: "TACTICO",
  PROGRESION: "PROGRESION",
  CONTROL: "CONTROL",
  PERFIL: "PERFIL",
};

const RECENTS_KEY = "exomagram_cmd_recents";
const MAX_RECENTS = 5;

function getRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecent(href: string) {
  try {
    const recents = getRecents().filter((h) => h !== href);
    recents.unshift(href);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
  } catch {
    // localStorage not available
  }
}

// ═══════════════════════════════════════════════════════════
// Highlight matching substring in label
// ═══════════════════════════════════════════════════════════

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;

  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;

  return (
    <span>
      {text.slice(0, idx)}
      <span className="text-primary font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build filtered items list
  const getFilteredItems = useCallback((): { items: CommandItem[]; sections: { label: string; startIndex: number; count: number }[] } => {
    let items: CommandItem[] = [];
    const sections: { label: string; startIndex: number; count: number }[] = [];

    if (!query) {
      // Show recents first, then all sections
      const recentHrefs = getRecents();
      const recentItems = recentHrefs
        .map((href) => ALL_ITEMS.find((item) => item.href === href))
        .filter((item): item is CommandItem => item !== undefined);

      if (recentItems.length > 0) {
        sections.push({ label: "RECIENTES", startIndex: 0, count: recentItems.length });
        items = [...recentItems];
      }

      // Group remaining by section
      const sectionOrder = ["OPS", "INTEL", "PRESION", "VIGILANCIA", "RENDIMIENTO", "TACTICO", "PROGRESION", "CONTROL", "PERFIL"];
      for (const sectionName of sectionOrder) {
        const sectionItems = ALL_ITEMS.filter((item) => item.section === sectionName);
        if (sectionItems.length > 0) {
          sections.push({ label: sectionName, startIndex: items.length, count: sectionItems.length });
          items = [...items, ...sectionItems];
        }
      }
    } else {
      // Filter by query
      const q = query.toLowerCase();
      const matched = ALL_ITEMS.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.href.toLowerCase().includes(q) ||
          item.section.toLowerCase().includes(q)
      );

      // Group matched by section
      const seen = new Set<string>();
      for (const item of matched) {
        if (!seen.has(item.section)) {
          seen.add(item.section);
          const sectionItems = matched.filter((m) => m.section === item.section);
          sections.push({ label: item.section, startIndex: items.length, count: sectionItems.length });
          items = [...items, ...sectionItems];
        }
      }
    }

    return { items, sections };
  }, [query]);

  const { items: filteredItems, sections } = getFilteredItems();

  // Global keyboard listener for Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) {
            setQuery("");
            setActiveIndex(0);
          }
          return !prev;
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function navigate(href: string) {
    addRecent(href);
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (filteredItems.length === 0) return;
        setActiveIndex((prev) => (prev + 1) % filteredItems.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (filteredItems.length === 0) return;
        setActiveIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
        break;
      case "Enter":
        e.preventDefault();
        if (filteredItems[activeIndex]) {
          navigate(filteredItems[activeIndex].href);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] sm:pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div
        className="relative w-full max-w-[calc(100%-2rem)] sm:max-w-xl mx-4 sm:mx-0 border border-border bg-background overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comando..."
            className="flex-1 bg-transparent outline-none font-mono text-sm placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="font-mono text-[9px] tracking-wide text-muted-foreground border border-border px-1.5 py-0.5 bg-accent/30">
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-[min(60vh,400px)] sm:max-h-[60vh] overflow-y-auto">
          {filteredItems.length === 0 && query && (
            <div className="px-4 py-8 text-center">
              <p className="font-mono text-xs text-muted-foreground">
                Sin resultados para &quot;{query}&quot;
              </p>
            </div>
          )}

          {sections.map((section) => {
            const sectionItems = filteredItems.slice(section.startIndex, section.startIndex + section.count);

            return (
              <div key={`${section.label}-${section.startIndex}`} className="py-1.5">
                <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60 px-4 py-1">
                  {SECTION_LABELS[section.label] ?? section.label}
                </p>
                {sectionItems.map((item, i) => {
                  const flatIndex = section.startIndex + i;
                  const isActive = flatIndex === activeIndex;
                  const Icon = item.icon;

                  return (
                    <button
                      key={`${item.href}-${flatIndex}`}
                      data-index={flatIndex}
                      onClick={() => navigate(item.href)}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors duration-75 cursor-pointer",
                        isActive
                          ? "bg-primary/10 border-l-2 border-primary"
                          : "border-l-2 border-transparent hover:bg-accent/30"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <span className={cn(
                        "font-mono text-xs truncate",
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )}>
                        <HighlightMatch text={item.label} query={query} />
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground/60 ml-auto shrink-0">
                        {item.href}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-accent/10 font-mono text-[9px] tracking-wide text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="border border-border px-1 py-0.5 bg-accent/30 text-[8px]">
              <span className="inline-flex items-center gap-0.5"><Command className="w-2.5 h-2.5" />K</span>
            </kbd>
            Abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-border px-1 py-0.5 bg-accent/30 text-[8px]">↑↓</kbd>
            Navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-border px-1 py-0.5 bg-accent/30 text-[8px]">↵</kbd>
            Ir
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <span className="tabular-nums">{filteredItems.length}</span> comandos
          </span>
        </div>
      </div>
    </div>
  );
}
