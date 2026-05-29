"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, X } from "lucide-react";
import { useAudio } from "@/components/audio/audio-provider";

const REEL_SYMBOLS = ["--","--","--","--","--","--","--","--"];

const REWARDS = [
 { match:"------", label:"¡RACHA DE FUEGO!", description:"+1 día protegido de racha", rarity:"legendary"},
 { match:"------", label:"¡TRIPLE ESTRELLA!", description:"+3 Trust Score bonus", rarity:"legendary"},
 { match:"------", label:"¡DIAMANTE!", description:"Logro secreto desbloqueado", rarity:"legendary"},
 { match:"------", label:"¡ESCUDO TOTAL!", description:"Inmunidad a penalización hoy", rarity:"epic"},
 { match:"partial", label:"¡Casi!", description:"Un símbolo más y era jackpot...", rarity:"near-miss"},
] as const;

type RewardRarity ="legendary"|"epic"|"near-miss"|"none";

interface SlotRewardProps {
 show: boolean;
 onClose: () => void;
}

function getRandomSymbol() {
 return REEL_SYMBOLS[Math.floor(Math.random() * REEL_SYMBOLS.length)];
}

function generateResult(): { symbols: string[]; rarity: RewardRarity; reward: typeof REWARDS[number] | null } {
 const roll = Math.random();

 // 5% jackpot (3 matching)
 if (roll < 0.05) {
 const sym = REEL_SYMBOLS[Math.floor(Math.random() * 4)]; // only first 4 can jackpot
 const symbols = [sym, sym, sym];
 const reward = REWARDS.find((r) => r.match === symbols.join("")) ?? REWARDS[0];
 return { symbols, rarity:"legendary", reward };
 }

 // 15% near-miss (2 matching)
 if (roll < 0.20) {
 const sym = REEL_SYMBOLS[Math.floor(Math.random() * 4)];
 let third = sym;
 while (third === sym) third = getRandomSymbol();
 // Put the odd one in a random position
 const pos = Math.floor(Math.random() * 3);
 const symbols = [sym, sym, sym];
 symbols[pos] = third;
 return { symbols, rarity:"near-miss", reward: REWARDS.find((r) => r.rarity ==="near-miss")! };
 }

 // 80% nothing — all different
 const symbols: string[] = [];
 while (symbols.length < 3) {
 const s = getRandomSymbol();
 if (!symbols.includes(s)) symbols.push(s);
 }
 return { symbols, rarity:"none", reward: null };
}

export function SlotReward({ show, onClose }: SlotRewardProps) {
 const [phase, setPhase] = useState<"spinning"|"result"|"closed">("closed");
 const [reels, setReels] = useState<string[]>(["--","--","--"]);
 const [settled, setSettled] = useState([false, false, false]);
 const [result, setResult] = useState<ReturnType<typeof generateResult> | null>(null);
 const [confettiPieces, setConfettiPieces] = useState<{ id: number; x: number; y: number; color: string; delay: number }[]>([]);
 const { play } = useAudio();
 const tickPlayedRef = useRef([false, false, false]);

 const startSpin = useCallback(() => {
 const res = generateResult();
 setResult(res);
 setPhase("spinning");
 setSettled([false, false, false]);
 tickPlayedRef.current = [false, false, false];

 // Simulate rapid symbol changes
 let tick = 0;
 const spinInterval = setInterval(() => {
 tick++;
 setReels([
 tick < 15 ? getRandomSymbol() : res.symbols[0],
 tick < 22 ? getRandomSymbol() : res.symbols[1],
 tick < 30 ? getRandomSymbol() : res.symbols[2],
 ]);

 // Play tick sound when each reel settles
 if (tick >= 15 && !tickPlayedRef.current[0]) { tickPlayedRef.current[0] = true; play("tick"); }
 if (tick >= 22 && !tickPlayedRef.current[1]) { tickPlayedRef.current[1] = true; play("tick"); }

 if (tick >= 15 && !settled[0]) setSettled((p) => [true, p[1], p[2]]);
 if (tick >= 22 && !settled[1]) setSettled((p) => [p[0], true, p[2]]);

 if (tick >= 30) {
 clearInterval(spinInterval);
 setSettled([true, true, true]);
 setPhase("result");
 // Final reel tick
 if (!tickPlayedRef.current[2]) { tickPlayedRef.current[2] = true; play("tick"); }

 // Confetti + reward sound for jackpot
 if (res.rarity ==="legendary"|| res.rarity ==="epic") {
 play("reward");
 const colors = ["#f59e0b","#3b82f6","#ef4444","#10b981","#8b5cf6","#f97316"];
 const pieces = Array.from({ length: 30 }, (_, i) => ({
 id: i,
 x: (Math.random() - 0.5) * 200,
 y: -(Math.random() * 120 + 30),
 color: colors[Math.floor(Math.random() * colors.length)],
 delay: Math.random() * 0.3,
 }));
 setConfettiPieces(pieces);
 }
 }
 }, 50);

 return () => clearInterval(spinInterval);
 }, [play]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (show && phase ==="closed") {
 startSpin();
 }
 }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

 function handleClose() {
 setPhase("closed");
 setConfettiPieces([]);
 onClose();
 }

 if (!show && phase ==="closed") return null;

 const isJackpot = result?.rarity ==="legendary"|| result?.rarity ==="epic";
 const isNearMiss = result?.rarity ==="near-miss";

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
 <div className={cn(
"relative bg-card border shadow-2xl p-6 max-w-sm w-full mx-4",
"transition-all duration-300",
 isJackpot && phase ==="result"&&"animate-jackpot-glow",
 isNearMiss && phase ==="result"&&"animate-danger-shake")}>
 {/* Close button */}
 {phase ==="result"&& (
 <button
 onClick={handleClose}
 className="absolute top-3 right-3 w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors">
 <X className="w-3 h-3"/>
 </button>
 )}

 {/* Confetti */}
 {confettiPieces.map((piece) => (
 <div
 key={piece.id}
 className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full pointer-events-none"style={{
 backgroundColor: piece.color,
 ["--x"as string]:`${piece.x}px`,
 ["--y"as string]:`${piece.y}px`,
 animation:`confetti-spread 1.5s ${piece.delay}s ease-out forwards`,
 }}
 />
 ))}

 {/* Header */}
 <div className="text-center mb-4">
 <div className="flex items-center justify-center gap-2 mb-1">
 <Sparkles className={cn(
"w-5 h-5",
 phase ==="spinning"?"text-yellow-500 animate-spin":"text-primary")} />
 <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
 {phase ==="spinning"?"Girando...":"Bonus"}
 </span>
 </div>
 <p className="text-xs text-muted-foreground">
 Registraste una hora — gira por un bonus
 </p>
 </div>

 {/* Slot reels */}
 <div className="flex items-center justify-center gap-3 mb-6">
 {reels.map((symbol, i) => (
 <div
 key={i}
 className={cn(
"w-20 h-20 border-2 flex items-center justify-center text-4xl",
"transition-all duration-200",
 settled[i]
 ?"border-primary/30 bg-primary/5 animate-slot-settle":"border-muted bg-muted/20",
 isJackpot && phase ==="result"&& settled[i] &&"border-amber-500/50 bg-amber-500/10",
 isNearMiss && phase ==="result"&& settled[i] && reels.filter((s) => s === symbol).length < 2 &&"border-red-500/30 bg-red-500/5")}
 >
 <span className={cn(
 !settled[i] &&"blur-[1px]",
 isJackpot && phase ==="result"&&"animate-streak-fire")}>
 {symbol}
 </span>
 </div>
 ))}
 </div>

 {/* Result message */}
 {phase ==="result"&& result && (
 <div className={cn(
"text-center animate-number-roll",
 isJackpot &&"mb-2")}>
 {isJackpot && (
 <>
 <p className="text-lg font-black text-amber-500 mb-1">
 {result.reward?.label}
 </p>
 <p className="text-sm text-muted-foreground">
 {result.reward?.description}
 </p>
 </>
 )}
 {isNearMiss && (
 <>
 <p className="text-base font-bold text-orange-500 mb-1">
 ¡Casi lo logras! 😩
 </p>
 <p className="text-xs text-muted-foreground">
 Un símbolo más y era jackpot... Registra otra hora para volver a girar.
 </p>
 </>
 )}
 {result.rarity ==="none"&& (
 <>
 <p className="text-sm font-semibold text-muted-foreground mb-1">
 No esta vez...
 </p>
 <p className="text-xs text-muted-foreground">
 Cada hora registrada es otra oportunidad de girar.
 </p>
 </>
 )}
 </div>
 )}

 {/* CTA */}
 {phase ==="result"&& (
 <button
 onClick={handleClose}
 className={cn(
"w-full mt-4 py-2.5 font-semibold text-sm transition-all",
 isJackpot
 ?"bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/25 hover:shadow-amber-500/40":"bg-primary/10 text-primary hover:bg-primary/20")}
 >
 {isJackpot ?"¡Reclamar premio!": isNearMiss ?"Registrar otra hora →":"Continuar"}
 </button>
 )}
 </div>
 </div>
 );
}
