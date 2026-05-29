"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
 LayoutDashboard, Home, Grid3X3, User, Settings, LogOut, Clock,
 Eye, BarChart3, Trophy, MessageSquare, Brain, Heart, History,
 Flame, Target, Sparkles, Gauge, Monitor, Gavel, TrendingUp,
 Pickaxe, Swords, Stethoscope, Waves, Siren, FileSignature,
 Shuffle, EyeOff, Activity, Droplets, Dna, Skull, Coins,
 Package, ShieldAlert, Zap, Award, Calendar, Users,
 MessageSquareWarning, Plus, ScanEye, Radio, Menu, X,
 Mail, Crosshair,
 ArrowDownUp, CandlestickChart, Hammer, Newspaper, Ghost, Timer, Ticket,
 UserMinus, Link2, Clock3, ShieldMinus, Lock, Handshake, Shield,
 Radar, FileText, Bone, Database, Table2, Scale,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/layout/logo";

interface MobileNavProps {
 onLogEntry: () => void;
 unreadCount?: number;
}

const menuSections = [
 {
 label:"OPS",
 items: [
 { href:"/home", label:"Inicio", icon: Home },
 { href:"/dashboard", label:"Timeline", icon: LayoutDashboard },
 { href:"/standup", label:"Standup", icon: MessageSquare },
 { href:"/promises", label:"Promesas", icon: Target },
 { href:"/contract", label:"Pacto Semanal", icon: FileSignature },
 { href:"/auto-capture", label:"Auto-Captura", icon: Radar },
 { href:"/grid", label:"Equipo", icon: Grid3X3 },
 ],
 },
 {
 label:"INTEL",
 items: [
 { href:"/command", label:"Centro de Mando", icon: Crosshair },
 { href:"/brain", label:"Claude Brain", icon: Brain },
 { href:"/hotseat", label:"Hot Seat", icon: Flame },
 { href:"/one-on-one", label:"1:1 Prep", icon: MessageSquare },
 { href:"/claude-audit", label:"Auditoría", icon: Eye },
 { href:"/bios", label:"Bios AI", icon: Brain },
 { href:"/archaeology", label:"Fósiles", icon: Pickaxe },
 { href:"/excuses", label:"Detector Excusas", icon: MessageSquareWarning },
 { href:"/excuse-archaeology", label:"Arqueología Excusas", icon: Bone },
 { href:"/brutal-truth", label:"Verdad Brutal", icon: Skull },
 ],
 },
 {
 label:"PRESION",
 items: [
 { href:"/chain", label:"Cadena Equipo", icon: Link2 },
 { href:"/speedometer", label:"Velocímetro", icon: Gauge },
 { href:"/response-time", label:"Tiempo Respuesta", icon: Clock3 },
 { href:"/capital", label:"Trust Capital", icon: ShieldMinus },
 { href:"/irrevocable", label:"Apuesta Irrevocable", icon: Lock },
 { href:"/collateral", label:"Colateral", icon: Handshake },
 { href:"/shame-score", label:"Indice Verguenza", icon: Skull },
 { href:"/weekly-shame", label:"Informe Semanal", icon: Newspaper },
 { href:"/peer-verdict", label:"Peer Verdict", icon: Scale },
 ],
 },
 {
 label:"VIGILANCIA",
 items: [
 { href:"/surveillance", label:"Vigilancia Total", icon: Eye },
 { href:"/radar", label:"Radar", icon: Radar },
 { href:"/pulse", label:"Pulso EKG", icon: Activity },
 { href:"/trust-decay", label:"Trust Decay", icon: Droplets },
 { href:"/entropy", label:"Entropía", icon: Waves },
 { href:"/accountability", label:"Accountability", icon: Eye },
 { href:"/tribunal", label:"Tribunal", icon: Gavel },
 { href:"/roulette", label:"Ruleta", icon: Shuffle },
 { href:"/silent-hours", label:"Horas Silencio", icon: EyeOff },
 { href:"/twin", label:"Accountability Twin", icon: Users },
 { href:"/deadman", label:"Dead Man's Switch", icon: Timer },
 { href:"/ghost-radar", label:"Fantasma Inverso", icon: Ghost },
 { href:"/ghost-mode", label:"Modo Fantasma", icon: Ghost },
 { href:"/lottery", label:"Lotería Auditoría", icon: Ticket },
 { href:"/inverted", label:"Modo Invertido", icon: ArrowDownUp },
 ],
 },
 {
 label:"RENDIMIENTO",
 items: [
 { href:"/analytics", label:"Centro Comando", icon: Activity },
 { href:"/efficiency", label:"Eficiencia", icon: Gauge },
 { href:"/leaderboard", label:"Leaderboard", icon: Trophy },
 { href:"/dna-evolution", label:"DNA Evolución", icon: Dna },
 { href:"/autopsy", label:"Autopsia Reunión", icon: Stethoscope },
 { href:"/retro", label:"Retro semanal", icon: BarChart3 },
 { href:"/health", label:"Salud", icon: Heart },
 { href:"/matrix", label:"Matriz", icon: Table2 },
 ],
 },
 {
 label:"TÁCTICO",
 items: [
 { href:"/arena", label:"Competencias", icon: Swords },
 { href:"/duel", label:"Focus Duel", icon: Swords },
 { href:"/predictions", label:"Predicciones", icon: TrendingUp },
 { href:"/bets", label:"Apuestas", icon: Coins },
 { href:"/confession", label:"Confesión", icon: Skull },
 { href:"/panic", label:"Pánico", icon: Siren },
 { href:"/shoutouts", label:"Shoutouts", icon: Sparkles },
 { href:"/warroom", label:"War Room", icon: Monitor },
 { href:"/future-letter", label:"Carta Futuro", icon: Mail },
 { href:"/bounties", label:"Bounties", icon: Crosshair },
 { href:"/blood-contract", label:"Contrato Sangre", icon: Droplets },
 { href:"/elimination", label:"Eliminación", icon: Skull },
 { href:"/survivor", label:"Battle Royale", icon: Swords },
 { href:"/subastas", label:"Subasta Tareas", icon: Hammer },
 { href:"/trust-market", label:"Mercado Confianza", icon: CandlestickChart },
 { href:"/black-market", label:"Mercado Negro", icon: CandlestickChart },
 { href:"/obituario", label:"Obituario", icon: Newspaper },
 { href:"/price-game", label:"Precio Correcto", icon: ArrowDownUp },
 ],
 },
 {
 label:"PROGRESIÓN",
 items: [
 { href:"/xp", label:"XP y Niveles", icon: Zap },
 { href:"/achievements", label:"Logros", icon: Award },
 { href:"/seasons", label:"Temporadas", icon: Calendar },
 ],
 },
 {
 label:"CONTROL",
 items: [
 { href:"/goals", label:"Objetivos", icon: Target },
 { href:"/audit", label:"Audit Log", icon: History },
 { href:"/capsule", label:"Time Capsule", icon: Package },
 { href:"/retention", label:"Retención", icon: ShieldAlert },
 { href:"/insurance", label:"Seguro Trust Score", icon: Shield },
 { href:"/inheritance", label:"Herencia Digital", icon: Users },
 { href:"/reports", label:"Reportes", icon: FileText },
 { href:"/raw-data", label:"Raw Data", icon: Database },
 ],
 },
 {
 label: null,
 items: [
 { href:"/profile", label:"Mi Perfil", icon: User },
 { href:"/settings", label:"Ajustes", icon: Settings },
 ],
 },
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
 <div className="md:hidden fixed inset-0 z-[60] bg-background bg-grid-dense">
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

 <div className="overflow-y-auto h-[calc(100vh-120px)] px-4 py-3 space-y-4">
 {menuSections.map((section, sectionIdx) => (
 <div key={sectionIdx}>
 {section.label && (
 <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-muted-foreground mb-2 px-1">
 {section.label}
 </p>
 )}
 <div className="grid grid-cols-3 gap-1">
 {section.items.map((item) => {
 const isActive = pathname.startsWith(item.href);
 return (
 <Link
 key={item.href}
 href={item.href}
 onClick={() => setMenuOpen(false)}
 className={cn(
"flex flex-col items-center gap-1 p-2.5 text-center transition-all active:scale-95 border",
 isActive
 ?"bg-primary/8 text-primary border-primary/30":"bg-accent/20 text-muted-foreground hover:bg-accent/40 border-border/30")}
 >
 <item.icon className={cn("w-4 h-4", isActive &&"text-primary")} />
 <span className="text-[9px] font-mono font-medium leading-tight truncate w-full">{item.label}</span>
 </Link>
 );
 })}
 </div>
 </div>
 ))}
 </div>

 <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-border/40 bg-background safe-area-pb">
 <button
 onClick={handleLogout}
 className="flex items-center gap-2.5 w-full px-3 py-2 text-[10px] font-mono tracking-wide uppercase text-muted-foreground hover:text-muted-foreground hover:bg-accent/30 transition-colors">
 <LogOut className="w-3 h-3"/>
 Cerrar sesión
 </button>
 </div>
 </div>
 )}

 <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 glass border-t border-border/50 z-50 pb-[env(safe-area-inset-bottom)]">
 <div className="flex items-center justify-around py-1.5 px-1">
 <Link
 href="/dashboard"className={cn(
"relative flex flex-col items-center gap-0.5 px-3 py-1 text-[8px] font-mono font-medium tracking-wide uppercase transition-all",
 pathname.startsWith("/dashboard") ?"text-primary":"text-muted-foreground active:scale-95")}
 >
 <LayoutDashboard className="w-4.5 h-4.5"/>
 Timeline
 {pathname.startsWith("/dashboard") && <span className="w-4 h-[1px] bg-primary mt-0.5"/>}
 </Link>

 <Link
 href="/now"className={cn(
"relative flex flex-col items-center gap-0.5 px-3 py-1 text-[8px] font-mono font-medium tracking-wide uppercase transition-all",
 pathname.startsWith("/now") ?"text-primary":"text-muted-foreground active:scale-95")}
 >
 <Radio className="w-4.5 h-4.5"/>
 Ahora
 {pathname.startsWith("/now") && <span className="w-4 h-[1px] bg-primary mt-0.5"/>}
 </Link>

 <button
 onClick={onLogEntry}
 className="flex flex-col items-center gap-0.5 px-3 py-1 text-[8px] font-mono font-medium tracking-wide uppercase text-white active:scale-95 transition-transform">
 <div className="w-10 h-10 bg-primary flex items-center justify-center -mt-5 border border-primary/80 ring-2 ring-background">
 <Plus className="w-4.5 h-4.5"/>
 </div>
 <span className="text-foreground mt-0.5">Registrar</span>
 </button>

 <Link
 href="/vigilance"className={cn(
"flex flex-col items-center gap-0.5 px-3 py-1 text-[8px] font-mono font-medium tracking-wide uppercase transition-all",
 pathname.startsWith("/vigilance") ?"text-primary":"text-muted-foreground active:scale-95")}
 >
 <ScanEye className="w-4.5 h-4.5"/>
 Vigilancia
 {pathname.startsWith("/vigilance") && <span className="w-4 h-[1px] bg-primary mt-0.5"/>}
 </Link>

 <button
 onClick={() => setMenuOpen(true)}
 className={cn(
"flex flex-col items-center gap-0.5 px-3 py-1 text-[8px] font-mono font-medium tracking-wide uppercase transition-all",
 menuOpen ?"text-primary":"text-muted-foreground active:scale-95")}
 >
 <Menu className="w-4.5 h-4.5"/>
 Menú
 </button>
 </div>
 </nav>
 </>
 );
}
