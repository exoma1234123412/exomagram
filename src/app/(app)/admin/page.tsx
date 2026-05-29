"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, OrgMember } from "@/lib/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Shield,
  UserCog,
  Crown,
  UserMinus,
  AlertTriangle,
} from "lucide-react";

interface MemberWithProfile {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  profiles: Profile;
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

const ROLE_CONFIG = {
  owner: { label: "Owner", color: "text-yellow-600", bg: "bg-yellow-100 dark:bg-yellow-900/30", icon: Crown },
  admin: { label: "Admin", color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30", icon: Shield },
  member: { label: "Miembro", color: "text-gray-600", bg: "bg-gray-100 dark:bg-gray-800/30", icon: UserCog },
};

export default function AdminPage() {
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string>("member");
  const [updating, setUpdating] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .single<{ org_id: string; role: string }>();

      if (!membership) { setLoading(false); return; }
      setOrgId(membership.org_id);
      setCurrentRole(membership.role);

      const [{ data: org }, { data: memberData }] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", membership.org_id).single(),
        supabase
          .from("org_members")
          .select("id, user_id, role, joined_at, profiles(*)")
          .eq("org_id", membership.org_id)
          .order("joined_at", { ascending: true })
          .returns<MemberWithProfile[]>(),
      ]);

      setOrgName((org as { name: string })?.name ?? "");
      setMembers(memberData ?? []);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwnerOrAdmin = currentRole === "owner" || currentRole === "admin";

  async function changeRole(memberId: string, newRole: string) {
    if (!isOwnerOrAdmin) return;
    setUpdating(memberId);

    await supabase
      .from("org_members")
      .update({ role: newRole })
      .eq("id", memberId);

    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId ? { ...m, role: newRole as "owner" | "admin" | "member" } : m
      )
    );
    setUpdating(null);
  }

  async function removeMember(memberId: string, userId: string) {
    if (!isOwnerOrAdmin) return;
    if (userId === currentUserId) return;
    if (!confirm("Seguro que quieres eliminar a este miembro?")) return;

    setUpdating(memberId);
    await supabase.from("org_members").delete().eq("id", memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    setUpdating(null);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
      </div>
    );
  }

  if (!isOwnerOrAdmin) {
    return (
      <div className="flex items-center justify-center h-screen px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold">Acceso restringido</h2>
            <p className="text-muted-foreground mt-2">
              Solo los owners y admins pueden acceder al panel de administracion.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Administracion</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        {orgName} - {members.length} miembros
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Miembros del equipo</CardTitle>
          <CardDescription>
            Gestiona roles y acceso de los miembros
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((m) => {
              const roleConfig = ROLE_CONFIG[m.role];
              const isCurrentUser = m.user_id === currentUserId;
              const RoleIcon = roleConfig.icon;

              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border",
                    isCurrentUser && "bg-violet-50/50 dark:bg-violet-950/10 border-violet-200 dark:border-violet-800"
                  )}
                >
                  <Avatar className="w-10 h-10 ring-2 ring-background shadow-sm">
                    <AvatarImage src={m.profiles.avatar_url ?? undefined} />
                    <AvatarFallback>{getInitials(m.profiles.full_name)}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm truncate">
                        {m.profiles.full_name ?? m.profiles.email}
                      </h3>
                      {isCurrentUser && (
                        <Badge variant="outline" className="text-[10px]">Tu</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{m.profiles.email}</span>
                      <span>|</span>
                      <span>
                        Desde {format(new Date(m.joined_at), "d MMM yyyy", { locale: es })}
                      </span>
                    </div>
                  </div>

                  {/* Role selector */}
                  {isOwnerOrAdmin && !isCurrentUser && m.role !== "owner" ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => v && changeRole(m.id, v)}
                      disabled={updating === m.id}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Miembro</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn("text-xs gap-1", roleConfig.color)}
                    >
                      <RoleIcon className="w-3 h-3" />
                      {roleConfig.label}
                    </Badge>
                  )}

                  {/* Remove button */}
                  {isOwnerOrAdmin && !isCurrentUser && m.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500"
                      onClick={() => removeMember(m.id, m.user_id)}
                      disabled={updating === m.id}
                    >
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
