-- ============================================================
-- V17 — Nuclear delete block: trigger-level immutability
-- Nothing submitted can ever be deleted. Period.
-- RLS policies alone are insufficient (OR logic bypasses them).
-- Triggers fire BEFORE the delete reaches the table — no bypass.
-- ============================================================

-- ── 1. Universal delete-blocker function ─────────────────────
CREATE OR REPLACE FUNCTION prevent_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'DELETE bloqueado: los datos en % son permanentes. Nada se borra.',
    TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Attach trigger to every table ─────────────────────────
-- Excluded: entry_bookmarks, entry_reactions, auction_bids (UI toggle state, not submitted data)

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    -- Core work data
    'time_entries',
    'daily_closeouts',
    'daily_health',
    'weekly_reflections',
    'standups',
    'daily_promises',
    'focus_sessions',
    'communication_log',
    'communication_logs',
    'git_daily_metrics',
    'journal_entries',
    'entry_comments',
    'entry_revisions',
    'shoutouts',
    'public_feed',
    'weekly_contracts',
    'goals',
    'meeting_ratings',
    'panic_events',
    'focus_duels',
    'pomodoro_sessions',
    'pulse_responses',
    'monthly_obituaries',
    -- Accountability & social
    'accountability_flags',
    'accountability_pacts',
    'accountability_buddies',
    'buddy_pairs',
    'tribunal_sessions',
    'tribunal_votes',
    'predictions',
    'prediction_bets',
    'roulette_pairings',
    'deadman_alerts',
    -- Trust & scoring
    'trust_score_history',
    'trust_investments',
    'power_rankings',
    'mirror_tiers',
    'user_xp',
    'xp_events',
    'title_tiers',
    'achievements',
    'activity_streaks',
    -- AI & intelligence
    'ai_daily_insights',
    'ai_reviews',
    'ai_work_profiles',
    'ai_profile_history',
    'ai_profile_snapshots',
    'ai_memory',
    'nudge_outcomes',
    'personal_baselines',
    'correlation_insights',
    'weekly_summaries',
    -- Aggregates & history
    'daily_aggregates',
    'weekly_aggregates',
    'unlogged_hours',
    'heartbeat_history',
    'live_status',
    -- Audit & events
    'event_log',
    'audit_log',
    'audit_lotteries',
    'notifications',
    -- Org & config
    'organizations',
    'org_members',
    'org_settings',
    'profiles',
    'projects',
    'saved_reports',
    'api_keys',
    'integration_configs',
    'webhook_deliveries',
    'public_dashboards',
    -- External integrations
    'github_connections',
    'github_events',
    'task_auctions',
    'bounties'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Only create trigger if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS no_delete_%I ON %I', tbl, tbl);
      EXECUTE format(
        'CREATE TRIGGER no_delete_%I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_delete()',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- ── 3. Remove CASCADE deletes (replace with RESTRICT) ────────
-- tribunal_votes: don't cascade-delete when session is deleted
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%tribunal_votes_session_id_fkey%'
    OR constraint_name LIKE '%prediction_bets_prediction_id_fkey%'
  ) THEN
    -- Drop and recreate FK without CASCADE
    ALTER TABLE tribunal_votes DROP CONSTRAINT IF EXISTS tribunal_votes_session_id_fkey;
    ALTER TABLE tribunal_votes
      ADD CONSTRAINT tribunal_votes_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES tribunal_sessions(id) ON DELETE RESTRICT;

    ALTER TABLE prediction_bets DROP CONSTRAINT IF EXISTS prediction_bets_prediction_id_fkey;
    ALTER TABLE prediction_bets
      ADD CONSTRAINT prediction_bets_prediction_id_fkey
      FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE RESTRICT;
  END IF;
END $$;
