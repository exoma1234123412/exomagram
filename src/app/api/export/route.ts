import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");
  const userId = searchParams.get("user_id");

  if (!orgId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "org_id, start, and end are required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Verify the requesting user belongs to this org
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let query = supabase
    .from("time_entries")
    .select("*, profiles(full_name, email, role)")
    .eq("org_id", orgId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true })
    .order("hour", { ascending: true });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: entries, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build CSV
  const headers = [
    "Fecha",
    "Hora",
    "Persona",
    "Email",
    "Rol",
    "Categoria",
    "Titulo",
    "Descripcion",
    "Animo",
    "Energia",
    "Con Evidencia",
    "Entrada Tardia",
    "Minutos Tarde",
    "Estado Verificacion",
    "Links Evidencia",
    "Registrado En",
  ];

  const rows = (entries ?? []).map((e: Record<string, unknown>) => {
    const profile = e.profiles as Record<string, unknown> | null;
    return [
      e.date,
      `${e.hour}:00`,
      profile?.full_name ?? "",
      profile?.email ?? "",
      profile?.role ?? "",
      e.category,
      `"${String(e.title ?? "").replace(/"/g, '""')}"`,
      `"${String(e.description ?? "").replace(/"/g, '""')}"`,
      e.mood ?? "",
      e.energy ?? "",
      (e.proof_urls as string[] | null)?.length ? "Si" : "No",
      e.is_late ? "Si" : "No",
      e.minutes_late ?? 0,
      e.verification_status ?? "unverified",
      ((e.proof_urls as string[] | null) ?? []).join(" | "),
      e.logged_at ?? e.created_at,
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=exomagram-${startDate}-${endDate}.csv`,
    },
  });
}
