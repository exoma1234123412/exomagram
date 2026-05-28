"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { subDays } from "date-fns";
import { Calculator, Users, Clock, AlertTriangle } from "lucide-react";

interface MeetingTaxData {
  meetingHours: number;
  totalHours: number;
  meetingPercent: number;
  avgParticipantsPerHour: number;
  meetingPersonHours: number;
  equivalentFullDays: number;
  deepWorkHours: number;
  deepWorkPercent: number;
  peakMeetingHour: number;
  peakMeetingCount: number;
}

export function MeetingTax({ orgId, days = 7 }: { orgId: string; days?: number }) {
  const [data, setData] = useState<MeetingTaxData | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const startDate = subDays(new Date(), days).toISOString().split("T")[0];

      const { data: entries } = await supabase
        .from("time_entries")
        .select("category, hour, date, user_id")
        .eq("org_id", orgId)
        .gte("date", startDate);

      if (!entries || entries.length === 0) return;

      const meetingEntries = entries.filter((e) => e.category === "meeting");
      const deepWorkEntries = entries.filter((e) => e.category === "deep_work");

      // Count participants per meeting hour (same date+hour = same meeting slot)
      const meetingSlots = new Map<string, Set<string>>();
      for (const e of meetingEntries) {
        const key = `${e.date}-${e.hour}`;
        const slot = meetingSlots.get(key) ?? new Set();
        slot.add(e.user_id);
        meetingSlots.set(key, slot);
      }

      let totalParticipants = 0;
      for (const participants of meetingSlots.values()) {
        totalParticipants += participants.size;
      }
      const avgParticipants = meetingSlots.size > 0 ? Math.round((totalParticipants / meetingSlots.size) * 10) / 10 : 0;

      // Meeting person-hours = sum of all individual meeting hours
      const meetingPersonHours = meetingEntries.length;
      const equivalentFullDays = Math.round((meetingPersonHours / 8) * 10) / 10;

      // Peak meeting hour
      const meetingByHour = new Map<number, number>();
      for (const e of meetingEntries) {
        meetingByHour.set(e.hour, (meetingByHour.get(e.hour) ?? 0) + 1);
      }
      let peakHour = 10;
      let peakCount = 0;
      for (const [h, c] of meetingByHour) {
        if (c > peakCount) { peakHour = h; peakCount = c; }
      }

      // Unique meeting hours (deduplicated by user)
      const uniqueMeetingHours = new Set(meetingEntries.map((e) => `${e.user_id}-${e.date}-${e.hour}`)).size;

      setData({
        meetingHours: meetingEntries.length,
        totalHours: entries.length,
        meetingPercent: Math.round((meetingEntries.length / entries.length) * 100),
        avgParticipantsPerHour: avgParticipants,
        meetingPersonHours,
        equivalentFullDays,
        deepWorkHours: deepWorkEntries.length,
        deepWorkPercent: Math.round((deepWorkEntries.length / entries.length) * 100),
        peakMeetingHour: peakHour,
        peakMeetingCount: peakCount,
      });
    }
    load();
  }, [orgId, days]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;

  const isTaxHigh = data.meetingPercent > 30;

  return (
    <Card className={cn(isTaxHigh && "border-red-200 dark:border-red-800")}>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Calculator className="w-4 h-4 text-blue-500" />
          Meeting Tax
          {isTaxHigh && (
            <span className="inline-flex items-center gap-1 text-[10px] text-red-600">
              <AlertTriangle className="w-3 h-3" />
              Alto
            </span>
          )}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <p className={cn("text-xl font-bold", isTaxHigh ? "text-red-600" : "text-foreground")}>
              {data.meetingPersonHours}h
            </p>
            <p className="text-[10px] text-muted-foreground">
              <Users className="w-3 h-3 inline" /> persona-hora
            </p>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <p className={cn("text-xl font-bold", data.equivalentFullDays > 5 ? "text-red-600" : "text-foreground")}>
              {data.equivalentFullDays}
            </p>
            <p className="text-[10px] text-muted-foreground">dias completos equivalentes</p>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <p className="text-xl font-bold">{data.meetingPercent}%</p>
            <p className="text-[10px] text-muted-foreground">del tiempo total</p>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <p className="text-xl font-bold">{data.avgParticipantsPerHour}</p>
            <p className="text-[10px] text-muted-foreground">personas/reunion prom.</p>
          </div>
        </div>

        {/* Meeting vs Deep Work bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Reuniones {data.meetingPercent}%</span>
            <span>Deep Work {data.deepWorkPercent}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden flex">
            <div className="bg-blue-500 h-full" style={{ width: `${data.meetingPercent}%` }} />
            <div className="bg-violet-500 h-full" style={{ width: `${data.deepWorkPercent}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Hora pico de reuniones: {data.peakMeetingHour > 12 ? data.peakMeetingHour - 12 : data.peakMeetingHour}{data.peakMeetingHour >= 12 ? "PM" : "AM"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
