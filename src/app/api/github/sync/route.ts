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

  // Insert events, skipping duplicates
  let inserted = 0;
  for (const event of events) {
    // Check if this event already exists to avoid duplicates on re-sync
    let query = supabase
      .from("github_events")
      .select("id")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .eq("event_type", event.event_type)
      .eq("repo", event.repo)
      .eq("date", event.date);

    if (event.sha) {
      query = query.eq("sha", event.sha);
    } else if (event.url) {
      query = query.eq("url", event.url);
    } else {
      query = query.eq("title", event.title);
    }

    const { data: existing } = await query.limit(1).single();
    if (existing) continue; // Already synced

    const { error } = await supabase.from("github_events").insert({
      user_id: user.id,
      org_id: orgId,
      ...event,
    });
    if (!error) inserted++;
  }

  // V11 — Aggregate synced events into git_daily_metrics
  const todayEvents = events.filter((e) => e.date === today);
  if (todayEvents.length > 0) {
    const commits = todayEvents.filter((e) => e.event_type === "commit");
    const prsOpened = todayEvents.filter((e) => e.event_type === "pr_opened");
    const prsMerged = todayEvents.filter((e) => e.event_type === "pr_merged");
    const prsReviewed = todayEvents.filter((e) => e.event_type === "pr_reviewed");

    let totalAdded = 0;
    let totalRemoved = 0;
    for (const c of commits) {
      totalAdded += (c.metadata?.additions as number) ?? 0;
      totalRemoved += (c.metadata?.deletions as number) ?? 0;
    }

    const activeRepos = [...new Set(todayEvents.map((e) => e.repo))];
    const largestCommitFiles = Math.max(
      0,
      ...commits.map((c) => (c.metadata?.files_changed as number) ?? 0)
    );

    await supabase.from("git_daily_metrics").upsert({
      user_id: user.id,
      org_id: orgId,
      date: today,
      commits_count: commits.length,
      lines_added: totalAdded,
      lines_removed: totalRemoved,
      files_changed: 0, // Not available from events API without per-commit detail
      prs_opened: prsOpened.length,
      prs_merged: prsMerged.length,
      prs_reviewed: prsReviewed.length,
      review_comments: 0,
      avg_pr_size_lines: 0,
      repos_active: activeRepos,
      languages: [],
      largest_commit_files: largestCommitFiles,
      tests_added: 0,
      docs_changed: false,
      ci_failures: 0,
      source: "github_sync",
    }, { onConflict: "user_id,org_id,date" });
  }

  return NextResponse.json({
    synced: inserted,
    total_found: events.length,
    repos_checked: repos.length,
    metrics_updated: todayEvents.length > 0,
  });
}
