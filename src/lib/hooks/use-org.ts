"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface OrgState {
  orgId: string | null;
  userId: string | null;
  loading: boolean;
}

export function useOrg(): OrgState {
  const [state, setState] = useState<OrgState>({
    orgId: null,
    userId: null,
    loading: true,
  });

  useEffect(() => {
    async function loadOrg() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setState({ orgId: null, userId: null, loading: false });
        return;
      }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      setState({
        orgId: membership?.org_id ?? null,
        userId: user.id,
        loading: false,
      });
    }
    loadOrg();
  }, []);

  return state;
}
