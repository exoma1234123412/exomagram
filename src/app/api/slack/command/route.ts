import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Valid work categories (used for validation)
// ---------------------------------------------------------------------------
const VALID_CATEGORIES: WorkCategory[] = [
  "deep_work",
  "meeting",
  "review",
  "admin",
  "planning",
  "learning",
  "break",
  "blocked",
];

// ---------------------------------------------------------------------------
// Helper: build a Supabase client with the service-role key so we can act on
// behalf of any user without a browser session / cookie.
// ---------------------------------------------------------------------------
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ---------------------------------------------------------------------------
// Helper: Slack ephemeral response (only the invoking user sees it)
// ---------------------------------------------------------------------------
function slackEphemeral(text: string) {
  return NextResponse.json({
    response_type: "ephemeral" as const,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Helper: Slack response visible to the whole channel
// ---------------------------------------------------------------------------
function slackInChannel(text: string) {
  return NextResponse.json({
    response_type: "in_channel" as const,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Helper: parse the "Xh" duration token into a whole-number of hours.
// Examples: "2h" -> 2, "1.5h" -> 2, "0.5h" -> 1, "3H" -> 3
// ---------------------------------------------------------------------------
function parseHours(raw: string): number | null {
  const match = raw.match(/^(\d+(?:\.\d+)?)h$/i);
  if (!match) return null;
  const parsed = parseFloat(match[1]);
  if (isNaN(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

// ---------------------------------------------------------------------------
// Helper: resolve Slack user_name to a profile row.
// We try matching by the Slack `user_name` against the profile's `full_name`
// or `email` (prefix before @). This is a best-effort lookup — orgs should
// ensure Slack display names align with Exomagram profile names / emails.
// ---------------------------------------------------------------------------
async function resolveProfile(
  supabase: ReturnType<typeof getSupabase>,
  slackUserName: string,
  orgId: string,
) {
  // 1. Try matching email prefix (most reliable)
  const { data: byEmail } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .ilike("email", `${slackUserName}@%`)
    .limit(1)
    .maybeSingle();

  if (byEmail) {
    // Verify membership
    const { data: member } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("user_id", byEmail.id)
      .eq("org_id", orgId)
      .limit(1)
      .maybeSingle();
    if (member) return byEmail;
  }

  // 2. Fallback: try matching full_name (case-insensitive)
  const { data: byName } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .ilike("full_name", `%${slackUserName}%`)
    .limit(5);

  if (byName && byName.length > 0) {
    for (const p of byName) {
      const { data: member } = await supabase
        .from("org_members")
        .select("user_id")
        .eq("user_id", p.id)
        .eq("org_id", orgId)
        .limit(1)
        .maybeSingle();
      if (member) return p;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helper: get the first org the user belongs to (used when we can't infer org
// from Slack context). Returns the org_id or null.
// ---------------------------------------------------------------------------
async function getFirstOrgId(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.org_id ?? null;
}

// ---------------------------------------------------------------------------
// Sub-command: /exomagram log 2h deep_work "Implementé sistema de auth"
// ---------------------------------------------------------------------------
async function handleLog(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  orgId: string,
  args: string[],
) {
  // args: ["2h", "deep_work", ...rest is the title]
  if (args.length < 3) {
    return slackEphemeral(
      ":warning: *Formato incorrecto.*\nUso: `/exomagram log 2h deep_work \"Descripcion de lo que hiciste\"`\n\n" +
        `*Categorias validas:* ${VALID_CATEGORIES.join(", ")}`,
    );
  }

  const hoursRaw = args[0];
  const categoryRaw = args[1];
  const title = args.slice(2).join(" ").replace(/^["']|["']$/g, "");

  // Validate hours
  const hours = parseHours(hoursRaw);
  if (hours === null) {
    return slackEphemeral(
      `:warning: No pude interpretar las horas: *${hoursRaw}*.\nUsa formato como \`2h\` o \`1.5h\`.`,
    );
  }

  // Validate category
  const category = categoryRaw.toLowerCase() as WorkCategory;
  if (!VALID_CATEGORIES.includes(category)) {
    return slackEphemeral(
      `:warning: Categoria invalida: *${categoryRaw}*.\n*Categorias validas:* ${VALID_CATEGORIES.join(", ")}`,
    );
  }

  // Validate title length
  if (title.length < 10) {
    return slackEphemeral(
      ":warning: El titulo debe tener al menos 10 caracteres. Se mas especifico.",
    );
  }

  // Current date and hour in Monterrey timezone
  const now = new Date();
  const mtyDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
  }).format(now);
  const mtyHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Monterrey",
    }).format(now),
    10,
  );

  // Determine if entry is late (logged after work hours 7-18)
  const isLate = mtyHour >= 19 || mtyHour < 7;

  // Insert one entry per hour logged
  const entries: Record<string, unknown>[] = [];
  for (let i = 0; i < hours; i++) {
    const entryHour = Math.max(7, Math.min(18, mtyHour - hours + 1 + i));
    entries.push({
      user_id: userId,
      org_id: orgId,
      date: mtyDate,
      hour: entryHour,
      category,
      title,
      description: null,
      mood: null,
      energy: null,
      links: null,
      auto_captured: false,
      verification_status: "unverified" as const,
      proof_urls: null,
      is_late: isLate,
      minutes_late: isLate ? Math.max(0, (mtyHour - 18) * 60) : 0,
      logged_at: now.toISOString(),
      verification_note: null,
      verified_by: null,
      project: null,
    });
  }

  const { error } = await supabase.from("time_entries").insert(entries);
  if (error) {
    return slackEphemeral(
      `:x: Error al registrar: ${error.message}`,
    );
  }

  const catInfo = CATEGORIES[category];
  return slackEphemeral(
    `${catInfo.emoji} *Registrado!*\n` +
      `*${hours}h* de ${catInfo.label} — _"${title}"_\n` +
      `Fecha: ${mtyDate} | ${isLate ? ":warning: Entrada tardia" : ":white_check_mark: A tiempo"}`,
  );
}

// ---------------------------------------------------------------------------
// Sub-command: /exomagram status
// ---------------------------------------------------------------------------
async function handleStatus(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  orgId: string,
  fullName: string,
) {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
  }).format(now);

  // Fetch today's entries
  const { data: entries } = await supabase
    .from("time_entries")
    .select("id, category, title, hour")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("date", today);

  const totalHours = entries?.length ?? 0;

  // Fetch trust score (latest)
  const { data: trustRow } = await supabase
    .from("trust_score_history")
    .select("score")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const trustScore = trustRow?.score ?? "N/A";

  // Fetch streak
  const { data: streak } = await supabase
    .from("activity_streaks")
    .select("current_streak, longest_streak")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();

  const currentStreak = streak?.current_streak ?? 0;
  const longestStreak = streak?.longest_streak ?? 0;

  // Build category breakdown
  const catCounts = new Map<string, number>();
  for (const e of entries ?? []) {
    catCounts.set(e.category, (catCounts.get(e.category) ?? 0) + 1);
  }
  const breakdown = Array.from(catCounts.entries())
    .map(([cat, count]) => {
      const info = CATEGORIES[cat as WorkCategory];
      return `${info?.emoji ?? "-"} ${info?.label ?? cat}: ${count}h`;
    })
    .join("\n");

  const lines = [
    `:bust_in_silhouette: *${fullName}* — ${today}`,
    `*Horas hoy:* ${totalHours} / 8`,
    `*Trust score:* ${trustScore}`,
    `:fire: *Racha:* ${currentStreak} dias (record: ${longestStreak})`,
  ];

  if (breakdown) {
    lines.push("", "*Desglose:*", breakdown);
  } else {
    lines.push("", "_Sin horas registradas hoy._");
  }

  return slackEphemeral(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Sub-command: /exomagram team
// ---------------------------------------------------------------------------
async function handleTeam(
  supabase: ReturnType<typeof getSupabase>,
  orgId: string,
) {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
  }).format(now);

  // Get all members with profiles
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, profiles(full_name)")
    .eq("org_id", orgId);

  if (!members || members.length === 0) {
    return slackEphemeral(":busts_in_silhouette: No se encontraron miembros.");
  }

  // Get today's entries grouped by user
  const { data: entries } = await supabase
    .from("time_entries")
    .select("user_id, category")
    .eq("org_id", orgId)
    .eq("date", today);

  const hoursByUser = new Map<string, number>();
  const catByUser = new Map<string, string>();
  for (const e of entries ?? []) {
    hoursByUser.set(e.user_id, (hoursByUser.get(e.user_id) ?? 0) + 1);
    catByUser.set(e.user_id, e.category); // last category logged
  }

  // Get live statuses
  const { data: statuses } = await supabase
    .from("live_status")
    .select("user_id, status, current_task")
    .eq("org_id", orgId);

  const statusMap = new Map<string, { status: string; task: string | null }>();
  for (const s of statuses ?? []) {
    statusMap.set(s.user_id, { status: s.status, task: s.current_task });
  }

  const statusEmojis: Record<string, string> = {
    online: ":large_green_circle:",
    idle: ":yellow_circle:",
    in_meeting: ":blue_circle:",
    deep_work: ":purple_circle:",
    break: ":green_apple:",
    offline: ":white_circle:",
  };

  const lines: string[] = [`:busts_in_silhouette: *Equipo — ${today}*\n`];

  for (const m of members) {
    const name =
      (m.profiles as unknown as { full_name: string })?.full_name ?? "?";
    const hours = hoursByUser.get(m.user_id) ?? 0;
    const live = statusMap.get(m.user_id);
    const statusIcon = live
      ? statusEmojis[live.status] ?? ":white_circle:"
      : ":white_circle:";
    const taskInfo = live?.task ? ` — _${live.task}_` : "";
    lines.push(`${statusIcon} *${name}*: ${hours}h${taskInfo}`);
  }

  const totalTeamHours = Array.from(hoursByUser.values()).reduce(
    (a, b) => a + b,
    0,
  );
  const activeCount = hoursByUser.size;

  lines.push(
    "",
    `*Total equipo:* ${totalTeamHours}h | *Activos:* ${activeCount}/${members.length}`,
  );

  return slackInChannel(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Sub-command: /exomagram leaderboard
// ---------------------------------------------------------------------------
async function handleLeaderboard(
  supabase: ReturnType<typeof getSupabase>,
  orgId: string,
) {
  // Fetch top 5 by trust score
  const { data: scores } = await supabase
    .from("trust_score_history")
    .select("user_id, score, date")
    .eq("org_id", orgId)
    .order("date", { ascending: false });

  if (!scores || scores.length === 0) {
    return slackEphemeral(":trophy: No hay datos de trust score todavia.");
  }

  // Deduplicate: keep only the latest score per user
  const latestByUser = new Map<string, number>();
  for (const s of scores) {
    if (!latestByUser.has(s.user_id)) {
      latestByUser.set(s.user_id, s.score);
    }
  }

  // Sort descending, take top 5
  const sorted = Array.from(latestByUser.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length === 0) {
    return slackEphemeral(":trophy: No hay datos de trust score todavia.");
  }

  // Fetch names
  const userIds = sorted.map(([uid]) => uid);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);

  const nameMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    nameMap.set(p.id, p.full_name ?? "Desconocido");
  }

  const medals = [":first_place_medal:", ":second_place_medal:", ":third_place_medal:", "4.", "5."];
  const lines: string[] = [":trophy: *Leaderboard — Trust Score*\n"];

  sorted.forEach(([uid, score], i) => {
    const name = nameMap.get(uid) ?? "Desconocido";
    lines.push(`${medals[i]} *${name}* — ${score} pts`);
  });

  // Also add streak info for top users
  const { data: streaks } = await supabase
    .from("activity_streaks")
    .select("user_id, current_streak")
    .eq("org_id", orgId)
    .in("user_id", userIds);

  if (streaks && streaks.length > 0) {
    const topStreak = streaks.reduce((best, s) =>
      s.current_streak > best.current_streak ? s : best,
    );
    const streakName = nameMap.get(topStreak.user_id) ?? "?";
    lines.push(
      "",
      `:fire: *Mejor racha:* ${streakName} — ${topStreak.current_streak} dias`,
    );
  }

  return slackInChannel(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// POST /api/slack/command
// Entry point for the /exomagram slash command in Slack
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  // Slack sends slash-command payloads as application/x-www-form-urlencoded
  const formData = await request.formData();

  const token = formData.get("token") as string | null;
  const teamId = formData.get("team_id") as string | null;
  const channelId = formData.get("channel_id") as string | null;
  const slackUserId = formData.get("user_id") as string | null;
  const userName = formData.get("user_name") as string | null;
  const command = formData.get("command") as string | null;
  const text = (formData.get("text") as string | null) ?? "";
  const responseUrl = formData.get("response_url") as string | null;

  // Basic validation
  if (!slackUserId || !userName) {
    return slackEphemeral(":x: No se pudo identificar al usuario de Slack.");
  }

  // Verify the Slack signing token if configured
  const expectedToken = process.env.SLACK_VERIFICATION_TOKEN;
  if (expectedToken && token !== expectedToken) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const supabase = getSupabase();

  // -----------------------------------------------------------------------
  // Resolve the Slack user to an Exomagram profile.
  // We need at least one org to scope the lookup — try to infer from the
  // Slack team or fall back to the first org we can find for the user.
  // -----------------------------------------------------------------------

  // Try to find an org linked to this Slack team via integration_configs
  let orgId: string | null = null;
  if (teamId) {
    const { data: integration } = await supabase
      .from("integration_configs")
      .select("org_id")
      .eq("provider", "slack")
      .limit(1)
      .maybeSingle();
    orgId = integration?.org_id ?? null;
  }

  // Fallback: pick the first org in the system (single-tenant shortcut)
  if (!orgId) {
    const { data: firstOrg } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .maybeSingle();
    orgId = firstOrg?.id ?? null;
  }

  if (!orgId) {
    return slackEphemeral(
      ":x: No se encontro ninguna organizacion configurada.",
    );
  }

  // Resolve Slack user -> Exomagram profile
  const profile = await resolveProfile(supabase, userName, orgId);
  if (!profile) {
    return slackEphemeral(
      `:x: No encontre tu perfil en Exomagram.\n` +
        `Asegurate de que tu nombre de Slack (*${userName}*) coincida con tu email o nombre en Exomagram.`,
    );
  }

  // Ensure we use an org the user actually belongs to
  const confirmedOrgId = (await getFirstOrgId(supabase, profile.id)) ?? orgId;

  // -----------------------------------------------------------------------
  // Parse the sub-command
  // -----------------------------------------------------------------------
  const parts = text.trim().split(/\s+/);
  const subCommand = (parts[0] ?? "").toLowerCase();
  const args = parts.slice(1);

  switch (subCommand) {
    case "log":
      return handleLog(supabase, profile.id, confirmedOrgId, args);

    case "status":
      return handleStatus(
        supabase,
        profile.id,
        confirmedOrgId,
        profile.full_name ?? userName,
      );

    case "team":
      return handleTeam(supabase, confirmedOrgId);

    case "leaderboard":
      return handleLeaderboard(supabase, confirmedOrgId);

    default:
      return slackEphemeral(
        ":wave: *Exomagram Bot*\n\n" +
          "*Comandos disponibles:*\n" +
          '`/exomagram log 2h deep_work "Descripcion de lo que hiciste"`\n' +
          "`/exomagram status` — Tus horas hoy, trust score, racha\n" +
          "`/exomagram team` — Quien esta conectado y sus horas\n" +
          "`/exomagram leaderboard` — Top 5 por trust score\n\n" +
          `*Categorias:* ${VALID_CATEGORIES.map((c) => {
            const info = CATEGORIES[c];
            return `${info.emoji} \`${c}\``;
          }).join(", ")}`,
      );
  }
}
