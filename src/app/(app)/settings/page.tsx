"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Check,
  Copy,
  Download,
  UserPlus,
  Users,
} from "lucide-react";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: profileData }, { data: membership }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase
          .from("org_members")
          .select("org_id")
          .eq("user_id", user.id)
          .limit(1)
          .single<{ org_id: string }>(),
      ]);

      if (profileData) {
        setProfile(profileData as Profile);
        setFullName((profileData as Profile).full_name ?? "");
        setRole((profileData as Profile).role ?? "");
        setTimezone((profileData as Profile).timezone);
      }
      if (membership) {
        setOrgId(membership.org_id);
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", membership.org_id)
          .single();
        if (org) setOrgName((org as { name: string }).name);

        const { count } = await supabase
          .from("org_members")
          .select("id", { count: "exact", head: true })
          .eq("org_id", membership.org_id);
        setMemberCount(count ?? 0);
      }

      // Default export dates
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      setExportEnd(now.toISOString().split("T")[0]);
      setExportStart(weekAgo.toISOString().split("T")[0]);

      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        role: role || null,
        timezone,
      })
      .eq("id", profile.id);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function copyInviteId() {
    if (!orgId) return;
    await navigator.clipboard.writeText(orgId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleJoinOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setJoining(false); return; }

    // Check org exists
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", joinCode.trim())
      .single();

    if (!org) {
      setJoinError("Organización no encontrada. Verifica el código.");
      setJoining(false);
      return;
    }

    // Check not already a member
    const { data: existing } = await supabase
      .from("org_members")
      .select("id")
      .eq("org_id", joinCode.trim())
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (existing) {
      setJoinError("Ya eres miembro de esta organización.");
      setJoining(false);
      return;
    }

    const { error } = await supabase
      .from("org_members")
      .insert({ org_id: joinCode.trim(), user_id: user.id, role: "member" });

    if (error) {
      setJoinError(error.message);
    } else {
      window.location.reload();
    }
    setJoining(false);
  }

  function handleExport() {
    if (!orgId || !exportStart || !exportEnd) return;
    const url = `/api/export?org_id=${orgId}&start=${exportStart}&end=${exportEnd}`;
    window.open(url, "_blank");
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 animate-pulse" /><p className="text-sm text-muted-foreground animate-pulse">Cargando...</p></div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>

      {/* Profile settings */}
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Información visible para tu equipo</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre completo</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol / Puesto</Label>
              <Input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ej: Frontend Developer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">Zona horaria</Label>
              <Input
                id="tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="America/Mexico_City"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : saved ? (
                <><Check className="w-4 h-4 mr-1" /> Guardado</>
              ) : "Guardar cambios"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Team management */}
      {orgId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {orgName || "Tu equipo"}
              <Badge variant="secondary" className="text-xs">{memberCount} miembros</Badge>
            </CardTitle>
            <CardDescription>
              Comparte el código de organización para que otros se unan
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={orgId} readOnly className="font-mono text-sm" />
              <Button variant="outline" onClick={copyInviteId}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Unirse a un equipo
            </CardTitle>
            <CardDescription>
              Ingresa el código de organización que te compartieron
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinOrg} className="flex gap-2">
              <Input
                placeholder="Código de organización (UUID)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="font-mono"
              />
              <Button type="submit" disabled={joining}>
                {joining ? "Uniendo..." : "Unirse"}
              </Button>
            </form>
            {joinError && (
              <p className="text-sm text-red-600 mt-2">{joinError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Export */}
      {orgId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Exportar datos
            </CardTitle>
            <CardDescription>
              Descarga un CSV con todas las entradas del equipo para auditoría
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <Input
                  type="date"
                  value={exportStart}
                  onChange={(e) => setExportStart(e.target.value)}
                  className="w-auto"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input
                  type="date"
                  value={exportEnd}
                  onChange={(e) => setExportEnd(e.target.value)}
                  className="w-auto"
                />
              </div>
              <Button onClick={handleExport} className="gap-2">
                <Download className="w-4 h-4" />
                Exportar CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
