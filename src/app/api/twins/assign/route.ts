import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { startOfWeek, format } from "date-fns";

// POST /api/twins/assign
// Body: { org_id }
// Shuffles all org members and pairs them as "accountability twins" for the week.
// Stores the result in audit_log with target_type "twin_assignment".

export async function POST(request: Request) {
  const authSupabase = await createServerClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { org_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }

  const orgId = body.org_id;
  if (!orgId) return NextResponse.json({ error: "org_id requerido" }, { status: 400 });

  // Verify caller is a member
  const { data: membership } = await authSupabase
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all org members
  const { data: members, error: membersError } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId);

  if (membersError || !members || members.length < 2) {
    return NextResponse.json(
      { error: "Se necesitan al menos 2 miembros para asignar twins" },
      { status: 400 }
    );
  }

  // Shuffle members (Fisher-Yates)
  const userIds = members.map((m) => m.user_id);
  for (let i = userIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [userIds[i], userIds[j]] = [userIds[j], userIds[i]];
  }

  // Pair them up
  const pairs: [string, string][] = [];
  for (let i = 0; i < userIds.length - 1; i += 2) {
    pairs.push([userIds[i], userIds[i + 1]]);
  }
  // If odd, last person is solo — represented as a pair with themselves
  const solos: string[] = [];
  if (userIds.length % 2 !== 0) {
    solos.push(userIds[userIds.length - 1]);
  }

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  // Store in audit_log
  const { error: insertError } = await supabase.from("audit_log").insert({
    org_id: orgId,
    user_id: user.id,
    action: "entry_created",
    target_type: "twin_assignment",
    target_id: orgId,
    new_data: {
      pairs,
      solos,
      week_start: weekStart,
    },
  });

  if (insertError) {
    return NextResponse.json(
      { error: "Error al guardar asignacion", details: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    pairs,
    solos,
    week_start: weekStart,
  });
}
