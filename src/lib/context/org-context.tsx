"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

interface OrgContextValue {
  orgId: string | null;
  userId: string | null;
  userEmail: string | null;
  orgName: string | null;
  role: "owner" | "admin" | "member" | null;
  loading: boolean;
}

const OrgContext = createContext<OrgContextValue>({
  orgId: null,
  userId: null,
  userEmail: null,
  orgName: null,
  role: null,
  loading: true,
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrgContextValue>({
    orgId: null,
    userId: null,
    userEmail: null,
    orgName: null,
    role: null,
    loading: true,
  });

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id, role, organizations(name)")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      setState({
        orgId: membership?.org_id ?? null,
        userId: user.id,
        userEmail: user.email ?? null,
        orgName: (membership?.organizations as any)?.name ?? null,
        role: (membership?.role as OrgContextValue["role"]) ?? null,
        loading: false,
      });
    }
    load();
  }, []);

  return <OrgContext.Provider value={state}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  return useContext(OrgContext);
}
