import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  const isPublicPage =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/public");

  // Not logged in → login
  if (!user && !isAuthPage && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in on auth page → home
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  // Logged in → check if setup completed (skip for setup page itself and API routes)
  if (user && !pathname.startsWith("/setup") && !pathname.startsWith("/api") && !isAuthPage && !isPublicPage) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("setup_completed")
      .eq("id", user.id)
      .single();

    if (profile && !profile.setup_completed) {
      const url = request.nextUrl.clone();
      url.pathname = "/setup";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
