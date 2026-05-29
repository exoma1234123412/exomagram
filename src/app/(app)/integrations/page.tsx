"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
 CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter,
} from "@/components/ui/dialog";
import {
 Plug,
 GitBranch,
 MessageSquare,
 Calendar,
 Link2,
 Webhook,
 Key,
 RefreshCw,
 Check,
 X,
 ExternalLink,
 Copy,
 Eye,
 EyeOff,
 Trash2,
 Plus,
 Send,
 Settings,
 Zap,
 BookOpen,
 LayoutList,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────

interface IntegrationConfig {
 github?: {
 username: string;
 token: string;
 repos: string[];
 connected: boolean;
 lastSync: string | null;
 };
 slack?: {
 webhookUrl: string;
 channelName: string;
 connected: boolean;
 lastSync: string | null;
 notifications: {
 flags: boolean;
 closeouts: boolean;
 digests: boolean;
 achievements: boolean;
 };
 };
 webhooks?: {
 url: string;
 secret: string;
 events: string[];
 deliveries: WebhookDelivery[];
 };
 apiKeys?: ApiKey[];
}

interface WebhookDelivery {
 id: string;
 event: string;
 status: number;
 timestamp: string;
 duration: number;
}

interface ApiKey {
 id: string;
 key: string;
 createdAt: string;
 lastUsed: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────

const STORAGE_KEY ="exomagram_integrations";

const WEBHOOK_EVENTS = [
 { value:"entry_created", label:"Entrada creada"},
 { value:"entry_updated", label:"Entrada actualizada"},
 { value:"entry_deleted", label:"Entrada eliminada"},
 { value:"closeout_submitted", label:"Cierre enviado"},
 { value:"flag_raised", label:"Flag levantado"},
 { value:"goal_completed", label:"Objetivo completado"},
 { value:"weekly_digest", label:"Resumen semanal"},
];

const MOCK_DELIVERIES: WebhookDelivery[] = [
 { id:"d1", event:"entry_created", status: 200, timestamp:"2026-05-27T14:32:00Z", duration: 142 },
 { id:"d2", event:"closeout_submitted", status: 200, timestamp:"2026-05-27T12:15:00Z", duration: 98 },
 { id:"d3", event:"flag_raised", status: 500, timestamp:"2026-05-26T18:45:00Z", duration: 3021 },
 { id:"d4", event:"entry_created", status: 200, timestamp:"2026-05-26T16:20:00Z", duration: 115 },
 { id:"d5", event:"weekly_digest", status: 200, timestamp:"2026-05-25T09:00:00Z", duration: 230 },
];

// ─── Helpers ───────────────────────────────────────────────────────

function loadConfig(): IntegrationConfig {
 if (typeof window ==="undefined") return {};
 try {
 const raw = localStorage.getItem(STORAGE_KEY);
 return raw ? JSON.parse(raw) : {};
 } catch {
 return {};
 }
}

function saveConfig(config: IntegrationConfig) {
 localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function generateId(): string {
 return Math.random().toString(36).substring(2, 10);
}

function generateApiKey(): string {
 const chars ="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
 let key ="exo_";
 for (let i = 0; i < 32; i++) {
 key += chars.charAt(Math.floor(Math.random() * chars.length));
 }
 return key;
}

function generateSecret(): string {
 const chars ="abcdef0123456789";
 let secret ="whsec_";
 for (let i = 0; i < 24; i++) {
 secret += chars.charAt(Math.floor(Math.random() * chars.length));
 }
 return secret;
}

function maskToken(token: string): string {
 if (token.length <= 8) return"****";
 return token.substring(0, 4) +"****"+ token.substring(token.length - 4);
}

function formatTimestamp(ts: string): string {
 const d = new Date(ts);
 return d.toLocaleString("es-MX", {
 day:"2-digit",
 month:"short",
 hour:"2-digit",
 minute:"2-digit",
 });
}

// ─── GitHub Config Dialog ──────────────────────────────────────────

function GitHubDialog({
 open,
 onOpenChange,
 config,
 onSave,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 config: IntegrationConfig;
 onSave: (c: IntegrationConfig) => void;
}) {
 const gh = config.github;
 const [username, setUsername] = useState(gh?.username ??"");
 const [token, setToken] = useState(gh?.token ??"");
 const [reposInput, setReposInput] = useState(gh?.repos?.join(",") ??"");
 const [showToken, setShowToken] = useState(false);
 const [testing, setTesting] = useState(false);
 const [testResult, setTestResult] = useState<"ok"|"error"| null>(null);
 const [syncing, setSyncing] = useState(false);

 function handleTest() {
 setTesting(true);
 setTestResult(null);
 setTimeout(() => {
 setTesting(false);
 setTestResult(username && token ?"ok":"error");
 }, 1200);
 }

 function handleSync() {
 setSyncing(true);
 setTimeout(() => setSyncing(false), 1500);
 }

 function handleSave() {
 const repos = reposInput
 .split(",")
 .map((r) => r.trim())
 .filter(Boolean);
 onSave({
 ...config,
 github: {
 username,
 token,
 repos,
 connected: !!(username && token),
 lastSync: new Date().toISOString(),
 },
 });
 onOpenChange(false);
 }

 function handleDisconnect() {
 const next = { ...config };
 delete next.github;
 onSave(next);
 onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <GitBranch className="w-5 h-5"/>
 Configurar GitHub
 </DialogTitle>
 <DialogDescription>
 Conecta tu cuenta de GitHub para capturar commits y PRs como evidencia automatica.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4 py-2">
 <div className="space-y-2">
 <Label htmlFor="gh-username">Usuario de GitHub</Label>
 <Input
 id="gh-username"placeholder="tu-usuario"value={username}
 onChange={(e) => setUsername(e.target.value)}
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="gh-token">Token de acceso personal</Label>
 <div className="flex gap-2">
 <Input
 id="gh-token"type={showToken ?"text":"password"}
 placeholder="ghp_xxxxxxxxxxxx"value={token}
 onChange={(e) => setToken(e.target.value)}
 className="font-mono text-sm"/>
 <Button
 variant="outline"size="icon"onClick={() => setShowToken(!showToken)}
 >
 {showToken ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
 </Button>
 </div>
 <p className="text-xs text-muted-foreground">
 Necesitas permisos: repo, read:user
 </p>
 </div>

 <div className="space-y-2">
 <Label htmlFor="gh-repos">Repositorios (separados por coma)</Label>
 <Input
 id="gh-repos"placeholder="org/repo1, org/repo2"value={reposInput}
 onChange={(e) => setReposInput(e.target.value)}
 />
 </div>

 <div className="flex gap-2">
 <Button
 variant="outline"size="sm"onClick={handleTest}
 disabled={testing || !username || !token}
 className="gap-1.5">
 {testing ? (
 <RefreshCw className="w-3.5 h-3.5 animate-spin"/>
 ) : testResult ==="ok"? (
 <Check className="w-3.5 h-3.5 text-green-600"/>
 ) : testResult ==="error"? (
 <X className="w-3.5 h-3.5 text-red-600"/>
 ) : (
 <Plug className="w-3.5 h-3.5"/>
 )}
 Probar conexion
 </Button>
 {gh?.connected && (
 <Button
 variant="outline"size="sm"onClick={handleSync}
 disabled={syncing}
 className="gap-1.5">
 <RefreshCw className={cn("w-3.5 h-3.5", syncing &&"animate-spin")} />
 Sincronizar ahora
 </Button>
 )}
 </div>
 </div>

 <DialogFooter>
 {gh?.connected && (
 <Button variant="destructive"size="sm"onClick={handleDisconnect}>
 Desconectar
 </Button>
 )}
 <Button size="sm"onClick={handleSave} disabled={!username || !token}>
 Guardar
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

// ─── Slack Config Dialog ───────────────────────────────────────────

function SlackDialog({
 open,
 onOpenChange,
 config,
 onSave,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 config: IntegrationConfig;
 onSave: (c: IntegrationConfig) => void;
}) {
 const sl = config.slack;
 const [webhookUrl, setWebhookUrl] = useState(sl?.webhookUrl ??"");
 const [channelName, setChannelName] = useState(sl?.channelName ??"");
 const [flags, setFlags] = useState(sl?.notifications?.flags ?? true);
 const [closeouts, setCloseouts] = useState(sl?.notifications?.closeouts ?? true);
 const [digests, setDigests] = useState(sl?.notifications?.digests ?? true);
 const [achievements, setAchievements] = useState(sl?.notifications?.achievements ?? false);
 const [testing, setTesting] = useState(false);
 const [testResult, setTestResult] = useState<"ok"|"error"| null>(null);

 function handleTest() {
 setTesting(true);
 setTestResult(null);
 setTimeout(() => {
 setTesting(false);
 setTestResult(webhookUrl.startsWith("https://") ?"ok":"error");
 }, 1200);
 }

 function handleSave() {
 onSave({
 ...config,
 slack: {
 webhookUrl,
 channelName,
 connected: !!webhookUrl,
 lastSync: new Date().toISOString(),
 notifications: { flags, closeouts, digests, achievements },
 },
 });
 onOpenChange(false);
 }

 function handleDisconnect() {
 const next = { ...config };
 delete next.slack;
 onSave(next);
 onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <MessageSquare className="w-5 h-5"/>
 Configurar Slack
 </DialogTitle>
 <DialogDescription>
 Envia digestos diarios, alertas de flags y recordatorios de cierre a tu canal de Slack.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4 py-2">
 <div className="space-y-2">
 <Label htmlFor="slack-webhook">URL del Webhook</Label>
 <Input
 id="slack-webhook"type="url"placeholder="https://hooks.slack.com/services/..."value={webhookUrl}
 onChange={(e) => setWebhookUrl(e.target.value)}
 className="font-mono text-sm"/>
 </div>

 <div className="space-y-2">
 <Label htmlFor="slack-channel">Nombre del canal</Label>
 <Input
 id="slack-channel"placeholder="#equipo-horas"value={channelName}
 onChange={(e) => setChannelName(e.target.value)}
 />
 </div>

 <Separator />

 <div className="space-y-3">
 <Label className="text-sm font-medium">Preferencias de notificacion</Label>

 {[
 { id:"flags", label:"Flags levantados", desc:"Alerta cuando alguien levanta un flag", value: flags, set: setFlags },
 { id:"closeouts", label:"Cierres del dia", desc:"Resumen cuando se envia un cierre", value: closeouts, set: setCloseouts },
 { id:"digests", label:"Digestos diarios", desc:"Resumen automatico del equipo al final del dia", value: digests, set: setDigests },
 { id:"achievements", label:"Logros", desc:"Notificacion de objetivos alcanzados y rachas", value: achievements, set: setAchievements },
 ].map((pref) => (
 <label
 key={pref.id}
 className="flex items-start gap-3 cursor-pointer p-2 hover:bg-accent/40 transition-colors">
 <input
 type="checkbox"checked={pref.value}
 onChange={(e) => pref.set(e.target.checked)}
 className="mt-0.5 h-4 w-4 rounded border-border"/>
 <div>
 <p className="text-sm font-medium">{pref.label}</p>
 <p className="text-xs text-muted-foreground">{pref.desc}</p>
 </div>
 </label>
 ))}
 </div>

 <div className="flex gap-2">
 <Button
 variant="outline"size="sm"onClick={handleTest}
 disabled={testing || !webhookUrl}
 className="gap-1.5">
 {testing ? (
 <RefreshCw className="w-3.5 h-3.5 animate-spin"/>
 ) : testResult ==="ok"? (
 <Check className="w-3.5 h-3.5 text-green-600"/>
 ) : testResult ==="error"? (
 <X className="w-3.5 h-3.5 text-red-600"/>
 ) : (
 <Send className="w-3.5 h-3.5"/>
 )}
 Enviar mensaje de prueba
 </Button>
 </div>
 </div>

 <DialogFooter>
 {sl?.connected && (
 <Button variant="destructive"size="sm"onClick={handleDisconnect}>
 Desconectar
 </Button>
 )}
 <Button size="sm"onClick={handleSave} disabled={!webhookUrl}>
 Guardar
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

// ─── Integration Card ──────────────────────────────────────────────

interface IntegrationCardProps {
 icon: React.ReactNode;
 name: string;
 description: string;
 status:"connected"|"disconnected"|"coming_soon";
 lastSync?: string | null;
 onAction?: () => void;
}

function IntegrationCard({ icon, name, description, status, lastSync, onAction }: IntegrationCardProps) {
 const statusConfig = {
 connected: {
 badge:"Conectado",
 badgeClass:"bg-green-100 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800/50",
 dotClass:"bg-green-500",
 buttonLabel:"Configurar",
 buttonVariant:"outline"as const,
 },
 disconnected: {
 badge:"Desconectado",
 badgeClass:"bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700/50",
 dotClass:"bg-gray-400",
 buttonLabel:"Conectar",
 buttonVariant:"default"as const,
 },
 coming_soon: {
 badge:"Proximamente",
 badgeClass:"bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/50",
 dotClass:"bg-blue-400",
 buttonLabel:"Proximamente",
 buttonVariant:"outline"as const,
 },
 };

 const sc = statusConfig[status];

 return (
 <Card className="relative overflow-hidden">
 <CardContent className="p-5 space-y-4">
 <div className="flex items-start justify-between gap-3">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-primary/10 flex items-center justify-center shrink-0">
 {icon}
 </div>
 <div>
 <h3 className="text-sm font-semibold">{name}</h3>
 <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{description}</p>
 </div>
 </div>
 </div>

 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border", sc.badgeClass)}>
 <span className={cn("w-1.5 h-1.5 rounded-full", sc.dotClass)} />
 {sc.badge}
 </span>
 {lastSync && status ==="connected"&& (
 <span className="text-[10px] text-muted-foreground">
 Sync: {formatTimestamp(lastSync)}
 </span>
 )}
 </div>
 <Button
 variant={sc.buttonVariant}
 size="sm"disabled={status ==="coming_soon"}
 onClick={onAction}
 className="gap-1.5">
 {status ==="connected"&& <Settings className="w-3.5 h-3.5"/>}
 {status ==="disconnected"&& <Plug className="w-3.5 h-3.5"/>}
 {sc.buttonLabel}
 </Button>
 </div>
 </CardContent>
 </Card>
 );
}

// ─── Webhooks Section ──────────────────────────────────────────────

function WebhooksSection({
 config,
 onSave,
}: {
 config: IntegrationConfig;
 onSave: (c: IntegrationConfig) => void;
}) {
 const wh = config.webhooks;
 const [url, setUrl] = useState(wh?.url ??"");
 const [selectedEvents, setSelectedEvents] = useState<string[]>(wh?.events ?? []);
 const [showSecret, setShowSecret] = useState(false);
 const [copied, setCopied] = useState(false);
 const secret = wh?.secret ??"";
 const deliveries = wh?.deliveries?.length ? wh.deliveries : MOCK_DELIVERIES;

 function toggleEvent(ev: string) {
 setSelectedEvents((prev) =>
 prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
 );
 }

 function handleSaveWebhook() {
 const newSecret = secret || generateSecret();
 onSave({
 ...config,
 webhooks: {
 url,
 secret: newSecret,
 events: selectedEvents,
 deliveries: MOCK_DELIVERIES,
 },
 });
 }

 async function copySecret() {
 await navigator.clipboard.writeText(secret ||"");
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 }

 return (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Webhook className="w-5 h-5 text-primary"/>
 Webhooks salientes
 </CardTitle>
 <CardDescription>
 Configura webhooks personalizados para recibir eventos en tiempo real
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-5">
 {/* URL */}
 <div className="space-y-2">
 <Label htmlFor="wh-url">URL del endpoint</Label>
 <Input
 id="wh-url"type="url"placeholder="https://tu-servicio.com/webhook"value={url}
 onChange={(e) => setUrl(e.target.value)}
 className="font-mono text-sm"/>
 </div>

 {/* Events */}
 <div className="space-y-2">
 <Label>Tipos de evento</Label>
 <div className="flex flex-wrap gap-2">
 {WEBHOOK_EVENTS.map((ev) => {
 const active = selectedEvents.includes(ev.value);
 return (
 <button
 key={ev.value}
 type="button"onClick={() => toggleEvent(ev.value)}
 className={cn(
"inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors cursor-pointer",
 active
 ?"bg-primary/10 text-primary border-primary/30":"bg-muted/50 text-muted-foreground border-border hover:bg-accent/60")}
 >
 {active && <Check className="w-3 h-3"/>}
 {ev.label}
 </button>
 );
 })}
 </div>
 </div>

 {/* Secret */}
 {secret && (
 <div className="space-y-2">
 <Label>Token secreto</Label>
 <div className="flex gap-2">
 <Input
 readOnly
 value={showSecret ? secret : maskToken(secret)}
 className="font-mono text-sm"/>
 <Button variant="outline"size="icon"onClick={() => setShowSecret(!showSecret)}>
 {showSecret ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
 </Button>
 <Button variant="outline"size="icon"onClick={copySecret}>
 {copied ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}
 </Button>
 </div>
 <p className="text-xs text-muted-foreground">
 Usa este secreto para verificar las firmas de los webhooks (header X-Exomagram-Signature)
 </p>
 </div>
 )}

 <Button size="sm"onClick={handleSaveWebhook} disabled={!url} className="gap-1.5">
 <Check className="w-3.5 h-3.5"/>
 Guardar webhook
 </Button>

 {/* Recent deliveries */}
 <Separator />

 <div className="space-y-3">
 <h4 className="text-sm font-medium text-muted-foreground">Entregas recientes</h4>
 <div className="space-y-1.5">
 {deliveries.map((d) => (
 <div
 key={d.id}
 className="flex items-center gap-3 px-3 py-2 bg-accent/30 text-sm">
 <span
 className={cn(
"w-2 h-2 rounded-full shrink-0",
 d.status >= 200 && d.status < 300 ?"bg-green-500":"bg-red-500")}
 />
 <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">
 {d.status}
 </span>
 <Badge variant="secondary"className="text-[10px]">
 {WEBHOOK_EVENTS.find((e) => e.value === d.event)?.label ?? d.event}
 </Badge>
 <span className="flex-1"/>
 <span className="text-xs text-muted-foreground tabular-nums">
 {d.duration}ms
 </span>
 <span className="text-xs text-muted-foreground">
 {formatTimestamp(d.timestamp)}
 </span>
 </div>
 ))}
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

// ─── API Keys Section ──────────────────────────────────────────────

function ApiKeysSection({
 config,
 onSave,
}: {
 config: IntegrationConfig;
 onSave: (c: IntegrationConfig) => void;
}) {
 const keys = config.apiKeys ?? [];
 const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
 const [copiedKey, setCopiedKey] = useState<string | null>(null);

 function handleGenerate() {
 const newKey: ApiKey = {
 id: generateId(),
 key: generateApiKey(),
 createdAt: new Date().toISOString(),
 lastUsed: null,
 };
 onSave({ ...config, apiKeys: [...keys, newKey] });
 }

 function handleRevoke(id: string) {
 onSave({ ...config, apiKeys: keys.filter((k) => k.id !== id) });
 setRevealedKeys((prev) => {
 const next = new Set(prev);
 next.delete(id);
 return next;
 });
 }

 function toggleReveal(id: string) {
 setRevealedKeys((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 }

 async function copyKey(id: string, key: string) {
 await navigator.clipboard.writeText(key);
 setCopiedKey(id);
 setTimeout(() => setCopiedKey(null), 2000);
 }

 return (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Key className="w-5 h-5 text-primary"/>
 Llaves de API
 </CardTitle>
 <CardDescription>
 Genera llaves para acceder a la API de Exomagram desde servicios externos
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-5">
 {/* Rate limit info */}
 <div className="flex gap-3 p-3 bg-accent/30">
 <div className="w-9 h-9 bg-blue-500/10 flex items-center justify-center shrink-0">
 <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400"/>
 </div>
 <div>
 <p className="text-sm font-medium">Limites de uso</p>
 <p className="text-xs text-muted-foreground">
 1,000 requests/hora por llave. Entradas: 100 writes/hora. Lecturas: sin limite adicional.
 </p>
 </div>
 </div>

 {/* Existing keys */}
 {keys.length > 0 && (
 <div className="space-y-2">
 {keys.map((k) => {
 const revealed = revealedKeys.has(k.id);
 const isCopied = copiedKey === k.id;

 return (
 <div
 key={k.id}
 className="flex items-center gap-2 p-3 border border-border/50 bg-accent/20">
 <div className="flex-1 min-w-0">
 <p className="font-mono text-sm truncate">
 {revealed ? k.key : maskToken(k.key)}
 </p>
 <div className="flex items-center gap-3 mt-1">
 <span className="text-[10px] text-muted-foreground">
 Creada: {formatTimestamp(k.createdAt)}
 </span>
 {k.lastUsed && (
 <span className="text-[10px] text-muted-foreground">
 Ultimo uso: {formatTimestamp(k.lastUsed)}
 </span>
 )}
 </div>
 </div>
 <Button variant="outline"size="icon-xs"onClick={() => toggleReveal(k.id)}>
 {revealed ? <EyeOff className="w-3 h-3"/> : <Eye className="w-3 h-3"/>}
 </Button>
 <Button variant="outline"size="icon-xs"onClick={() => copyKey(k.id, k.key)}>
 {isCopied ? <Check className="w-3 h-3 text-green-600"/> : <Copy className="w-3 h-3"/>}
 </Button>
 <Button variant="destructive"size="icon-xs"onClick={() => handleRevoke(k.id)}>
 <Trash2 className="w-3 h-3"/>
 </Button>
 </div>
 );
 })}
 </div>
 )}

 {keys.length === 0 && (
 <div className="text-center py-6">
 <Key className="w-8 h-8 text-muted-foreground mx-auto mb-2"/>
 <p className="text-sm text-muted-foreground">No tienes llaves de API activas</p>
 </div>
 )}

 <Button
 variant="outline"size="sm"onClick={handleGenerate}
 className="gap-1.5"disabled={keys.length >= 5}
 >
 <Plus className="w-3.5 h-3.5"/>
 Generar nueva llave
 </Button>
 {keys.length >= 5 && (
 <p className="text-xs text-muted-foreground">
 Maximo 5 llaves activas. Revoca una existente para crear otra.
 </p>
 )}
 </CardContent>
 </Card>
 );
}

// ─── Main Page ─────────────────────────────────────────────────────

export default function IntegrationsPage() {
 const [config, setConfig] = useState<IntegrationConfig>({});
 const [githubOpen, setGithubOpen] = useState(false);
 const [slackOpen, setSlackOpen] = useState(false);
 const [loaded, setLoaded] = useState(false);

 useEffect(() => {
 setConfig(loadConfig());
 setLoaded(true);
 }, []);

 const handleSave = useCallback((next: IntegrationConfig) => {
 setConfig(next);
 saveConfig(next);
 }, []);

 if (!loaded) {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-3">
 <div className="w-10 h-10 bg-primary animate-pulse"/>
 <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
 </div>
 );
 }

 const integrations: IntegrationCardProps[] = [
 {
 icon: <GitBranch className="w-5 h-5 text-primary"/>,
 name:"GitHub",
 description:"Conecta repositorios y captura commits/PRs como evidencia automatica.",
 status: config.github?.connected ?"connected":"disconnected",
 lastSync: config.github?.lastSync,
 onAction: () => setGithubOpen(true),
 },
 {
 icon: <MessageSquare className="w-5 h-5 text-primary"/>,
 name:"Slack",
 description:"Envia digestos diarios, alertas de flags y recordatorios de cierre.",
 status: config.slack?.connected ?"connected":"disconnected",
 lastSync: config.slack?.lastSync,
 onAction: () => setSlackOpen(true),
 },
 {
 icon: <Calendar className="w-5 h-5 text-primary"/>,
 name:"Google Calendar",
 description:"Crea entradas de reuniones automaticamente desde eventos del calendario.",
 status:"coming_soon"as const,
 },
 {
 icon: <LayoutList className="w-5 h-5 text-primary"/>,
 name:"Linear / Jira",
 description:"Vincula issues y tickets a entradas de tiempo para trazabilidad completa.",
 status:"coming_soon"as const,
 },
 {
 icon: <BookOpen className="w-5 h-5 text-primary"/>,
 name:"Notion",
 description:"Sincroniza cierres diarios como paginas de Notion automaticamente.",
 status:"coming_soon"as const,
 },
 {
 icon: <Zap className="w-5 h-5 text-primary"/>,
 name:"Zapier",
 description:"Webhooks personalizados para conectar con cualquier servicio via Zapier.",
 status:"coming_soon"as const,
 },
 ];

 return (
 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
 <Plug className="w-6 h-6 text-primary"/>
 Integraciones
 </h1>
 <p className="text-muted-foreground text-sm">
 Conecta tus herramientas favoritas para automatizar tu flujo de trabajo
 </p>
 </div>

 {/* Connected summary */}
 {(config.github?.connected || config.slack?.connected) && (
 <div className="mb-6 flex flex-wrap gap-3">
 {config.github?.connected && (
 <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/50">
 <span className="w-1.5 h-1.5 rounded-full bg-green-500"/>
 <GitBranch className="w-3.5 h-3.5 text-green-700 dark:text-green-400"/>
 <span className="text-xs font-medium text-green-700 dark:text-green-400">
 GitHub conectado
 </span>
 {config.github.username && (
 <span className="text-xs text-green-600/70 dark:text-green-500/70">
 @{config.github.username}
 </span>
 )}
 </div>
 )}
 {config.slack?.connected && (
 <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/50">
 <span className="w-1.5 h-1.5 rounded-full bg-green-500"/>
 <MessageSquare className="w-3.5 h-3.5 text-green-700 dark:text-green-400"/>
 <span className="text-xs font-medium text-green-700 dark:text-green-400">
 Slack conectado
 </span>
 {config.slack.channelName && (
 <span className="text-xs text-green-600/70 dark:text-green-500/70">
 {config.slack.channelName}
 </span>
 )}
 </div>
 )}
 </div>
 )}

 {/* Integrations grid */}
 <section className="mb-10">
 <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
 <Link2 className="w-4 h-4 text-muted-foreground"/>
 Integraciones disponibles
 </h2>
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {integrations.map((integration) => (
 <IntegrationCard key={integration.name} {...integration} />
 ))}
 </div>
 </section>

 {/* Webhooks & API Keys */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <WebhooksSection config={config} onSave={handleSave} />
 <ApiKeysSection config={config} onSave={handleSave} />
 </div>

 {/* Dialogs */}
 <GitHubDialog
 open={githubOpen}
 onOpenChange={setGithubOpen}
 config={config}
 onSave={handleSave}
 />
 <SlackDialog
 open={slackOpen}
 onOpenChange={setSlackOpen}
 config={config}
 onSave={handleSave}
 />
 </div>
 );
}
