"use client";

import { CATEGORIES, WORK_HOURS } from "@/lib/constants";
import type { TimeEntry, WorkCategory } from "@/lib/types/database";
import { cn } from "@/lib/utils";

// Visual fingerprint of a person's work patterns
// Like a DNA strand — unique to each person
export function WorkDNA({ entries }: { entries: TimeEntry[] }) {
 if (entries.length === 0) {
 return (
 <p className="text-sm text-muted-foreground text-center py-4">
 No hay datos suficientes para generar tu Work DNA.
 </p>
 );
 }

 // Build hour x day-of-week matrix
 const matrix: Map<string, number> = new Map(); //"hour-dow"-> count
 const catMatrix: Map<string, WorkCategory> = new Map(); //"hour-dow"-> dominant category

 for (const e of entries) {
 const dow = new Date(e.date +"T12:00:00").getDay(); // 0=Sun
 const key =`${e.hour}-${dow}`;
 matrix.set(key, (matrix.get(key) ?? 0) + 1);

 // Track dominant category per slot
 const catKey =`${key}-${e.category}`;
 const existing = catMatrix.get(key);
 if (!existing) catMatrix.set(key, e.category);
 }

 const maxCount = Math.max(...Array.from(matrix.values()), 1);
 const days = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

 const CATEGORY_HUE: Record<string, string> = {
 deep_work:"bg-blue-",
 meeting:"bg-blue-",
 review:"bg-amber-",
 admin:"bg-slate-",
 planning:"bg-emerald-",
 learning:"bg-pink-",
 break:"bg-green-",
 blocked:"bg-red-",
 };

 function getCellColor(hour: number, dow: number): string {
 const key =`${hour}-${dow}`;
 const count = matrix.get(key) ?? 0;
 if (count === 0) return"bg-muted/20";

 const intensity = count / maxCount;
 const cat = catMatrix.get(key);
 const base = cat ? CATEGORY_HUE[cat] ??"bg-blue-":"bg-blue-";

 if (intensity < 0.25) return base +"200 dark:"+ base.replace("bg-","bg-") +"900/30";
 if (intensity < 0.5) return base +"300 dark:"+ base.replace("bg-","bg-") +"800/40";
 if (intensity < 0.75) return base +"400 dark:"+ base.replace("bg-","bg-") +"700/50";
 return base +"500 dark:"+ base.replace("bg-","bg-") +"600";
 }

 // Rhythm score: how consistent is this person?
 const hourCounts = new Map<number, number>();
 for (const e of entries) hourCounts.set(e.hour, (hourCounts.get(e.hour) ?? 0) + 1);
 const totalEntries = entries.length;
 const entropy = Array.from(hourCounts.values()).reduce((sum, count) => {
 const p = count / totalEntries;
 return sum - p * Math.log2(p);
 }, 0);
 const maxEntropy = Math.log2(WORK_HOURS.length);
 const rhythmScore = Math.round((1 - entropy / maxEntropy) * 100);

 // Peak hour
 let peakHour = 9;
 let peakCount = 0;
 for (const [h, c] of hourCounts) {
 if (c > peakCount) { peakHour = h; peakCount = c; }
 }

 // Morning vs afternoon
 const morningEntries = entries.filter((e) => e.hour < 12).length;
 const afternoonEntries = entries.filter((e) => e.hour >= 12).length;
 const chronotype = morningEntries > afternoonEntries * 1.3 ?"Madrugador AM": afternoonEntries > morningEntries * 1.3 ?"Nocturno PM":"Equilibrado --";

 // Deep work ratio
 const deepWork = entries.filter((e) => e.category ==="deep_work").length;
 const deepWorkRatio = Math.round((deepWork / totalEntries) * 100);

 return (
 <div className="space-y-4">
 {/* DNA Grid */}
 <div className="overflow-x-auto">
 <div className="min-w-[400px]">
 {/* Day headers */}
 <div className="grid gap-1"style={{ gridTemplateColumns:`50px repeat(7, 1fr)`}}>
 <div />
 {days.map((d) => (
 <div key={d} className="text-[10px] text-muted-foreground text-center font-medium">
 {d}
 </div>
 ))}
 </div>

 {/* Hour rows */}
 {WORK_HOURS.map((hour) => (
 <div key={hour} className="grid gap-1 mb-0.5"style={{ gridTemplateColumns:`50px repeat(7, 1fr)`}}>
 <div className="text-[10px] text-muted-foreground text-right pr-2 flex items-center justify-end font-mono">
 {hour > 12 ? hour - 12 : hour}{hour >= 12 ?"p":"a"}
 </div>
 {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
 const key =`${hour}-${dow}`;
 const count = matrix.get(key) ?? 0;
 return (
 <div
 key={dow}
 className={cn(
"h-5 rounded-sm transition-all",
 getCellColor(hour, dow)
 )}
 title={count > 0 ?`${days[dow]} ${hour}:00 — ${count} entradas`: undefined}
 />
 );
 })}
 </div>
 ))}
 </div>
 </div>

 {/* DNA Insights */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <div className="bg-accent/40 p-3 text-center">
 <p className="text-lg font-bold">{chronotype}</p>
 <p className="text-[10px] text-muted-foreground">Cronotipo</p>
 </div>
 <div className="bg-accent/40 p-3 text-center">
 <p className="text-lg font-bold tabular-nums tracking-tight">{rhythmScore}%</p>
 <p className="text-[10px] text-muted-foreground">Consistencia</p>
 </div>
 <div className="bg-accent/40 p-3 text-center">
 <p className="text-lg font-bold tabular-nums tracking-tight">{peakHour > 12 ? peakHour - 12 : peakHour}{peakHour >= 12 ?"PM":"AM"}</p>
 <p className="text-[10px] text-muted-foreground">Hora pico</p>
 </div>
 <div className="bg-accent/40 p-3 text-center">
 <p className="text-lg font-bold tabular-nums tracking-tight">{deepWorkRatio}%</p>
 <p className="text-[10px] text-muted-foreground">Deep work</p>
 </div>
 </div>
 </div>
 );
}
