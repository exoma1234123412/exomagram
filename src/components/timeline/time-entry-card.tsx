"use client";

import { CATEGORIES, VERIFICATION_STATUS, CATEGORY_COLORS } from "@/lib/constants";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, formatHour, getInitials, entryFreshness, freshnessLabel, entryEntropy, entropyLabel, entryValue, valueLabel } from "@/lib/utils";
import { ExternalLink, Clock, Shield, AlertTriangle, Pencil, ShieldCheck, FolderKanban, Bookmark, UserCheck, History } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EntryReactions } from "@/components/reactions/entry-reactions";
import { EditEntryDialog } from "./edit-entry-dialog";
import { VerifyEntryDialog } from "./verify-entry-dialog";
import { EntryComments } from "./entry-comments";
import { EntryChangelog } from "./entry-changelog";
import { CrossVerifyDialog } from "./cross-verify";
import { useState, useEffect } from "react";

interface TimeEntryCardProps {
 entry: TimeEntry & { profiles?: Profile };
 showUser?: boolean;
 currentUserId?: string;
 isAdmin?: boolean;
}

export function TimeEntryCard({ entry, showUser = true, currentUserId, isAdmin }: TimeEntryCardProps) {
 const [editOpen, setEditOpen] = useState(false);
 const [verifyOpen, setVerifyOpen] = useState(false);
 const [crossVerifyOpen, setCrossVerifyOpen] = useState(false);
 const [bookmarked, setBookmarked] = useState(false);

 useEffect(() => {
 const supabase = createClient();
 supabase.auth.getUser().then(({ data: { user } }) => {
  if (!user) return;
  supabase.from("entry_bookmarks").select("id").eq("user_id", user.id).eq("entry_id", entry.id).maybeSingle().then(({ data }) => {
   if (data) setBookmarked(true);
  });
 });
 }, [entry.id]);

 async function toggleBookmark() {
 const supabase = createClient();
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;

 if (bookmarked) {
 await supabase.from("entry_bookmarks").delete().eq("user_id", user.id).eq("entry_id", entry.id);
 setBookmarked(false);
 } else {
 await supabase.from("entry_bookmarks").upsert({ user_id: user.id, entry_id: entry.id }, { onConflict:"user_id,entry_id"});
 setBookmarked(true);
 }
 }
 const cat = CATEGORIES[entry.category];
 const verification = VERIFICATION_STATUS[entry.verification_status ??"unverified"];
 const hasProof = entry.proof_urls && entry.proof_urls.length > 0;
 const isLate = entry.is_late;
 const isOwner = currentUserId === entry.user_id;
 const gradientClass = CATEGORY_COLORS[entry.category] ??"from-gray-400 to-gray-500";

 // Computed metrics
 const freshness = entry.logged_at ? entryFreshness(entry.logged_at, entry.date, entry.hour) : null;
 const fresh = freshness != null ? freshnessLabel(freshness) : null;
 const entropy = entryEntropy(entry.title, entry.description);
 const ent = entropyLabel(entropy);
 const value = entryValue(entry);
 const val = valueLabel(value);

 return (
 <Card className={cn(
"group relative overflow-hidden hover:border-primary/30 transition-all duration-300 hover:-translate-y-0.5",
 entry.verification_status ==="flagged"&&"ring-2 ring-red-300/50 dark:ring-red-800/50",
 isLate && !hasProof &&"ring-2 ring-yellow-300/50 dark:ring-yellow-800/50")}>
 {/* Left accent bar */}
 <div className={cn("absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b", gradientClass)} />

 <CardContent className="p-4 pl-5">
 <div className="flex gap-3">
 {/* Hour indicator */}
 <div className="flex flex-col items-center min-w-[48px] pt-0.5">
 <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
 {formatHour(entry.hour)}
 </span>
 </div>

 {/* Content */}
 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between gap-2">
 <div className="flex items-center gap-2.5 min-w-0">
 {showUser && entry.profiles && (
 <Avatar className="w-7 h-7 ring-2 ring-background">
 <AvatarImage src={entry.profiles.avatar_url ?? undefined} />
 <AvatarFallback className="text-[10px] bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/30 font-semibold">
 {getInitials(entry.profiles.full_name)}
 </AvatarFallback>
 </Avatar>
 )}
 <h4 className="font-semibold text-sm line-clamp-2 sm:truncate leading-snug">{entry.title}</h4>
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 <Badge
 variant="secondary"className={cn("text-[10px] font-semibold px-2", cat.color, cat.bgColor)}
 >
 {cat.emoji} {cat.label}
 </Badge>
 </div>
 </div>

 {showUser && entry.profiles?.full_name && (
 <p className="text-xs text-muted-foreground mt-1">
 {entry.profiles.full_name}
 </p>
 )}

 {entry.description && (
 <p className="text-[13px] text-muted-foreground mt-2 line-clamp-3 sm:line-clamp-2 leading-relaxed">
 {entry.description}
 </p>
 )}

 {/* Trust indicators */}
 <div className="flex flex-wrap items-center gap-2.5 mt-3">
 <span className={cn(
"inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md",
 hasProof
 ?"text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/30":"text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/30")}>
 {hasProof ? (
 <Shield className="w-3 h-3"/>
 ) : (
 <AlertTriangle className="w-3 h-3"/>
 )}
 {hasProof ?"Con evidencia":"Sin evidencia"}
 </span>

 {isLate && (
 <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/30 px-2 py-0.5 rounded-md">
 <Clock className="w-3 h-3"/>
 Tardía ({entry.minutes_late}min)
 </span>
 )}

 {/* Freshness */}
 {fresh && (
 <span className={cn("text-[10px] font-mono font-semibold", fresh.color)}>
 {fresh.text}
 </span>
 )}

 {/* Entropy */}
 <span className={cn("text-[10px] font-mono font-semibold", ent.color)}>
 {ent.text}
 </span>

 {/* Value */}
 <span className={cn("text-[10px] font-mono font-bold", val.color)}>
 {val.text}
 </span>

 {/* Quality score */}
 {entry.quality_score != null && (
 <span className={cn(
 "text-[10px] font-mono font-semibold",
 entry.quality_score >= 70 ? "text-green-600 dark:text-green-400" :
 entry.quality_score >= 40 ? "text-muted-foreground" :
 "text-red-600 dark:text-red-400"
 )}>
 Q:{entry.quality_score}
 </span>
 )}
 </div>

 {/* Proof links */}
 {entry.proof_urls && entry.proof_urls.length > 0 && (
 <div className="flex flex-wrap gap-1.5 mt-3">
 {entry.proof_urls.map((link, i) => {
 let hostname ="link";
 try { hostname = new URL(link).hostname; } catch { /* noop */ }
 return (
 <a
 key={i}
 href={link}
 target="_blank"rel="noopener noreferrer"className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 transition-colors font-medium">
 <ExternalLink className="w-3 h-3"/>
 {hostname}
 </a>
 );
 })}
 </div>
 )}

 {/* Project tag */}
 {entry.project && (
 <div className="mt-3">
 <Badge variant="outline"className="text-[10px] gap-1 font-medium">
 <FolderKanban className="w-3 h-3"/>
 {entry.project}
 </Badge>
 </div>
 )}

 {/* Peer reactions */}
 <EntryReactions entryId={entry.id} />

 {/* Comments */}
 <EntryComments entryId={entry.id} />

 {/* Action buttons (visible on hover) */}
 <div className="flex gap-1 mt-2.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
 {isOwner && (
 <button
 onClick={() => setEditOpen(true)}
 className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 hover:bg-accent transition-all">
 <Pencil className="w-3 h-3"/>
 Editar
 </button>
 )}
 {(isAdmin || isOwner) && (
 <button
 onClick={() => setVerifyOpen(true)}
 className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-primary px-2.5 py-1.5 hover:bg-primary/5 transition-all">
 <ShieldCheck className="w-3 h-3"/>
 Verificar
 </button>
 )}
 {isOwner && entry.category ==="meeting"&& (
 <button
 onClick={() => setCrossVerifyOpen(true)}
 className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-blue-600 px-2.5 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all">
 <UserCheck className="w-3 h-3"/>
 Verificar
 </button>
 )}
 <button
 onClick={toggleBookmark}
 className={cn(
"inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 transition-all",
 bookmarked
 ?"text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20":"text-muted-foreground hover:text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/20")}
 >
 <Bookmark className={cn("w-3 h-3", bookmarked &&"fill-current")} />
 {bookmarked ?"Guardado":"Guardar"}
 </button>
 </div>

 {/* Changelog */}
 <EntryChangelog entryId={entry.id} />
 </div>
 </div>
 </CardContent>

 {editOpen && (
 <EditEntryDialog entry={entry} open={editOpen} onOpenChange={setEditOpen} />
 )}
 {verifyOpen && (
 <VerifyEntryDialog entry={entry} open={verifyOpen} onOpenChange={setVerifyOpen} />
 )}
 {crossVerifyOpen && (
 <CrossVerifyDialog entry={entry} open={crossVerifyOpen} onOpenChange={setCrossVerifyOpen} />
 )}
 </Card>
 );
}
