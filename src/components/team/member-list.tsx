"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, OrgMember, LiveStatus } from "@/lib/types/database";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import {
 Crown,
 Shield,
 Users,
 Clock,
 X,
 Mail,
 UserPlus,
} from "lucide-react";
import { type Invitation } from "./invite-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MemberWithProfile = OrgMember & { profiles: Profile };

interface MemberListProps {
 orgId: string;
 currentUserId: string;
 currentUserRole:"owner"|"admin"|"member";
 onInviteClick?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
 return new Date(dateStr).toLocaleDateString("es-ES", {
 day:"numeric",
 month:"short",
 year:"numeric",
 });
}

const ROLE_CONFIG = {
 owner: {
 label:"Propietario",
 icon: Crown,
 color:"text-amber-600",
 dotColor:"bg-amber-500",
 badgeBg:"bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-300/50",
 },
 admin: {
 label:"Admin",
 icon: Crown,
 color:"text-purple-600",
 dotColor:"bg-purple-500",
 badgeBg:"bg-purple-50/50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 border-purple-300/50",
 },
 member: {
 label:"Miembro",
 icon: Shield,
 color:"text-blue-600",
 dotColor:"bg-blue-500",
 badgeBg:"bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-300/50",
 },
} as const;

function loadInvitations(orgId: string): Invitation[] {
 if (typeof window ==="undefined") return [];
 try {
 const raw = localStorage.getItem(`exomagram_invitations_${orgId}`);
 return raw ? (JSON.parse(raw) as Invitation[]) : [];
 } catch {
 return [];
 }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemberList({
 orgId,
 currentUserId,
 currentUserRole,
 onInviteClick,
}: MemberListProps) {
 const [members, setMembers] = useState<MemberWithProfile[]>([]);
 const [liveStatuses, setLiveStatuses] = useState<LiveStatus[]>([]);
 const [invitations, setInvitations] = useState<Invitation[]>([]);
 const [loading, setLoading] = useState(true);
 const [changingRole, setChangingRole] = useState<string | null>(null);
 const supabase = createClient();

 const isAdmin = currentUserRole ==="owner"|| currentUserRole ==="admin";

 // Fetch members and live statuses
 useEffect(() => {
 async function fetchData() {
 setLoading(true);

 const [membersResult, statusResult] = await Promise.all([
 supabase
 .from("org_members")
 .select("*, profiles(*)")
 .eq("org_id", orgId)
 ,
 supabase
 .from("live_status")
 .select("*")
 .eq("org_id", orgId)
 ,
 ]);

 setMembers(membersResult.data ?? []);
 setLiveStatuses(statusResult.data ?? []);
 setInvitations(loadInvitations(orgId));
 setLoading(false);
 }

 fetchData();

 // Real-time updates for live_status
 const channel = supabase
 .channel("member_list_live")
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"live_status",
 filter:`org_id=eq.${orgId}`,
 },
 async () => {
 const { data } = await supabase
 .from("live_status")
 .select("*")
 .eq("org_id", orgId)
 ;
 setLiveStatuses(data ?? []);
 }
 )
 .on(
"postgres_changes",
 {
 event:"*",
 schema:"public",
 table:"org_members",
 filter:`org_id=eq.${orgId}`,
 },
 async () => {
 const { data } = await supabase
 .from("org_members")
 .select("*, profiles(*)")
 .eq("org_id", orgId)
 ;
 setMembers(data ?? []);
 }
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

 // Build live status lookup
 const statusLookup = new Map<string, LiveStatus>();
 for (const status of liveStatuses) {
 statusLookup.set(status.user_id, status);
 }

 // Role change handler
 async function handleRoleChange(memberId: string, userId: string, newRole: string) {
 if (!isAdmin || userId === currentUserId) return;
 setChangingRole(memberId);

 await supabase
 .from("org_members")
 .update({ role: newRole })
 .eq("id", memberId);

 setMembers((prev) =>
 prev.map((m) =>
 m.id === memberId ? { ...m, role: newRole as OrgMember["role"] } : m
 )
 );
 setChangingRole(null);
 }

 // Remove member handler
 async function handleRemoveMember(memberId: string, userId: string) {
 if (!isAdmin || userId === currentUserId) return;

 await supabase.from("org_members").delete().eq("id", memberId);
 setMembers((prev) => prev.filter((m) => m.id !== memberId));
 }

 // Stats
 const totalMembers = members.length;
 const adminCount = members.filter((m) => m.role ==="admin"|| m.role ==="owner").length;
 const memberCount = members.filter((m) => m.role ==="member").length;
 const onlineCount = liveStatuses.filter((s) => s.status !=="offline").length;
 const pendingInvitations = invitations.filter((i) => i.status ==="pending");

 if (loading) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">
 Cargando miembros...
 </p>
 </div>
 );
 }

 if (members.length === 0) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-16 h-16 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
 <Users className="w-7 h-7 text-primary/40"/>
 </div>
 <p className="text-sm text-muted-foreground">
 No hay miembros en este equipo.
 </p>
 {onInviteClick && (
 <Button
 variant="outline"onClick={onInviteClick}
 className="">
 <UserPlus className="w-4 h-4 mr-1.5"/>
 Invitar miembros
 </Button>
 )}
 </div>
 );
 }

 return (
 <div className="space-y-6">
 {/* Stats bar */}
 <div className="bg-card/80 border border-border/40 p-5">
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-sm font-semibold flex items-center gap-2.5">
 <Users className="w-4 h-4 text-primary"/>
 Equipo
 </h3>
 {onInviteClick && isAdmin && (
 <Button
 variant="outline"size="sm"onClick={onInviteClick}
 className="">
 <UserPlus className="w-3.5 h-3.5 mr-1.5"/>
 Invitar
 </Button>
 )}
 </div>

 <div className="grid grid-cols-4 gap-3">
 <div className="bg-accent/30 p-3 text-center">
 <p className="text-xl font-bold tabular-nums">{totalMembers}</p>
 <p className="text-[11px] text-muted-foreground/70 font-medium">
 Total
 </p>
 </div>
 <div className="bg-accent/30 p-3 text-center">
 <p className="text-xl font-bold tabular-nums text-green-600">
 {onlineCount}
 </p>
 <p className="text-[11px] text-muted-foreground/70 font-medium">
 En línea
 </p>
 </div>
 <div className="bg-accent/30 p-3 text-center">
 <p className="text-xl font-bold tabular-nums text-amber-600">
 {adminCount}
 </p>
 <p className="text-[11px] text-muted-foreground/70 font-medium">
 Admins
 </p>
 </div>
 <div className="bg-accent/30 p-3 text-center">
 <p className="text-xl font-bold tabular-nums text-blue-600">
 {memberCount}
 </p>
 <p className="text-[11px] text-muted-foreground/70 font-medium">
 Miembros
 </p>
 </div>
 </div>
 </div>

 {/* Member list */}
 <div className="bg-card/80 border border-border/40 overflow-hidden">
 <div className="px-5 py-4 border-b border-border/30">
 <h3 className="text-sm font-semibold">
 Miembros del equipo
 </h3>
 </div>

 <div className="divide-y divide-border/20">
 {members.map((member) => {
 const liveStatus = statusLookup.get(member.user_id);
 const isOnline = liveStatus && liveStatus.status !=="offline";
 const roleConfig = ROLE_CONFIG[member.role];
 const RoleIcon = roleConfig.icon;
 const isSelf = member.user_id === currentUserId;
 const isRoleChanging = changingRole === member.id;

 return (
 <div
 key={member.id}
 className={cn(
"flex items-center justify-between px-5 py-3.5 transition-colors duration-200",
"hover:bg-accent/20")}
 >
 {/* Left: avatar + info */}
 <div className="flex items-center gap-3 min-w-0">
 <div className="relative shrink-0">
 <Avatar className="w-10 h-10 ring-2 ring-background">
 <AvatarImage
 src={member.profiles?.avatar_url ?? undefined}
 />
 <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/30">
 {getInitials(member.profiles?.full_name)}
 </AvatarFallback>
 </Avatar>
 {/* Online/offline dot */}
 <div
 className={cn(
"absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card",
 isOnline
 ?"bg-green-500 animate-pulse":"bg-muted-foreground/30")}
 />
 </div>

 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <p className="text-sm font-semibold truncate">
 {member.profiles?.full_name ??"Sin nombre"}
 </p>
 {isSelf && (
 <Badge
 variant="outline"className="text-[9px] rounded-md px-1.5">
 Tú
 </Badge>
 )}
 </div>
 <p className="text-[12px] text-muted-foreground/70 truncate">
 {member.profiles?.email}
 </p>
 <div className="flex items-center gap-2 mt-0.5">
 <Badge
 variant="outline"className={cn(
"text-[10px] rounded-md px-1.5 font-semibold",
 roleConfig.badgeBg
 )}
 >
 <RoleIcon className={cn("w-3 h-3 mr-0.5", roleConfig.color)} />
 {roleConfig.label}
 </Badge>
 {isOnline && liveStatus?.current_task && (
 <span className="text-[11px] text-muted-foreground/60 truncate max-w-[140px]">
 {liveStatus.current_task}
 </span>
 )}
 </div>
 </div>
 </div>

 {/* Right: meta + actions */}
 <div className="flex items-center gap-3 shrink-0">
 {/* Last active / join date */}
 <div className="text-right hidden sm:block">
 {liveStatus ? (
 <p className="text-[11px] text-muted-foreground/60">
 {isOnline ? (
 <span className="text-green-600 font-medium">Activo ahora</span>
 ) : (
 <>Visto {timeAgo(liveStatus.last_heartbeat)}</>
 )}
 </p>
 ) : (
 <p className="text-[11px] text-muted-foreground">
 Sin actividad
 </p>
 )}
 <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
 <Clock className="w-3 h-3"/>
 {formatDate(member.joined_at)}
 </p>
 </div>

 {/* Admin actions */}
 {isAdmin && !isSelf && member.role !=="owner"&& (
 <div className="flex items-center gap-1">
 {/* Role change dropdown */}
 <Select
 value={member.role}
 onValueChange={(v) =>
 v && handleRoleChange(member.id, member.user_id, v)
 }
 disabled={isRoleChanging}
 >
 <SelectTrigger
 size="sm"className={cn(
"text-[11px] h-7 w-auto min-w-[90px]",
 isRoleChanging &&"opacity-50")}
 >
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="member">
 <Shield className="w-3 h-3 text-blue-600"/>
 Miembro
 </SelectItem>
 <SelectItem value="admin">
 <Crown className="w-3 h-3 text-purple-600"/>
 Admin
 </SelectItem>
 </SelectContent>
 </Select>

 {/* Remove button */}
 <Button
 variant="ghost"size="icon-xs"onClick={() => handleRemoveMember(member.id, member.user_id)}
 className="text-destructive hover:text-destructive hover:bg-destructive/10"title="Eliminar miembro">
 <X className="w-3 h-3"/>
 </Button>
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>

 {/* Pending invitations section */}
 {pendingInvitations.length > 0 && (
 <div className="bg-card/80 border border-border/40 overflow-hidden">
 <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
 <h3 className="text-sm font-semibold flex items-center gap-2">
 <Mail className="w-4 h-4 text-muted-foreground"/>
 Invitaciones pendientes
 </h3>
 <Badge
 variant="secondary"className="text-[10px] rounded-md font-semibold">
 {pendingInvitations.length}
 </Badge>
 </div>

 <div className="divide-y divide-border/20">
 {pendingInvitations.map((inv) => {
 const invRoleConfig = ROLE_CONFIG[inv.role];
 const InvRoleIcon = invRoleConfig.icon;
 return (
 <div
 key={inv.token}
 className="flex items-center justify-between px-5 py-3 hover:bg-accent/20 transition-colors">
 <div className="flex items-center gap-3 min-w-0">
 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/30 flex items-center justify-center shrink-0">
 <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400"/>
 </div>
 <div className="min-w-0">
 <p className="text-sm font-medium truncate">{inv.email}</p>
 <div className="flex items-center gap-1.5 mt-0.5">
 <Badge
 variant="outline"className={cn(
"text-[10px] rounded-md px-1.5 font-semibold",
 invRoleConfig.badgeBg
 )}
 >
 <InvRoleIcon className={cn("w-3 h-3 mr-0.5", invRoleConfig.color)} />
 {invRoleConfig.label}
 </Badge>
 <span className="text-[11px] text-muted-foreground">
 {timeAgo(inv.created_at)}
 </span>
 </div>
 </div>
 </div>
 <Badge
 variant="outline"className="text-[10px] rounded-md text-amber-600 border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20">
 Pendiente
 </Badge>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </div>
 );
}
