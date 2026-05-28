import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";

// POST /api/slack/webhook
// Sends daily digest to a Slack webhook URL
// Body: { webhook_url, org_id, date? }
export async function POST(request: Request) {
  const body = await request.json();
  const { webhook_url, org_id, date: dateParam } = body;

  if (!webhook_url || !org_id) {
    return NextResponse.json({ error: "webhook_url and org_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const date = dateParam ?? new Date().toISOString().split("T")[0];

  // Get org name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", org_id)
    .single();

  // Get entries
  const { data: entries } = await supabase
    .from("time_entries")
    .select("*, profiles(full_name)")
    .eq("org_id", org_id)
    .eq("date", date);

  // Get closeouts
  const { data: closeouts } = await supabase
    .from("daily_closeouts")
    .select("user_id")
    .eq("org_id", org_id)
    .eq("date", date);

  // Get members
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, profiles(full_name)")
    .eq("org_id", org_id);

  const totalHours = entries?.length ?? 0;
  const withProof = entries?.filter((e) => e.proof_urls && (e.proof_urls as string[]).length > 0).length ?? 0;
  const proofPercent = totalHours > 0 ? Math.round((withProof / totalHours) * 100) : 0;
  const lateEntries = entries?.filter((e) => e.is_late).length ?? 0;
  const closeoutUserIds = new Set(closeouts?.map((c) => c.user_id) ?? []);
  const totalMembers = members?.length ?? 0;
  const activeMembers = new Set(entries?.map((e) => e.user_id) ?? []).size;

  // Category breakdown
  const catCounts = new Map<string, number>();
  for (const e of entries ?? []) catCounts.set(e.category, (catCounts.get(e.category) ?? 0) + 1);
  const topCats = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Members without entries
  const activeMemberIds = new Set(entries?.map((e) => e.user_id) ?? []);
  const inactiveMembers = (members ?? [])
    .filter((m) => !activeMemberIds.has(m.user_id))
    .map((m) => (m.profiles as unknown as { full_name: string })?.full_name ?? "?");

  // Members without closeout
  const noCloseout = (members ?? [])
    .filter((m) => activeMemberIds.has(m.user_id) && !closeoutUserIds.has(m.user_id))
    .map((m) => (m.profiles as unknown as { full_name: string })?.full_name ?? "?");

  // Build Slack blocks
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📊 Exomagram — ${(org as { name: string })?.name ?? "Equipo"} — ${date}`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Horas registradas:* ${totalHours}` },
        { type: "mrkdwn", text: `*Miembros activos:* ${activeMembers}/${totalMembers}` },
        { type: "mrkdwn", text: `*Con evidencia:* ${proofPercent}%` },
        { type: "mrkdwn", text: `*Entradas tardías:* ${lateEntries}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Top categorías:* ${topCats.map(([cat, count]) => {
          const info = CATEGORIES[cat as WorkCategory];
          return `${info?.emoji ?? "📌"} ${info?.label ?? cat} (${count}h)`;
        }).join(" · ")}`,
      },
    },
  ];

  // Warnings
  const warnings: string[] = [];
  if (inactiveMembers.length > 0) {
    warnings.push(`⚠️ *Sin horas:* ${inactiveMembers.join(", ")}`);
  }
  if (noCloseout.length > 0) {
    warnings.push(`📝 *Sin cierre del día:* ${noCloseout.join(", ")}`);
  }
  if (proofPercent < 50) {
    warnings.push(`🔴 Solo ${proofPercent}% de entradas tienen evidencia`);
  }

  if (warnings.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: warnings.join("\n") },
    });
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "_Powered by Exomagram — Transparencia total del trabajo_" },
  });

  // Send to Slack
  const slackRes = await fetch(webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });

  if (!slackRes.ok) {
    return NextResponse.json(
      { error: "Slack webhook failed", status: slackRes.status },
      { status: 500 }
    );
  }

  return NextResponse.json({ sent: true, date, hours: totalHours });
}
