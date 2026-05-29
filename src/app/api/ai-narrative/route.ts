import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";

// GET /api/ai-narrative?org_id=xxx&date=yyyy-mm-dd&user_id=xxx(optional)
// Generates a human-readable narrative of the day without needing an LLM
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];
  const userId = searchParams.get("user_id");

  if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let query = supabase
    .from("time_entries")
    .select("*, profiles(full_name, role)")
    .eq("org_id", orgId)
    .eq("date", date)
    .order("hour", { ascending: true });

  if (userId) query = query.eq("user_id", userId);

  const { data: entries } = await query;
  if (!entries || entries.length === 0) {
    return NextResponse.json({
      narrative: "No hubo actividad registrada este día.",
      highlights: [],
      concerns: [],
    });
  }

  // Group by user
  const byUser = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byUser.get(e.user_id) ?? [];
    list.push(e);
    byUser.set(e.user_id, list);
  }

  const narrativeParts: string[] = [];
  const highlights: string[] = [];
  const concerns: string[] = [];

  // Team overview
  const totalHours = entries.length;
  const uniqueMembers = byUser.size;
  const withProof = entries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
  const lateEntries = entries.filter((e) => e.is_late).length;

  narrativeParts.push(
    `## Resumen del día\n\nEl equipo registró **${totalHours} horas** entre **${uniqueMembers} miembros**. ` +
    `${withProof} entradas tienen evidencia (${Math.round((withProof / totalHours) * 100)}%). ` +
    (lateEntries > 0 ? `${lateEntries} fueron registradas tarde.` : "Todas fueron registradas a tiempo.")
  );

  // Category story
  const catCounts = new Map<WorkCategory, number>();
  for (const e of entries) catCounts.set(e.category as WorkCategory, (catCounts.get(e.category as WorkCategory) ?? 0) + 1);
  const sorted = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]);
  const topCat = sorted[0];

  if (topCat) {
    const catInfo = CATEGORIES[topCat[0]];
    const percent = Math.round((topCat[1] / totalHours) * 100);
    narrativeParts.push(
      `\n\nLa actividad dominante fue **${catInfo.emoji} ${catInfo.label}** (${percent}% del tiempo). ` +
      (sorted.length > 1
        ? `Le siguió **${CATEGORIES[sorted[1][0]].emoji} ${CATEGORIES[sorted[1][0]].label}** con ${Math.round((sorted[1][1] / totalHours) * 100)}%.`
        : "")
    );
  }

  // Per-person narratives
  narrativeParts.push("\n\n## Por persona\n");

  for (const [uid, userEntries] of byUser) {
    const profile = (userEntries[0] as Record<string, unknown>).profiles as Record<string, unknown> | null;
    const name = (profile?.full_name as string) ?? "Alguien";
    const hours = userEntries.length;
    const userCats = new Map<WorkCategory, number>();
    for (const e of userEntries) userCats.set(e.category as WorkCategory, (userCats.get(e.category as WorkCategory) ?? 0) + 1);
    const mainCat = Array.from(userCats.entries()).sort((a, b) => b[1] - a[1])[0];
    const proof = userEntries.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length;
    const late = userEntries.filter((e) => e.is_late).length;

    // Build narrative for this person
    let personNarrative = `**${name}** registró ${hours}h`;

    if (mainCat) {
      const catInfo = CATEGORIES[mainCat[0]];
      personNarrative += `, mayormente ${catInfo.emoji} ${catInfo.label.toLowerCase()}`;
    }

    personNarrative += ". ";

    // Morning person or night owl?
    const firstHour = Math.min(...userEntries.map((e) => e.hour));
    const lastHour = Math.max(...userEntries.map((e) => e.hour));
    if (firstHour <= 8) {
      personNarrative += "Empezó temprano. ";
    } else if (firstHour >= 11) {
      personNarrative += "Empezó tarde (después de las 11am). ";
    }

    // Deep work streak
    const deepWorkEntries = userEntries.filter((e) => e.category === "deep_work").sort((a, b) => a.hour - b.hour);
    let maxStreak = 0;
    let currentStreak = 1;
    for (let i = 1; i < deepWorkEntries.length; i++) {
      if (deepWorkEntries[i].hour === deepWorkEntries[i - 1].hour + 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    if (maxStreak >= 3) {
      personNarrative += `Tuvo un bloque de **${maxStreak}h de deep work** consecutivo — impresionante. `;
      highlights.push(`${name} tuvo ${maxStreak}h de deep work consecutivo`);
    }

    // Blocked?
    const blockedHours = userEntries.filter((e) => e.category === "blocked").length;
    if (blockedHours >= 2) {
      personNarrative += `Estuvo bloqueado ${blockedHours}h — hay que investigar. `;
      concerns.push(`${name} estuvo bloqueado ${blockedHours}h`);
    }

    // Meeting heavy?
    const meetingHours = userEntries.filter((e) => e.category === "meeting").length;
    if (meetingHours >= 4) {
      personNarrative += `Pasó ${meetingHours}h en reuniones. `;
      concerns.push(`${name} pasó ${meetingHours}h en reuniones`);
    }

    // Evidence
    if (proof === hours) {
      personNarrative += "100% evidencia ✅";
      highlights.push(`${name} — 100% evidencia`);
    } else if (proof === 0 && hours >= 3) {
      personNarrative += "Sin evidencia ⚠️";
      concerns.push(`${name} — 0% evidencia en ${hours}h`);
    }

    if (late === hours && hours >= 3) {
      concerns.push(`${name} — 100% entradas tardías`);
    }

    // Notable entries
    const notable = userEntries.filter((e) => e.title.length > 30).slice(0, 2);
    if (notable.length > 0) {
      personNarrative += "\n  - " + notable.map((e) => `"${e.title}"`).join("\n  - ");
    }

    narrativeParts.push(personNarrative + "\n");
  }

  // Highlights and concerns
  if (highlights.length > 0) {
    narrativeParts.push("\n## Destacados 🌟\n" + highlights.map((h) => `- ${h}`).join("\n"));
  }
  if (concerns.length > 0) {
    narrativeParts.push("\n## Atención ⚠️\n" + concerns.map((c) => `- ${c}`).join("\n"));
  }

  return NextResponse.json({
    narrative: narrativeParts.join(""),
    highlights,
    concerns,
    stats: {
      total_hours: totalHours,
      members: uniqueMembers,
      proof_percent: Math.round((withProof / totalHours) * 100),
      late_percent: Math.round((lateEntries / totalHours) * 100),
    },
  });
}
