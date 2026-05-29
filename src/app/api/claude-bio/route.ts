import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/claude-bio
// Generates brutally honest AI bios for each org member
// Stores in ai_work_profiles.profile_data.ai_bio

export async function POST(request: Request) {
  const serverClient = await createServerSupabase();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const { org_id } = body;

  if (!org_id) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  // Verify membership
  const { data: membership } = await serverClient
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", org_id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a esta organización" },
      { status: 403 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all org members with profiles
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, profiles(full_name, role)")
    .eq("org_id", org_id);

  if (!members || members.length === 0) {
    return NextResponse.json({ error: "No hay miembros" }, { status: 404 });
  }

  // Last 30 days of data per member
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  const { data: entries } = await supabase
    .from("time_entries")
    .select("user_id, category, title, is_late, proof_urls, date, hour")
    .eq("org_id", org_id)
    .gte("date", startDate);

  const { data: promises } = await supabase
    .from("daily_promises")
    .select("user_id, status")
    .eq("org_id", org_id)
    .gte("date", startDate);

  const { data: standups } = await supabase
    .from("standups")
    .select("user_id, date")
    .eq("org_id", org_id)
    .gte("date", startDate);

  const { data: closeouts } = await supabase
    .from("daily_closeouts")
    .select("user_id, date")
    .eq("org_id", org_id)
    .gte("date", startDate);

  const { data: shoutouts } = await supabase
    .from("shoutouts")
    .select("to_user_id, from_user_id, message")
    .eq("org_id", org_id)
    .gte("date", startDate);

  const bios: { user_id: string; name: string; bio: string }[] = [];

  for (const m of members) {
    const profile = m.profiles as unknown as {
      full_name: string;
      role: string;
    } | null;
    const name = profile?.full_name ?? "Sin nombre";
    const role = profile?.role ?? "";

    const userEntries = (entries ?? []).filter((e) => e.user_id === m.user_id);
    const userPromises = (promises ?? []).filter(
      (p) => p.user_id === m.user_id
    );
    const userStandups = (standups ?? []).filter(
      (s) => s.user_id === m.user_id
    );
    const userCloseouts = (closeouts ?? []).filter(
      (c) => c.user_id === m.user_id
    );
    const received = (shoutouts ?? []).filter(
      (s) => s.to_user_id === m.user_id
    );

    const totalHours = userEntries.length;
    const deepWork = userEntries.filter(
      (e) => e.category === "deep_work"
    ).length;
    const meetings = userEntries.filter(
      (e) => e.category === "meeting"
    ).length;
    const lateEntries = userEntries.filter((e) => e.is_late).length;
    const withProof = userEntries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    ).length;
    const promisesKept = userPromises.filter(
      (p) => p.status === "delivered"
    ).length;
    const promisesBroken = userPromises.filter(
      (p) => p.status === "broken"
    ).length;

    // Find most common work hours
    const hourCounts = new Map<number, number>();
    for (const e of userEntries) {
      hourCounts.set(e.hour, (hourCounts.get(e.hour) ?? 0) + 1);
    }
    const peakHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => h);

    const dataContext = `
Nombre: ${name}
Rol: ${role}
Últimos 30 días:
- Horas totales registradas: ${totalHours}
- Deep Work: ${deepWork}h (${totalHours > 0 ? Math.round((deepWork / totalHours) * 100) : 0}%)
- Reuniones: ${meetings}h (${totalHours > 0 ? Math.round((meetings / totalHours) * 100) : 0}%)
- Entradas tardías: ${lateEntries} (${totalHours > 0 ? Math.round((lateEntries / totalHours) * 100) : 0}%)
- Con evidencia: ${withProof} de ${totalHours} (${totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0}%)
- Promesas cumplidas: ${promisesKept}, rotas: ${promisesBroken}
- Standups: ${userStandups.length}
- Cierres diarios: ${userCloseouts.length}
- Shoutouts recibidos: ${received.length}
- Horas pico de trabajo: ${peakHours.length > 0 ? peakHours.map((h) => `${h}:00`).join(", ") : "N/A"}
`.trim();

    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-20250414",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `Eres un analista de equipos brutalmente honesto pero no cruel. Hablas en español mexicano informal.

Genera una bio de 1-2 oraciones para este miembro del equipo basándote en sus datos reales de los últimos 30 días. Sé directo, específico y usa humor mexicano sutil. No seas genérico. Menciona patrones reales que ves en los datos.

Ejemplo del tono: "EXOMAP: promete más de lo que cumple, pero cuando entra en flow state es imparable. Su kriptonita son las reuniones después de las 2pm."

Datos del miembro:
${dataContext}

Responde SOLO con la bio, sin comillas, sin prefijo del nombre. Empieza directo con la descripción.`,
          },
        ],
      });

      const bioText =
        response.content[0].type === "text"
          ? response.content[0].text.trim()
          : "";

      bios.push({ user_id: m.user_id, name, bio: bioText });

      // Upsert into ai_work_profiles
      const { data: existing } = await supabase
        .from("ai_work_profiles")
        .select("id, profile_data")
        .eq("user_id", m.user_id)
        .eq("org_id", org_id)
        .single();

      if (existing) {
        const updatedData = {
          ...(existing.profile_data as Record<string, unknown>),
          ai_bio: bioText,
          ai_bio_updated_at: new Date().toISOString(),
        };
        await supabase
          .from("ai_work_profiles")
          .update({ profile_data: updatedData, last_updated: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase.from("ai_work_profiles").insert({
          user_id: m.user_id,
          org_id: org_id,
          profile_data: {
            ai_bio: bioText,
            ai_bio_updated_at: new Date().toISOString(),
          },
          last_updated: new Date().toISOString(),
        });
      }
    } catch {
      bios.push({
        user_id: m.user_id,
        name,
        bio: "No se pudo generar la bio.",
      });
    }
  }

  return NextResponse.json({ success: true, bios });
}
