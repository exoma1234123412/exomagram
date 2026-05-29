"use client";

import { useMemo } from "react";
import type { TimeEntry } from "@/lib/types/database";
import { EXPECTED_DAILY_HOURS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { format, eachDayOfInterval, subDays, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale";

export function ContributionGraph({ entries }: { entries: TimeEntry[] }) {
 const graph = useMemo(() => {
 const today = new Date();
 const start = subDays(today, 180); // ~6 months
 const days = eachDayOfInterval({ start, end: today });

 // Count entries per date
 const countByDate = new Map<string, number>();
 for (const e of entries) {
 countByDate.set(e.date, (countByDate.get(e.date) ?? 0) + 1);
 }

 // Build weeks (columns of 7 days)
 const weeks: { date: Date; dateStr: string; count: number }[][] = [];
 let currentWeek: { date: Date; dateStr: string; count: number }[] = [];

 // Pad first week
 const firstDow = getDay(days[0]);
 for (let i = 0; i < firstDow; i++) {
 currentWeek.push({ date: new Date(0), dateStr:"", count: -1 }); // placeholder
 }

 for (const day of days) {
 const dateStr = day.toISOString().split("T")[0];
 currentWeek.push({ date: day, dateStr, count: countByDate.get(dateStr) ?? 0 });
 if (currentWeek.length === 7) {
 weeks.push(currentWeek);
 currentWeek = [];
 }
 }
 if (currentWeek.length > 0) {
 weeks.push(currentWeek);
 }

 // Stats
 const totalDays = days.length;
 const activeDays = Array.from(countByDate.keys()).filter((d) => {
 const date = new Date(d +"T12:00:00");
 return date >= start && date <= today;
 }).length;
 const totalHours = Array.from(countByDate.entries())
 .filter(([d]) => {
 const date = new Date(d +"T12:00:00");
 return date >= start && date <= today;
 })
 .reduce((sum, [, count]) => sum + count, 0);

 // Longest streak in this period
 let maxStreak = 0;
 let currentStreak = 0;
 for (const day of days) {
 const dateStr = day.toISOString().split("T")[0];
 const dow = day.getDay();
 if (dow === 0 || dow === 6) continue; // skip weekends
 if ((countByDate.get(dateStr) ?? 0) > 0) {
 currentStreak++;
 maxStreak = Math.max(maxStreak, currentStreak);
 } else {
 currentStreak = 0;
 }
 }

 return { weeks, activeDays, totalDays, totalHours, maxStreak };
 }, [entries]);

 function getCellColor(count: number): string {
 if (count < 0) return"bg-transparent"; // placeholder
 if (count === 0) return"bg-muted/30 dark:bg-muted/10";
 if (count <= 2) return"bg-blue-200 dark:bg-blue-900/40";
 if (count <= 4) return"bg-blue-300 dark:bg-blue-800/50";
 if (count <= 6) return"bg-blue-400 dark:bg-blue-700/60";
 return"bg-blue-600 dark:bg-blue-500";
 }

 const dayLabels = ["","Lun","","Mie","","Vie",""];
 // Show month labels
 const monthLabels: { label: string; weekIdx: number }[] = [];
 let lastMonth = -1;
 graph.weeks.forEach((week, i) => {
 const validDay = week.find((d) => d.count >= 0);
 if (validDay) {
 const month = validDay.date.getMonth();
 if (month !== lastMonth) {
 monthLabels.push({
 label: format(validDay.date,"MMM", { locale: es }),
 weekIdx: i,
 });
 lastMonth = month;
 }
 }
 });

 return (
 <div className="space-y-3">
 {/* Month headers */}
 <div className="flex gap-[3px] ml-[28px]">
 {graph.weeks.map((_, i) => {
 const label = monthLabels.find((m) => m.weekIdx === i);
 return (
 <div key={i} className="w-[11px] shrink-0">
 {label && (
 <span className="text-[9px] text-muted-foreground absolute">
 {label.label}
 </span>
 )}
 </div>
 );
 })}
 </div>

 {/* Grid */}
 <div className="flex gap-[1px]">
 {/* Day labels */}
 <div className="flex flex-col gap-[3px] mr-1 w-[24px]">
 {dayLabels.map((label, i) => (
 <div key={i} className="h-[11px] flex items-center">
 <span className="text-[9px] text-muted-foreground">{label}</span>
 </div>
 ))}
 </div>

 {/* Weeks */}
 <div className="flex gap-[3px] overflow-x-auto">
 {graph.weeks.map((week, wi) => (
 <div key={wi} className="flex flex-col gap-[3px]">
 {week.map((day, di) => (
 <div
 key={di}
 className={cn(
"w-[11px] h-[11px] rounded-sm transition-colors",
 getCellColor(day.count)
 )}
 title={
 day.count >= 0
 ?`${day.dateStr}: ${day.count}h`: undefined
 }
 />
 ))}
 {/* Pad remaining days */}
 {Array.from({ length: 7 - week.length }).map((_, i) => (
 <div key={`pad-${i}`} className="w-[11px] h-[11px]"/>
 ))}
 </div>
 ))}
 </div>
 </div>

 {/* Legend */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
 <span>Menos</span>
 <div className="w-[11px] h-[11px] rounded-sm bg-muted/30"/>
 <div className="w-[11px] h-[11px] rounded-sm bg-blue-200 dark:bg-blue-900/40"/>
 <div className="w-[11px] h-[11px] rounded-sm bg-blue-300 dark:bg-blue-800/50"/>
 <div className="w-[11px] h-[11px] rounded-sm bg-blue-400 dark:bg-blue-700/60"/>
 <div className="w-[11px] h-[11px] rounded-sm bg-blue-600 dark:bg-blue-500"/>
 <span>Mas</span>
 </div>
 <div className="flex gap-3 text-[10px] text-muted-foreground">
 <span><span className="tabular-nums tracking-tight">{graph.totalHours}</span>h total</span>
 <span><span className="tabular-nums tracking-tight">{graph.activeDays}</span> dias activos</span>
 <span><span className="tabular-nums tracking-tight">{graph.maxStreak}</span>d mejor racha</span>
 </div>
 </div>
 </div>
 );
}
