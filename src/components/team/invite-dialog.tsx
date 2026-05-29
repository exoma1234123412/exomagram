"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  UserPlus,
  Copy,
  Check,
  X,
  Crown,
  Shield,
  Clock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Invitation {
  email: string;
  role: "member" | "admin";
  status: "pending" | "accepted" | "expired";
  created_at: string;
  token: string;
}

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(orgId: string) {
  return `exomagram_invitations_${orgId}`;
}

function loadInvitations(orgId: string): Invitation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    return raw ? (JSON.parse(raw) as Invitation[]) : [];
  } catch {
    return [];
  }
}

function saveInvitations(orgId: string, invitations: Invitation[]) {
  localStorage.setItem(storageKey(orgId), JSON.stringify(invitations));
}

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000 / 60;
  if (diff < 1) return "ahora";
  if (diff < 60) return `hace ${Math.round(diff)}m`;
  if (diff < 1440) return `hace ${Math.round(diff / 60)}h`;
  return `hace ${Math.round(diff / 1440)}d`;
}

const ROLE_CONFIG = {
  member: { label: "Miembro", icon: Shield, color: "text-blue-600" },
  admin: { label: "Admin", icon: Crown, color: "text-amber-600" },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InviteDialog({
  open,
  onOpenChange,
  orgId,
  orgName,
}: InviteDialogProps) {
  const [emailInput, setEmailInput] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Load invitations when dialog opens
  useEffect(() => {
    if (open) {
      setInvitations(loadInvitations(orgId));
      setSuccess(null);
      setError(null);
    }
  }, [open, orgId]);

  // Parse comma-separated emails
  const parsedEmails = emailInput
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const validEmails = parsedEmails.filter(isValidEmail);
  const invalidEmails = parsedEmails.filter((e) => !isValidEmail(e));
  const duplicateEmails = validEmails.filter((e) =>
    invitations.some((inv) => inv.email === e && inv.status === "pending")
  );
  const newEmails = validEmails.filter(
    (e) => !invitations.some((inv) => inv.email === e && inv.status === "pending")
  );

  const handleSendInvitations = useCallback(() => {
    if (newEmails.length === 0) {
      setError("No hay emails nuevos para invitar.");
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    // Simulate brief network delay
    setTimeout(() => {
      const newInvitations: Invitation[] = newEmails.map((email) => ({
        email,
        role,
        status: "pending" as const,
        created_at: new Date().toISOString(),
        token: generateToken(),
      }));

      const updated = [...invitations, ...newInvitations];
      saveInvitations(orgId, updated);
      setInvitations(updated);
      setEmailInput("");
      setSending(false);
      setSuccess(
        `${newInvitations.length} invitaci${newInvitations.length === 1 ? "on" : "ones"} enviada${newInvitations.length === 1 ? "" : "s"} correctamente.`
      );
    }, 600);
  }, [newEmails, role, invitations, orgId]);

  function handleCancelInvitation(token: string) {
    const updated = invitations.filter((inv) => inv.token !== token);
    saveInvitations(orgId, updated);
    setInvitations(updated);
  }

  function handleCopyLink(token: string) {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${baseUrl}/public/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const pendingInvitations = invitations.filter((i) => i.status === "pending");
  const otherInvitations = invitations.filter((i) => i.status !== "pending");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2.5 tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm shadow-blue-600/25">
              <UserPlus className="w-4 h-4 text-white" />
            </div>
            Invitar al equipo
          </DialogTitle>
          <DialogDescription>
            {orgName
              ? `Invita miembros a ${orgName}. Los invitados recibirán acceso al equipo.`
              : "Invita nuevos miembros a tu organización."}
          </DialogDescription>
        </DialogHeader>

        {/* Email input */}
        <div className="space-y-2">
          <Label htmlFor="invite-emails" className="text-sm font-medium flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            Correos electrónicos
          </Label>
          <Input
            id="invite-emails"
            placeholder="email1@ejemplo.com, email2@ejemplo.com"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            className="rounded-xl"
          />
          <p className="text-[11px] text-muted-foreground/70">
            Separa múltiples correos con comas.
          </p>
        </div>

        {/* Role selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Rol</Label>
          <Select value={role} onValueChange={(v) => v && setRole(v as "member" | "admin")}>
            <SelectTrigger className="rounded-xl w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">
                <Shield className="w-3.5 h-3.5 text-blue-600" />
                Miembro
              </SelectItem>
              <SelectItem value="admin">
                <Crown className="w-3.5 h-3.5 text-amber-600" />
                Administrador
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Preview */}
        {parsedEmails.length > 0 && (
          <div className="space-y-2.5">
            <Label className="text-sm font-medium">Vista previa</Label>
            <div className="bg-accent/30 rounded-xl p-3 space-y-1.5">
              {validEmails.map((email) => {
                const isDuplicate = duplicateEmails.includes(email);
                return (
                  <div
                    key={email}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                      <span className="truncate">{email}</span>
                    </div>
                    {isDuplicate ? (
                      <Badge variant="outline" className="text-[10px] rounded-md text-yellow-600 border-yellow-300/50 bg-yellow-50/50 dark:bg-yellow-950/20 shrink-0">
                        Ya invitado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] rounded-md text-green-600 border-green-300/50 bg-green-50/50 dark:bg-green-950/20 shrink-0">
                        <Check className="w-3 h-3 mr-0.5" />
                        Listo
                      </Badge>
                    )}
                  </div>
                );
              })}
              {invalidEmails.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <X className="w-3.5 h-3.5 text-destructive shrink-0" />
                    <span className="truncate text-destructive/80">{email}</span>
                  </div>
                  <Badge variant="destructive" className="text-[10px] rounded-md shrink-0">
                    Inválido
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success / error messages */}
        {success && (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200/60 dark:border-green-800/40 rounded-xl p-3 flex items-center gap-2.5">
            <Check className="w-4 h-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-400 font-medium">
              {success}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2">
            <p className="text-sm text-destructive font-medium">{error}</p>
          </div>
        )}

        {/* Send button */}
        <Button
          onClick={handleSendInvitations}
          disabled={sending || newEmails.length === 0}
          className="w-full h-10 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 font-semibold"
        >
          {sending ? (
            "Enviando..."
          ) : (
            <>
              <UserPlus className="w-4 h-4 mr-1.5" />
              Enviar invitaciones
              {newEmails.length > 0 && (
                <span className="ml-1.5 bg-white/20 px-1.5 py-0.5 rounded-md text-[11px]">
                  {newEmails.length}
                </span>
              )}
            </>
          )}
        </Button>

        {/* Pending invitations list */}
        {pendingInvitations.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Invitaciones pendientes
                </Label>
                <Badge variant="secondary" className="text-[10px] rounded-md font-semibold">
                  {pendingInvitations.length}
                </Badge>
              </div>

              <div className="space-y-2">
                {pendingInvitations.map((inv) => {
                  const RoleIcon = ROLE_CONFIG[inv.role].icon;
                  const isCopied = copiedToken === inv.token;
                  return (
                    <div
                      key={inv.token}
                      className="flex items-center justify-between bg-accent/30 rounded-xl px-3 py-2.5 group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/40 dark:to-sky-900/30 flex items-center justify-center shrink-0">
                          <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{inv.email}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                            <RoleIcon className={cn("w-3 h-3", ROLE_CONFIG[inv.role].color)} />
                            <span>{ROLE_CONFIG[inv.role].label}</span>
                            <span className="mx-0.5">·</span>
                            <span>{timeAgo(inv.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="outline" className="text-[10px] rounded-md text-amber-600 border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20">
                          Pendiente
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleCopyLink(inv.token)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Copiar enlace de invitación"
                        >
                          {isCopied ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleCancelInvitation(inv.token)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          title="Cancelar invitación"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Past invitations (accepted/expired) */}
        {otherInvitations.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">
                Historial
              </Label>
              <div className="space-y-1.5">
                {otherInvitations.map((inv) => (
                  <div
                    key={inv.token}
                    className="flex items-center justify-between px-3 py-2 opacity-60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{inv.email}</span>
                    </div>
                    <Badge
                      variant={inv.status === "accepted" ? "default" : "outline"}
                      className={cn(
                        "text-[10px] rounded-md",
                        inv.status === "accepted"
                          ? "bg-green-600"
                          : "text-muted-foreground border-muted"
                      )}
                    >
                      {inv.status === "accepted" ? "Aceptada" : "Expirada"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <p className="text-[11px] text-muted-foreground/50 text-center w-full">
            Los invitados recibirán un enlace para unirse al equipo.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
