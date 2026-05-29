"use client";

import type { TimeEntry, Profile, EntryReaction } from "@/lib/types/database";
import {
  CATEGORIES,
  VERIFICATION_STATUS,
  MOOD_LABELS,
  ENERGY_LABELS,
} from "@/lib/constants";
import { cn, formatHour } from "@/lib/utils";
import {
  Clock,
  Calendar,
  FolderKanban,
  Shield,
  ShieldX,
  ExternalLink,
  Brain,
  Zap,
  Timer,
  FileText,
  Hash,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  PenLine,
  RefreshCw,
} from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import {
  analyzeEntryQuality,
  EntryQualityBreakdown,
  EntryQualityBadge,
} from "./entry-quality-gate";

// ============================================================
// Types
// ============================================================

interface EntryDetailCardProps {
  entry: TimeEntry;
  profile?: Profile | null;
  reactions?: EntryReaction[];
  recentDescriptions?: string[];
  className?: string;
}

// ============================================================
// Helpers
// ============================================================

function DataRow({
  label,
  value,
  icon,
  mono = false,
  warn = false,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  mono?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 border-b border-border last:border-b-0">
      <div className="flex items-center gap-1.5 w-36 shrink-0">
        {icon && <span className="text-muted-foreground/40">{icon}</span>}
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "flex-1 text-[12px]",
          mono && "font-mono tabular-nums",
          warn && "text-destructive"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 py-1.5 bg-accent/30 border-b border-border">
      <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
        {title}
      </span>
    </div>
  );
}

// ============================================================
// Component
// ============================================================

export function EntryDetailCard({
  entry,
  profile,
  reactions = [],
  recentDescriptions = [],
  className,
}: EntryDetailCardProps) {
  const cat = CATEGORIES[entry.category];
  const verification = VERIFICATION_STATUS[entry.verification_status ?? "unverified"];
  const hasProof = entry.proof_urls && entry.proof_urls.length > 0;
  const report = analyzeEntryQuality(entry, recentDescriptions);

  // Compute response time: minutes between hour end and logged_at
  const hourEnd = new Date(`${entry.date}T${String(entry.hour + 1).padStart(2, "0")}:00:00`);
  const loggedAt = parseISO(entry.logged_at);
  const responseMinutes = differenceInMinutes(loggedAt, hourEnd);

  // Description stats
  const descWords = entry.description
    ? entry.description.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const descChars = entry.description ? entry.description.trim().length : 0;

  // Reaction summary
  const reactionCounts: Record<string, number> = {};
  for (const r of reactions) {
    reactionCounts[r.reaction] = (reactionCounts[r.reaction] ?? 0) + 1;
  }

  return (
    <div className={cn("border border-border bg-card", className)}>
      {/* ============ HEADER ============ */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-accent/20">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
            {cat.emoji} {entry.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <EntryQualityBadge entry={entry} recentDescriptions={recentDescriptions} showScore />
          <span
            className={cn(
              "font-mono text-[10px] font-bold px-1.5 py-0.5 border",
              cat.bgColor,
              cat.color
            )}
          >
            {cat.label.toUpperCase()}
          </span>
        </div>
      </div>

      {/* ============ CORE DATA ============ */}
      <SectionHeader title="Datos de entrada" />

      <DataRow
        label="Fecha"
        icon={<Calendar className="w-3 h-3" />}
        value={format(parseISO(entry.date), "EEEE d 'de' MMMM yyyy", { locale: es })}
      />
      <DataRow
        label="Hora"
        icon={<Clock className="w-3 h-3" />}
        value={formatHour(entry.hour)}
        mono
      />
      <DataRow
        label="Categoria"
        value={
          <span className={cn("font-mono text-[11px] font-bold", cat.color)}>
            {cat.emoji} {cat.label}
          </span>
        }
      />

      {entry.description && (
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="w-3 h-3 text-muted-foreground/40" />
            <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/40">
              Descripcion
            </span>
          </div>
          <p className="text-[12px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {entry.description}
          </p>
        </div>
      )}

      {entry.project && (
        <DataRow
          label="Proyecto"
          icon={<FolderKanban className="w-3 h-3" />}
          value={
            <span className="font-mono text-[11px] font-bold text-primary">
              {entry.project}
            </span>
          }
        />
      )}

      {/* ============ PROOF ============ */}
      <SectionHeader title="Evidencia" />

      <DataRow
        label="Estado"
        icon={hasProof ? <Shield className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
        value={
          <span
            className={cn(
              "font-mono text-[11px] font-bold",
              hasProof
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {hasProof
              ? `${entry.proof_urls!.length} enlace${entry.proof_urls!.length > 1 ? "s" : ""}`
              : "SIN EVIDENCIA"}
          </span>
        }
      />

      {hasProof &&
        entry.proof_urls!.map((url, i) => {
          let hostname = "link";
          try {
            hostname = new URL(url).hostname;
          } catch {
            /* noop */
          }
          return (
            <DataRow
              key={i}
              label={`Link ${i + 1}`}
              icon={<ExternalLink className="w-3 h-3" />}
              value={
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-primary hover:underline truncate block"
                >
                  {hostname} &rarr;
                </a>
              }
            />
          );
        })}

      {/* ============ ESTADO Y ANIMO ============ */}
      <SectionHeader title="Estado del operador" />

      <DataRow
        label="Animo"
        icon={<Brain className="w-3 h-3" />}
        value={
          entry.mood !== null ? (
            <span className="font-mono text-[11px]">
              {entry.mood}/5 &mdash; {MOOD_LABELS[entry.mood]}
            </span>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground/40">NO REPORTADO</span>
          )
        }
        mono
      />
      <DataRow
        label="Energia"
        icon={<Zap className="w-3 h-3" />}
        value={
          entry.energy !== null ? (
            <span className="font-mono text-[11px]">
              {entry.energy}/5 &mdash; {ENERGY_LABELS[entry.energy]}
            </span>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground/40">NO REPORTADO</span>
          )
        }
        mono
      />

      {/* ============ TIMING ============ */}
      <SectionHeader title="Temporalidad" />

      <DataRow
        label="Tardia"
        icon={<AlertTriangle className="w-3 h-3" />}
        value={
          entry.is_late ? (
            <span className="font-mono text-[11px] text-destructive font-bold">
              SI &mdash; {entry.minutes_late} min tarde
            </span>
          ) : (
            <span className="font-mono text-[11px] text-green-600 dark:text-green-400">
              NO &mdash; A tiempo
            </span>
          )
        }
        warn={entry.is_late}
      />
      <DataRow
        label="Logged at"
        icon={<Timer className="w-3 h-3" />}
        value={format(loggedAt, "HH:mm:ss 'hrs' — dd/MM/yyyy")}
        mono
      />
      <DataRow
        label="Response time"
        value={
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              responseMinutes > 60
                ? "text-red-500"
                : responseMinutes > 30
                  ? "text-amber-500"
                  : "text-green-500"
            )}
          >
            {responseMinutes > 0 ? `+${responseMinutes}` : responseMinutes} min despues de
            finalizar la hora
          </span>
        }
        mono
      />

      {/* ============ TEXT ANALYSIS ============ */}
      <SectionHeader title="Analisis de texto" />

      <DataRow
        label="Titulo chars"
        icon={<Hash className="w-3 h-3" />}
        value={entry.title.trim().length}
        mono
      />
      <DataRow
        label="Desc palabras"
        icon={<MessageSquare className="w-3 h-3" />}
        value={descWords}
        mono
      />
      <DataRow
        label="Desc chars"
        icon={<Hash className="w-3 h-3" />}
        value={descChars}
        mono
      />
      {report.details.descriptionSimilarity > 0 && (
        <DataRow
          label="Similitud"
          value={
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums",
                report.details.suspiciousCopypaste && "text-destructive font-bold"
              )}
            >
              {Math.round(report.details.descriptionSimilarity * 100)}%
              {report.details.suspiciousCopypaste && " COPY-PASTE DETECTADO"}
            </span>
          }
          warn={report.details.suspiciousCopypaste}
          mono
        />
      )}

      {/* ============ VERIFICATION ============ */}
      <SectionHeader title="Verificacion" />

      <DataRow
        label="Estado"
        icon={<CheckCircle2 className="w-3 h-3" />}
        value={
          <span
            className={cn("font-mono text-[11px] font-bold", verification.color)}
          >
            {verification.icon} {verification.label.toUpperCase()}
          </span>
        }
      />
      {entry.verified_by && (
        <DataRow
          label="Verificado por"
          value={
            <span className="font-mono text-[11px]">{entry.verified_by}</span>
          }
        />
      )}
      {entry.verification_note && (
        <DataRow
          label="Nota"
          icon={<PenLine className="w-3 h-3" />}
          value={
            <span className="font-mono text-[11px] text-muted-foreground">
              {entry.verification_note}
            </span>
          }
        />
      )}

      {/* ============ REACTIONS ============ */}
      {reactions.length > 0 && (
        <>
          <SectionHeader title="Reacciones" />
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-3">
              {Object.entries(reactionCounts).map(([type, count]) => (
                <span key={type} className="font-mono text-[11px] tabular-nums">
                  {type}: <span className="font-bold">{count}</span>
                </span>
              ))}
              <span className="font-mono text-[10px] text-muted-foreground/40 ml-auto">
                TOTAL: {reactions.length}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ============ TIMESTAMPS ============ */}
      <SectionHeader title="Metadatos del sistema" />

      <DataRow
        label="Created"
        icon={<Calendar className="w-3 h-3" />}
        value={format(parseISO(entry.created_at), "dd/MM/yyyy HH:mm:ss")}
        mono
      />
      <DataRow
        label="Updated"
        icon={<RefreshCw className="w-3 h-3" />}
        value={
          <span className="font-mono text-[11px] tabular-nums">
            {format(parseISO(entry.updated_at), "dd/MM/yyyy HH:mm:ss")}
            {entry.created_at !== entry.updated_at && (
              <span className="text-amber-500 ml-2">EDITADO</span>
            )}
          </span>
        }
        mono
      />
      <DataRow
        label="ID"
        value={
          <span className="font-mono text-[10px] text-muted-foreground/40 select-all">
            {entry.id}
          </span>
        }
        mono
      />

      {/* ============ QUALITY GATE ============ */}
      <SectionHeader title="Quality Gate — Desglose" />
      <EntryQualityBreakdown report={report} />
    </div>
  );
}
