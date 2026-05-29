import { NextResponse } from "next/server";
import { verifyApiKey, createServiceClient } from "@/lib/api-auth";

// GET /api/v1/entries — List time entries
export async function GET(request: Request) {
  const auth = await verifyApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  if (!auth.permissions.includes("read") && !auth.permissions.includes("admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const userId = searchParams.get("user_id");
  const category = searchParams.get("category");
  const project = searchParams.get("project");
  const limitParam = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1),
    200
  );
  const offsetParam = Math.max(
    parseInt(searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  const supabase = createServiceClient();

  let query = supabase
    .from("time_entries")
    .select("*", { count: "exact" })
    .eq("org_id", auth.orgId)
    .order("date", { ascending: false })
    .order("hour", { ascending: true })
    .range(offsetParam, offsetParam + limitParam - 1);

  if (date) {
    query = query.eq("date", date);
  }
  if (userId) {
    query = query.eq("user_id", userId);
  }
  if (category) {
    query = query.eq("category", category);
  }
  if (project) {
    query = query.eq("project", project);
  }

  const { data: entries, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: entries ?? [],
    total: count ?? 0,
    limit: limitParam,
    offset: offsetParam,
  });
}

// POST /api/v1/entries — Create a time entry
export async function POST(request: Request) {
  const auth = await verifyApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  if (
    !auth.permissions.includes("write") &&
    !auth.permissions.includes("admin")
  ) {
    return NextResponse.json(
      { error: "Insufficient permissions — write access required" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { user_id, date, hour, category, title, description, project, proof_urls } = body as {
    user_id?: string;
    date?: string;
    hour?: number;
    category?: string;
    title?: string;
    description?: string;
    project?: string;
    proof_urls?: string[];
  };

  // Validate required fields
  if (!user_id || !date || hour === undefined || !category || !title) {
    return NextResponse.json(
      {
        error: "Missing required fields: user_id, date, hour, category, title",
      },
      { status: 400 }
    );
  }

  if (typeof hour !== "number" || hour < 0 || hour > 23) {
    return NextResponse.json(
      { error: "hour must be an integer between 0 and 23" },
      { status: 400 }
    );
  }

  const validCategories = [
    "deep_work",
    "meeting",
    "review",
    "admin",
    "planning",
    "learning",
    "break",
    "blocked",
  ];
  if (!validCategories.includes(category)) {
    return NextResponse.json(
      { error: `Invalid category. Must be one of: ${validCategories.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Verify user belongs to the org
  const { data: membership } = await supabase
    .from("org_members")
    .select("id")
    .eq("org_id", auth.orgId)
    .eq("user_id", user_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "user_id does not belong to this organization" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { data: entry, error } = await supabase
    .from("time_entries")
    .insert({
      user_id,
      org_id: auth.orgId,
      date,
      hour,
      category,
      title,
      description: description ?? null,
      project: project ?? null,
      proof_urls: proof_urls ?? null,
      auto_captured: false,
      verification_status: "unverified",
      is_late: false,
      minutes_late: 0,
      logged_at: now,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: entry }, { status: 201 });
}
