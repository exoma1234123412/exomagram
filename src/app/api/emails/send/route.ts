import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { NextResponse } from "next/server";

// POST /api/emails/send
// Universal email sender for all notification types.
// Body: { type, org_id, user_id?, date? }

type EmailType =
  | "morning_kick"
  | "midday_check"
  | "end_of_day"
  | "weekly_report"
  | "shame"
  | "manager_digest";

interface EmailRecipient {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
}

interface MemberDigest {
  user_id: string;
  full_name: string;
  hours_logged: number;
  hours_with_proof: number;
  grade: string | null;
  red_flags: string[];
  is_late_percent: number;
  has_closeout: boolean;
  has_standup: boolean;
}

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || "exomagram@exomapeptides.mx";

export async function POST(request: Request) {
  // Verify cron secret (emails are triggered by cron or admin, not end users)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const body = await request.json();
  const { type, org_id, user_id, date: rawDate } = body as {
    type: EmailType;
    org_id: string;
    user_id?: string;
    date?: string;
  };

  if (!type || !org_id) {
    return NextResponse.json({ error: "type and org_id are required" }, { status: 400 });
  }

  const date = rawDate ?? new Date().toISOString().split("T")[0];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resend = new Resend(process.env.RESEND_API_KEY);

  // ── Fetch org data ──────────────────────────────────────────────
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", org_id)
    .single();

  const orgName = org?.name ?? "Tu organización";

  // Fetch members with profiles
  const { data: rawMembers } = await supabase
    .from("org_members")
    .select("user_id, role, profiles(full_name, email)")
    .eq("org_id", org_id);

  const members: (EmailRecipient & { org_role: string })[] = (rawMembers ?? []).map((m) => {
    const p = m.profiles as unknown as { full_name: string; email: string } | null;
    return {
      user_id: m.user_id,
      email: p?.email ?? "",
      full_name: p?.full_name ?? "Sin nombre",
      role: m.role as string,
      org_role: m.role as string,
    };
  }).filter((m) => m.email);

  // Fetch time entries for the date
  const { data: entries } = await supabase
    .from("time_entries")
    .select("user_id, hour, title, category, is_late, proof_urls, minutes_late")
    .eq("org_id", org_id)
    .eq("date", date);

  // Fetch audit grades if available
  const { data: auditReviews } = await supabase
    .from("ai_reviews")
    .select("user_id, findings, summary")
    .eq("org_id", org_id)
    .eq("date", date)
    .eq("review_type", "daily_individual");

  // Fetch closeouts and standups
  const { data: closeouts } = await supabase
    .from("daily_closeouts")
    .select("user_id")
    .eq("org_id", org_id)
    .eq("date", date);

  const { data: standups } = await supabase
    .from("standups")
    .select("user_id")
    .eq("org_id", org_id)
    .eq("date", date);

  const closeoutSet = new Set((closeouts ?? []).map((c) => c.user_id));
  const standupSet = new Set((standups ?? []).map((s) => s.user_id));

  // Build per-member digest data
  const memberDigests: MemberDigest[] = members.map((m) => {
    const userEntries = (entries ?? []).filter((e) => e.user_id === m.user_id);
    const withProof = userEntries.filter(
      (e) => e.proof_urls && (e.proof_urls as string[]).length > 0
    );
    const lateEntries = userEntries.filter((e) => e.is_late);
    const audit = (auditReviews ?? []).find((r) => r.user_id === m.user_id);
    const grade = audit?.findings?.grade ?? null;
    const redFlags = audit?.findings?.red_flags ?? [];

    return {
      user_id: m.user_id,
      full_name: m.full_name,
      hours_logged: userEntries.length,
      hours_with_proof: withProof.length,
      grade,
      red_flags: redFlags as string[],
      is_late_percent:
        userEntries.length > 0
          ? Math.round((lateEntries.length / userEntries.length) * 100)
          : 0,
      has_closeout: closeoutSet.has(m.user_id),
      has_standup: standupSet.has(m.user_id),
    };
  });

  // ── Determine recipients ────────────────────────────────────────
  let recipients: typeof members = [];

  switch (type) {
    case "morning_kick":
      recipients = user_id ? members.filter((m) => m.user_id === user_id) : members;
      break;

    case "midday_check": {
      // Only people with fewer than 3 hours logged by 1pm
      const underperformers = memberDigests
        .filter((d) => d.hours_logged < 3)
        .map((d) => d.user_id);
      recipients = members.filter((m) => underperformers.includes(m.user_id));
      break;
    }

    case "end_of_day":
      recipients = user_id ? members.filter((m) => m.user_id === user_id) : members;
      break;

    case "weekly_report":
      recipients = user_id ? members.filter((m) => m.user_id === user_id) : members;
      break;

    case "shame": {
      // Only people with grade D or F
      const shameWorthy = memberDigests
        .filter((d) => d.grade === "D" || d.grade === "F")
        .map((d) => d.user_id);
      recipients = members.filter((m) => shameWorthy.includes(m.user_id));
      break;
    }

    case "manager_digest":
      recipients = members.filter(
        (m) => m.org_role === "owner" || m.org_role === "admin"
      );
      break;
  }

  if (recipients.length === 0) {
    return NextResponse.json({
      success: true,
      sent: 0,
      message: "No recipients matched criteria",
    });
  }

  // ── Build context for Claude ────────────────────────────────────
  const teamSummary = memberDigests
    .map(
      (d) =>
        `- ${d.full_name}: ${d.hours_logged}h registradas, ${d.hours_with_proof}h con evidencia, grade=${d.grade ?? "sin calificar"}, standup=${d.has_standup ? "si" : "no"}, cierre=${d.has_closeout ? "si" : "no"}, late%=${d.is_late_percent}%, red_flags=[${d.red_flags.join(", ")}]`
    )
    .join("\n");

  // ── Generate email content via Claude ───────────────────────────
  const promptMap: Record<EmailType, string> = {
    morning_kick: `Genera un email de "Morning Kick" para ${orgName}. Es las 8am.
El propósito es arrancar el día con energía y recordar que CADA HORA será vigilada.
Mencion que deben hacer su standup y registrar sus horas EN TIEMPO REAL, no al final del día.
Sé directo, agresivo, motivacional pero brutal. Recuerda: aquí no se tolera la mediocridad.
Si es lunes, sé extra intenso. Si es viernes, recuerda que el reporte semanal viene.

DESTINATARIOS: ${recipients.map((r) => r.full_name).join(", ")}
FECHA: ${date}
EQUIPO COMPLETO:
${teamSummary}`,

    midday_check: `Genera un email de "Midday Check" para personas con POCAS HORAS a la 1pm.
Estas personas tienen menos de 3 horas registradas a mitad del día. Eso es INACEPTABLE.
El tono es de alarma. De urgencia. De "te estamos viendo y no estás produciendo".
Sé específico con cada persona y sus horas.

DESTINATARIOS (underperformers): ${recipients.map((r) => {
      const d = memberDigests.find((md) => md.user_id === r.user_id);
      return `${r.full_name} (${d?.hours_logged ?? 0}h registradas)`;
    }).join(", ")}
FECHA: ${date}
EQUIPO COMPLETO:
${teamSummary}`,

    end_of_day: `Genera un email de "Fin del Día" para ${orgName}.
Resume el día de cada persona. Quién trabajó, quién se hizo pendejo.
Incluye las grades si están disponibles. Celebra a los A, destroza a los F.
Recuerda que deben hacer su cierre del día si no lo han hecho.

DESTINATARIOS: ${recipients.map((r) => r.full_name).join(", ")}
FECHA: ${date}
EQUIPO COMPLETO:
${teamSummary}`,

    weekly_report: `Genera un email de "Reporte Semanal" para ${orgName}.
Es viernes. Resume la semana completa. Quién fue consistente, quién falló.
Incluye tendencias. Quién mejoró, quién empeoró.
Da un premio simbólico al mejor de la semana y una mención de vergüenza al peor.

DESTINATARIOS: ${recipients.map((r) => r.full_name).join(", ")}
FECHA: ${date}
EQUIPO COMPLETO (datos de hoy como referencia):
${teamSummary}`,

    shame: `Genera un email de VERGÜENZA para personas que sacaron D o F hoy.
Este es el email más brutal. Sin piedad. Sin eufemismos.
Hazles saber que su desempeño es inaceptable, que el equipo depende de ellos,
y que si siguen así las consecuencias serán reales.
Sé específico: menciona QUÉ hicieron mal según los datos.

DESTINATARIOS (D/F): ${recipients.map((r) => {
      const d = memberDigests.find((md) => md.user_id === r.user_id);
      return `${r.full_name} (grade=${d?.grade}, ${d?.hours_logged}h, red_flags=[${d?.red_flags.join(", ")}])`;
    }).join(", ")}
FECHA: ${date}
EQUIPO COMPLETO:
${teamSummary}`,

    manager_digest: `Genera un email "Digest para Managers" de ${orgName}.
Este email va SOLO a owners/admins. Muestra el panorama completo del equipo.
Incluye: quién rindió, quién no, patrones sospechosos, recomendaciones de acción.
Sé analítico pero directo. Los managers necesitan DATOS y ACCIONES, no poesía.

DESTINATARIOS (managers): ${recipients.map((r) => `${r.full_name} (${r.org_role})`).join(", ")}
FECHA: ${date}
EQUIPO COMPLETO:
${teamSummary}`,
  };

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Eres el sistema de notificaciones de Exomagram, la app de transparencia laboral más brutal que existe.

TU PERSONALIDAD:
- Directo, sin filtros, sin eufemismos
- Mezcla de drill sergeant mexicano y CEO despiadado
- Usas español coloquial mexicano cuando es efectivo
- No tienes miedo de decir verdades incómodas
- Celebras la excelencia genuina, destruyes la mediocridad
- Cero tolerancia al bullshit

TAREA: ${promptMap[type]}

RESPONDE CON UN JSON con esta estructura exacta:
{
  "subject": "Asunto del email - corto, impactante, en español",
  "html": "HTML completo del email con inline styles. Diseño limpio, mobile-friendly. Usa colores: rojo para alertas, verde para logros, gris para info. Fondo blanco, texto oscuro. Max-width 600px centrado. Incluye el logo text 'EXOMAGRAM' en header con estilo bold."
}

REGLAS DEL HTML:
- Solo inline styles, nada de <style> tags
- Mobile-friendly: max-width: 600px, padding responsive
- Tipografía: font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- Header con fondo #111 y texto blanco "EXOMAGRAM"
- Secciones claras con bordes sutiles
- Emojis para visual impact
- Footer con "Enviado por Exomagram — Transparencia sin excusas"
- NO uses <img> tags
- El HTML debe ser completo y válido

Responde SOLO con el JSON válido. Sin markdown, sin backticks.`,
      },
    ],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  let parsed: { subject: string; html: string };
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    parsed = {
      subject: `[Exomagram] ${type} — ${date}`,
      html: buildFallbackHtml(type, date, orgName, memberDigests),
    };
  }

  if (!parsed) {
    parsed = {
      subject: `[Exomagram] ${type} — ${date}`,
      html: buildFallbackHtml(type, date, orgName, memberDigests),
    };
  }

  // ── Send via Resend ─────────────────────────────────────────────
  const results: { email: string; success: boolean; error?: string }[] = [];

  for (const recipient of recipients) {
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: recipient.email,
        subject: parsed.subject,
        html: parsed.html,
      });
      results.push({ email: recipient.email, success: true });
    } catch (err) {
      results.push({
        email: recipient.email,
        success: false,
        error: (err as Error).message,
      });
    }
  }

  const sentCount = results.filter((r) => r.success).length;

  return NextResponse.json({
    success: true,
    type,
    date,
    org_id,
    sent: sentCount,
    failed: results.length - sentCount,
    details: results,
  });
}

// ── Fallback HTML if Claude fails to generate ─────────────────────
function buildFallbackHtml(
  type: EmailType,
  date: string,
  orgName: string,
  digests: MemberDigest[]
): string {
  const typeLabels: Record<EmailType, string> = {
    morning_kick: "Morning Kick",
    midday_check: "Alerta de Mediodía",
    end_of_day: "Resumen del Día",
    weekly_report: "Reporte Semanal",
    shame: "Alerta de Bajo Rendimiento",
    manager_digest: "Digest para Managers",
  };

  const rows = digests
    .map(
      (d) =>
        `<tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${d.full_name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: center;">${d.hours_logged}h</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold; color: ${
            d.grade === "A" || d.grade === "B"
              ? "#16a34a"
              : d.grade === "D" || d.grade === "F"
              ? "#dc2626"
              : "#6b7280"
          };">${d.grade ?? "-"}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
    <div style="background: #111; padding: 24px; text-align: center;">
      <span style="color: #fff; font-size: 24px; font-weight: 800; letter-spacing: 2px;">EXOMAGRAM</span>
    </div>
    <div style="padding: 24px;">
      <h2 style="margin: 0 0 8px; color: #111; font-size: 20px;">${typeLabels[type]}</h2>
      <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px;">${orgName} — ${date}</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Persona</th>
            <th style="padding: 8px 12px; text-align: center; font-weight: 600;">Horas</th>
            <th style="padding: 8px 12px; text-align: center; font-weight: 600;">Grade</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af;">
      Enviado por Exomagram — Transparencia sin excusas
    </div>
  </div>
</body>
</html>`;
}
