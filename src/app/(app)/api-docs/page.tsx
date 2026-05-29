"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
 Card,
 CardContent,
 CardHeader,
 CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
 BookOpen,
 Key,
 Copy,
 Check,
 ExternalLink,
 Lock,
 List,
 Plus,
 BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────

interface Param {
 name: string;
 type: string;
 required: boolean;
 description: string;
}

interface EndpointDef {
 method:"GET"|"POST";
 path: string;
 description: string;
 params: Param[];
 exampleRequest: string;
 exampleResponse: string;
}

// ─── Endpoints ────────────────────────────────────────────────────

const BASE_URL ="https://tu-dominio.com";

const endpoints: EndpointDef[] = [
 {
 method:"GET",
 path:"/api/v1/entries",
 description:
"Lista las entradas de tiempo de tu organización. Soporta filtros por fecha, usuario, categoría y proyecto.",
 params: [
 {
 name:"date",
 type:"string",
 required: false,
 description:"Fecha en formato YYYY-MM-DD",
 },
 {
 name:"user_id",
 type:"string",
 required: false,
 description:"UUID del usuario a filtrar",
 },
 {
 name:"category",
 type:"string",
 required: false,
 description:
"Categoría: deep_work, meeting, review, admin, planning, learning, break, blocked",
 },
 {
 name:"project",
 type:"string",
 required: false,
 description:"Nombre del proyecto",
 },
 {
 name:"limit",
 type:"number",
 required: false,
 description:"Máximo de resultados (default 50, max 200)",
 },
 {
 name:"offset",
 type:"number",
 required: false,
 description:"Desplazamiento para paginación (default 0)",
 },
 ],
 exampleRequest:`curl -X GET"${BASE_URL}/api/v1/entries?date=2026-05-27&limit=10"\\
 -H"Authorization: Bearer exo_tu_api_key_aqui"`,
 exampleResponse: JSON.stringify(
 {
 data: [
 {
 id:"uuid-123",
 user_id:"uuid-456",
 org_id:"uuid-789",
 date:"2026-05-27",
 hour: 9,
 category:"deep_work",
 title:"Implementación de API REST",
 description:"Endpoints de entradas y estadísticas",
 project:"exomagram-api",
 proof_urls: ["https://github.com/org/repo/pull/42"],
 verification_status:"unverified",
 is_late: false,
 created_at:"2026-05-27T09:30:00Z",
 },
 ],
 total: 1,
 limit: 10,
 offset: 0,
 },
 null,
 2
 ),
 },
 {
 method:"POST",
 path:"/api/v1/entries",
 description:
"Crea una nueva entrada de tiempo. El usuario debe pertenecer a la organización asociada a la API key.",
 params: [
 {
 name:"user_id",
 type:"string",
 required: true,
 description:"UUID del usuario",
 },
 {
 name:"date",
 type:"string",
 required: true,
 description:"Fecha en formato YYYY-MM-DD",
 },
 {
 name:"hour",
 type:"number",
 required: true,
 description:"Hora del día (0-23)",
 },
 {
 name:"category",
 type:"string",
 required: true,
 description:
"deep_work, meeting, review, admin, planning, learning, break, blocked",
 },
 {
 name:"title",
 type:"string",
 required: true,
 description:"Título de la entrada",
 },
 {
 name:"description",
 type:"string",
 required: false,
 description:"Descripción detallada",
 },
 {
 name:"project",
 type:"string",
 required: false,
 description:"Nombre del proyecto",
 },
 {
 name:"proof_urls",
 type:"string[]",
 required: false,
 description:"URLs de evidencia (PRs, commits, screenshots)",
 },
 ],
 exampleRequest:`curl -X POST"${BASE_URL}/api/v1/entries"\\
 -H"Authorization: Bearer exo_tu_api_key_aqui"\\
 -H"Content-Type: application/json"\\
 -d '{
"user_id":"uuid-456",
"date":"2026-05-27",
"hour": 10,
"category":"deep_work",
"title":"Revisión de código del módulo de pagos",
"description":"Code review del PR #42",
"project":"payments",
"proof_urls": ["https://github.com/org/repo/pull/42"]
 }'`,
 exampleResponse: JSON.stringify(
 {
 data: {
 id:"uuid-new",
 user_id:"uuid-456",
 org_id:"uuid-789",
 date:"2026-05-27",
 hour: 10,
 category:"deep_work",
 title:"Revisión de código del módulo de pagos",
 description:"Code review del PR #42",
 project:"payments",
 proof_urls: ["https://github.com/org/repo/pull/42"],
 verification_status:"unverified",
 is_late: false,
 minutes_late: 0,
 created_at:"2026-05-27T10:05:00Z",
 },
 },
 null,
 2
 ),
 },
 {
 method:"GET",
 path:"/api/v1/stats",
 description:
"Obtiene estadísticas del equipo para un período. Incluye horas totales, tasa de evidencia, Trust Score promedio y número de miembros.",
 params: [
 {
 name:"date",
 type:"string",
 required: false,
 description:"Fecha de referencia (default: hoy)",
 },
 {
 name:"period",
 type:"string",
 required: false,
 description:"Período: day, week, month (default: day)",
 },
 ],
 exampleRequest:`curl -X GET"${BASE_URL}/api/v1/stats?period=week&date=2026-05-27"\\
 -H"Authorization: Bearer exo_tu_api_key_aqui"`,
 exampleResponse: JSON.stringify(
 {
 data: {
 period:"week",
 start_date:"2026-05-25",
 end_date:"2026-05-31",
 total_hours: 142,
 avg_proof_rate: 78,
 avg_trust_score: 85,
 member_count: 6,
 entries_count: 142,
 },
 },
 null,
 2
 ),
 },
];

// ─── Copy Button ──────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
 const [copied, setCopied] = useState(false);

 const handleCopy = useCallback(async () => {
 await navigator.clipboard.writeText(text);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 }, [text]);

 return (
 <Button
 variant="ghost"size="icon"className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-foreground"onClick={handleCopy}
 >
 {copied ? (
 <Check className="w-3.5 h-3.5 text-green-500"/>
 ) : (
 <Copy className="w-3.5 h-3.5"/>
 )}
 </Button>
 );
}

// ─── Method Badge ─────────────────────────────────────────────────

function MethodBadge({ method }: { method:"GET"|"POST"}) {
 return (
 <span
 className={cn(
"inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono tracking-wide",
 method ==="GET"?"bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400":"bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400")}
 >
 {method}
 </span>
 );
}

// ─── Endpoint Card ────────────────────────────────────────────────

function EndpointCard({ endpoint }: { endpoint: EndpointDef }) {
 return (
 <Card className="transition-all duration-300 hover:border-primary/30 overflow-hidden">
 <CardHeader className="pb-3">
 <CardTitle className="flex items-center gap-3 text-base">
 <MethodBadge method={endpoint.method} />
 <code className="font-mono text-sm">{endpoint.path}</code>
 </CardTitle>
 <p className="text-sm text-muted-foreground mt-1">
 {endpoint.description}
 </p>
 </CardHeader>
 <CardContent className="space-y-5">
 {/* Parameters table */}
 <div>
 <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
 Parámetros
 </h4>
 <div className="border border-border/50 overflow-hidden">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-accent/40">
 <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
 Nombre
 </th>
 <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
 Tipo
 </th>
 <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">
 Requerido
 </th>
 <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
 Descripción
 </th>
 </tr>
 </thead>
 <tbody>
 {endpoint.params.map((param) => (
 <tr
 key={param.name}
 className="border-t border-border/30 hover:bg-accent/20 transition-colors">
 <td className="px-3 py-2">
 <code className="font-mono text-xs bg-accent/50 px-1.5 py-0.5 rounded">
 {param.name}
 </code>
 </td>
 <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
 {param.type}
 </td>
 <td className="px-3 py-2 hidden sm:table-cell">
 {param.required ? (
 <Badge
 variant="destructive"className="text-[10px] px-1.5 py-0">
 Sí
 </Badge>
 ) : (
 <span className="text-xs text-muted-foreground">
 No
 </span>
 )}
 </td>
 <td className="px-3 py-2 text-xs text-muted-foreground">
 {param.description}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 {/* Example request */}
 <div>
 <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
 Ejemplo de petición
 </h4>
 <div className="relative bg-zinc-950 dark:bg-zinc-900 p-4 overflow-x-auto">
 <CopyButton text={endpoint.exampleRequest} />
 <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed pr-8">
 {endpoint.exampleRequest}
 </pre>
 </div>
 </div>

 {/* Example response */}
 <div>
 <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
 Ejemplo de respuesta
 </h4>
 <div className="relative bg-zinc-950 dark:bg-zinc-900 p-4 overflow-x-auto max-h-72 overflow-y-auto">
 <CopyButton text={endpoint.exampleResponse} />
 <pre className="text-xs text-zinc-300 font-mono whitespace-pre leading-relaxed pr-8">
 {endpoint.exampleResponse}
 </pre>
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function ApiDocsPage() {
 return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
 {/* Header */}
 <div className="mb-8">
 <div className="flex items-center gap-3 mb-2">
 <h1 className="text-xl font-mono font-bold tracking-tight uppercase flex items-center gap-2">
 <BookOpen className="w-6 h-6 text-primary"/>
 API de Exomagram
 </h1>
 <Badge
 variant="secondary"className="font-mono text-xs px-2 py-0.5">
 v1
 </Badge>
 </div>
 <p className="text-muted-foreground text-sm">
 API REST pública para integrar Exomagram con tus herramientas y
 automatizaciones.
 </p>
 </div>

 {/* Auth section */}
 <Card className="mb-8 transition-all duration-300 hover:border-primary/30">
 <CardHeader className="pb-3">
 <CardTitle className="flex items-center gap-2 text-base">
 <Lock className="w-4 h-4 text-primary"/>
 Autenticación
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <p className="text-sm text-muted-foreground">
 Usa tu API key como Bearer token en el header{" "}
 <code className="font-mono bg-accent/50 px-1.5 py-0.5 rounded text-xs">
 Authorization
 </code>{" "}
 de cada petición.
 </p>

 <div className="relative bg-zinc-950 dark:bg-zinc-900 p-4">
 <CopyButton text='Authorization: Bearer exo_tu_api_key_aqui' />
 <pre className="text-xs text-zinc-300 font-mono pr-8">
 Authorization: Bearer exo_tu_api_key_aqui
 </pre>
 </div>

 <div className="flex flex-wrap gap-4 text-sm">
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full bg-emerald-500"/>
 <span className="text-muted-foreground">
 <code className="font-mono text-xs">read</code> — Consultar
 entradas y estadísticas
 </span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full bg-blue-500"/>
 <span className="text-muted-foreground">
 <code className="font-mono text-xs">write</code> — Crear
 entradas
 </span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full bg-amber-500"/>
 <span className="text-muted-foreground">
 <code className="font-mono text-xs">admin</code> — Acceso
 completo
 </span>
 </div>
 </div>

 <Separator />

 <div className="flex items-center gap-2">
 <Key className="w-4 h-4 text-muted-foreground"/>
 <span className="text-sm text-muted-foreground">
 Genera tu API key en
 </span>
 <Link href="/integrations">
 <Button variant="outline"size="sm"className="gap-1.5 h-7">
 <ExternalLink className="w-3 h-3"/>
 Integraciones
 </Button>
 </Link>
 </div>
 </CardContent>
 </Card>

 {/* Base URL */}
 <div className="mb-8 flex items-center gap-3 p-3 bg-accent/40">
 <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
 Base URL
 </span>
 <code className="font-mono text-sm">
 {typeof window !=="undefined"? window.location.origin
 :"https://tu-dominio.com"}
 </code>
 </div>

 {/* Endpoints */}
 <div className="mb-6">
 <h2 className="text-lg font-semibold flex items-center gap-2 mb-1">
 <List className="w-5 h-5 text-muted-foreground"/>
 Endpoints
 </h2>
 <p className="text-sm text-muted-foreground mb-4">
 Todos los endpoints requieren autenticación con API key.
 </p>
 </div>

 {/* Endpoint index */}
 <div className="mb-8 border border-border/50 bg-accent/20 p-4 space-y-2">
 {endpoints.map((ep) => (
 <a
 key={`${ep.method}-${ep.path}`}
 href={`#${ep.method.toLowerCase()}-${ep.path.replace(/\//g,"-").slice(1)}`}
 className="flex items-center gap-3 px-3 py-2 hover:bg-accent/60 transition-colors">
 <MethodBadge method={ep.method} />
 <code className="font-mono text-sm">{ep.path}</code>
 <span className="flex-1"/>
 {ep.method ==="GET"&& ep.path.includes("entries") && (
 <List className="w-3.5 h-3.5 text-muted-foreground"/>
 )}
 {ep.method ==="POST"&& (
 <Plus className="w-3.5 h-3.5 text-muted-foreground"/>
 )}
 {ep.path.includes("stats") && (
 <BarChart3 className="w-3.5 h-3.5 text-muted-foreground"/>
 )}
 </a>
 ))}
 </div>

 {/* Endpoint cards */}
 <div className="space-y-6">
 {endpoints.map((ep) => (
 <div
 key={`${ep.method}-${ep.path}`}
 id={`${ep.method.toLowerCase()}-${ep.path.replace(/\//g,"-").slice(1)}`}
 >
 <EndpointCard endpoint={ep} />
 </div>
 ))}
 </div>

 {/* Error codes */}
 <Card className="mt-8 transition-all duration-300 hover:border-primary/30">
 <CardHeader className="pb-3">
 <CardTitle className="text-base">Códigos de error</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="border border-border/50 overflow-hidden">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-accent/40">
 <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
 Código
 </th>
 <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
 Significado
 </th>
 </tr>
 </thead>
 <tbody>
 {[
 ["400","Petición inválida — faltan campos requeridos o valores incorrectos"],
 ["401","No autorizado — API key faltante o inválida"],
 ["403","Prohibido — la API key no tiene permisos suficientes"],
 ["500","Error interno del servidor"],
 ].map(([code, desc]) => (
 <tr
 key={code}
 className="border-t border-border/30 hover:bg-accent/20 transition-colors">
 <td className="px-3 py-2">
 <code className="font-mono text-xs font-bold tabular-nums">
 {code}
 </code>
 </td>
 <td className="px-3 py-2 text-xs text-muted-foreground">
 {desc}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </CardContent>
 </Card>

 {/* Rate limits */}
 <div className="mt-6 p-4 bg-accent/40">
 <h3 className="text-sm font-semibold mb-1">Límites de uso</h3>
 <p className="text-xs text-muted-foreground">
 1,000 peticiones por hora por API key. Las escrituras están limitadas a
 100 por hora. Los headers{" "}
 <code className="font-mono bg-accent/50 px-1 py-0.5 rounded">
 X-RateLimit-Remaining
 </code>{" "}
 y{" "}
 <code className="font-mono bg-accent/50 px-1 py-0.5 rounded">
 X-RateLimit-Reset
 </code>{" "}
 indican tu cuota actual.
 </p>
 </div>

 {/* Footer CTA */}
 <div className="mt-8 text-center">
 <Link href="/integrations">
 <Button className="gap-2 bg-primary">
 <Key className="w-4 h-4"/>
 Generar API Key
 </Button>
 </Link>
 <p className="text-xs text-muted-foreground mt-2">
 Administra tus llaves de API desde la página de Integraciones
 </p>
 </div>
 </div>
 );
}
