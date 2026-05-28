import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/github/sync — Fetch recent GitHub events for a user
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: connection } = await supabase
    .from("github_connections")
    .select("*")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!connection) {
    return NextResponse.json({ error: "No GitHub connection found" }, { status: 404 });
  }

  const token = connection.github_token;
  const username = connection.github_username;
  const repos = connection.repos as string[];
  const orgId = connection.org_id;
  const today = new Date().toISOString().split("T")[0];

  const events: Array<{
    event_type: string;
    repo: string;
    title: string;
    url: string | null;
    sha: string | null;
    date: string;
    hour: number | null;
    metadata: Record<string, unknown>;
  }> = [];

  for (const repo of repos) {
    try {
      // Fetch commits
      const commitsRes = await fetch(
        `https://api.github.com/repos/${repo}/commits?author=${username}&since=${today}T00:00:00Z&per_page=50`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (commitsRes.ok) {
        const commits = await commitsRes.json();
        for (const c of commits) {
          const commitDate = new Date(c.commit.author.date);
          events.push({
            event_type: "commit",
            repo,
            title: c.commit.message.split("\n")[0].slice(0, 200),
            url: c.html_url,
            sha: c.sha?.slice(0, 7) ?? null,
            date: commitDate.toISOString().split("T")[0],
            hour: commitDate.getHours(),
            metadata: { additions: c.stats?.additions, deletions: c.stats?.deletions },
          });
        }
      }

      // Fetch PRs
      const prsRes = await fetch(
        `https://api.github.com/repos/${repo}/pulls?state=all&sort=updated&per_page=20`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (prsRes.ok) {
        const prs = await prsRes.json();
        for (const pr of prs) {
          if (pr.user.login !== username) continue;
          const prDate = new Date(pr.updated_at);
          if (prDate.toISOString().split("T")[0] !== today) continue;

          events.push({
            event_type: pr.merged_at ? "pr_merged" : "pr_opened",
            repo,
            title: pr.title,
            url: pr.html_url,
            sha: null,
            date: prDate.toISOString().split("T")[0],
            hour: prDate.getHours(),
            metadata: { number: pr.number, state: pr.state },
          });
        }
      }
    } catch {
      // Skip failed repos
    }
  }

  // Upsert events
  let inserted = 0;
  for (const event of events) {
    const { error } = await supabase.from("github_events").insert({
      user_id: user.id,
      org_id: orgId,
      ...event,
    });
    if (!error) inserted++;
  }

  return NextResponse.json({
    synced: inserted,
    total_found: events.length,
    repos_checked: repos.length,
  });
}
