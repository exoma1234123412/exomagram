"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/lib/context/org-context";
import type { Profile } from "@/lib/types/database";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewRecord {
 user_id: string;
 created_at: string;
 profiles: Profile;
}

interface WhoViewedProps {
 entryId: string;
 className?: string;
}

/**
 *"Visto por"indicator for time entry cards.
 *
 * Logs a view in the audit_log table when mounted, then shows
 * a compact list of who else has viewed this entry.
 *
 * Usage:
 * <WhoViewed entryId={entry.id} />
 */
export function WhoViewed({ entryId, className }: WhoViewedProps) {
 const { orgId, userId } = useOrg();
 const [viewers, setViewers] = useState<ViewRecord[]>([]);
 const supabase = createClient();

 // Log that the current user viewed this entry
 const logView = useCallback(async () => {
 if (!orgId || !userId || !entryId) return;

 // Check if this user already logged a view for this entry
 const { data: existing } = await supabase
 .from("audit_log")
 .select("id")
 .eq("user_id", userId)
 .eq("target_type","entry_view")
 .eq("target_id", entryId)
 .limit(1);

 if (existing && existing.length > 0) return;

 await supabase.from("audit_log").insert({
 org_id: orgId,
 user_id: userId,
 action:"entry_created",
 target_type:"entry_view",
 target_id: entryId,
 });
 }, [orgId, userId, entryId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Fetch all viewers for this entry
 const fetchViewers = useCallback(async () => {
 if (!entryId) return;

 const { data } = await supabase
 .from("audit_log")
 .select("user_id, created_at, profiles:user_id(full_name, avatar_url)")
 .eq("target_type","entry_view")
 .eq("target_id", entryId)
 .order("created_at", { ascending: true });

 if (data) {
 // Deduplicate by user_id (keep first view)
 const seen = new Set<string>();
 const unique = data.filter((d) => {
 if (seen.has(d.user_id)) return false;
 seen.add(d.user_id);
 return true;
 });
 setViewers(unique as unknown as ViewRecord[]);
 }
 }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 logView().then(() => fetchViewers());
 }, [logView, fetchViewers]);

 // Don't show if no one has viewed (or only the current user)
 const otherViewers = viewers.filter((v) => v.user_id !== userId);
 if (otherViewers.length === 0) return null;

 // Build names string:"Erik, Andres"or"Erik y 2 más"
const MAX_NAMES = 2;
 const names = otherViewers
 .slice(0, MAX_NAMES)
 .map((v) => v.profiles?.full_name?.split("")[0] ??"?");
 const remaining = otherViewers.length - MAX_NAMES;

 let label: string;
 if (remaining > 0) {
 label =`${names.join(",")} y ${remaining} más`;
 } else {
 label = names.join(",");
 }

 return (
 <div
 className={cn(
"flex items-center gap-1.5 text-[11px] text-muted-foreground/60",
 className
 )}
 >
 <Eye className="w-3 h-3"/>
 <span>Visto por {label}</span>
 </div>
 );
}
