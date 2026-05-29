"use client";

import { useState, useEffect } from "react";
import {
  getEntryHistoryBySlot,
  getEntryDiff,
  FIELD_LABELS,
  type EntrySnapshot,
  type EntryDiffItem,
} from "@/lib/entry-history";
import { cn, formatHour } from "@/lib/utils";
import { History, Tag, ChevronDown, ChevronUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// ============================================================
// Types
// ============================================================

interface EntryHistoryViewerProps {
  userId: string;
  orgId: string;
  date: string;
  hour: number;
  className?: string;
}

// ============================================================
// Component
// ============================================================

export function EntryHistoryViewer({
  userId,
  orgId,
  date,
  hour,
  className,
}: EntryHistoryViewerProps) {
  const [snapshots, setSnapshots] = useState<EntrySnapshot[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  useEffect(() => {
    const history = getEntryHistoryBySlot(userId, orgId, date, hour);
    setSnapshots(history);
  }, [userId, orgId, date, hour]);

  if (snapshots.length === 0) return null;

  const diffs = computeAllDiffs(snapshots);

  return (
    <div
      className={cn(
        "border border-border bg-background",
        className
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-accent/30 border-b border-border cursor-pointer hover:bg-accent/50 transition-colors"
      >
        <History className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
          Historial de ediciones
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground ml-auto mr-1">
          {snapshots.length} {snapshots.length === 1 ? "versión" : "versiones"}
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="divide-y divide-border">
          {snapshots.map((snapshot, idx) => {
            const isOriginal = idx === 0;
            const isSelected = selectedVersion === snapshot.version;
            const diffForVersion = diffs.get(snapshot.version) ?? [];

            return (
              <div key={`${snapshot.version}-${snapshot.editedAt}`}>
                {/* Version row */}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedVersion(
                      isSelected ? null : snapshot.version
                    )
                  }
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 text-left cursor-pointer transition-colors",
                    isSelected
                      ? "bg-primary/5"
                      : "hover:bg-accent/20"
                  )}
                >
                  {/* Version badge */}
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums px-1.5 py-0.5 border",
                      isOriginal
                        ? "border-primary/40 text-primary bg-primary/5"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    v{snapshot.version}
                  </span>

                  {isOriginal && (
                    <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary">
                      Original
                    </span>
                  )}

                  {/* Edit type */}
                  <span
                    className={cn(
                      "font-mono text-[9px] tracking-[0.18em] uppercase",
                      snapshot.editType === "created"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {snapshot.editType === "created"
                      ? "Creada"
                      : "Editada"}
                  </span>

                  {/* Timestamp */}
                  <span className="font-mono text-[10px] text-muted-foreground ml-auto tabular-nums">
                    {formatTimestamp(snapshot.editedAt)}
                  </span>

                  {isSelected ? (
                    <ChevronUp className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>

                {/* Expanded detail */}
                {isSelected && (
                  <div className="px-3 pb-3 space-y-2">
                    {/* Snapshot data */}
                    <div className="border border-border divide-y divide-border">
                      <SnapshotRow
                        label="Categoría"
                        value={snapshot.snapshot.category}
                      />
                      <SnapshotRow
                        label="Título"
                        value={snapshot.snapshot.title}
                      />
                      <SnapshotRow
                        label="Descripción"
                        value={snapshot.snapshot.description ?? "(vacío)"}
                      />
                      <SnapshotRow
                        label="Proyecto"
                        value={snapshot.snapshot.project ?? "(vacío)"}
                      />
                      <SnapshotRow
                        label="Ánimo"
                        value={
                          snapshot.snapshot.mood !== null
                            ? String(snapshot.snapshot.mood)
                            : "(vacío)"
                        }
                      />
                      <SnapshotRow
                        label="Energía"
                        value={
                          snapshot.snapshot.energy !== null
                            ? String(snapshot.snapshot.energy)
                            : "(vacío)"
                        }
                      />
                      <SnapshotRow
                        label="Evidencia"
                        value={
                          snapshot.snapshot.proof_urls &&
                          snapshot.snapshot.proof_urls.length > 0
                            ? snapshot.snapshot.proof_urls.join(", ")
                            : "(sin evidencia)"
                        }
                      />
                    </div>

                    {/* Diff against next version */}
                    {diffForVersion.length > 0 && (
                      <div className="space-y-1">
                        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                          Cambios en v{snapshot.version + 1}
                        </span>
                        <div className="border border-border divide-y divide-border">
                          {diffForVersion.map((diff, di) => (
                            <DiffRow key={di} diff={diff} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function SnapshotRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const isEmpty = value === "(vacío)" || value === "(sin evidencia)";
  return (
    <div className="flex items-start gap-2 px-2.5 py-1.5">
      <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground w-24 shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[11px] break-all flex-1",
          isEmpty ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DiffRow({ diff }: { diff: EntryDiffItem }) {
  const fieldLabel = FIELD_LABELS[diff.field] ?? diff.field;
  const isAddition = diff.before === "(vacío)";
  const isRemoval = diff.after === "(vacío)";

  return (
    <div className="px-2.5 py-1.5 space-y-0.5">
      <div className="flex items-center gap-1.5">
        <Tag className="w-3 h-3 text-muted-foreground" />
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
          {fieldLabel}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 pl-4.5">
        {!isAddition && (
          <span className="font-mono text-[10px] text-red-600 dark:text-red-400 break-all">
            - {diff.before}
          </span>
        )}
        {!isRemoval && (
          <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 break-all">
            + {diff.after}
          </span>
        )}
        {isAddition && (
          <span className="font-mono text-[9px] text-muted-foreground">
            (campo agregado)
          </span>
        )}
        {isRemoval && (
          <span className="font-mono text-[9px] text-muted-foreground">
            (campo eliminado)
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatTimestamp(iso: string): string {
  try {
    const d = parseISO(iso);
    return format(d, "d MMM HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

/**
 * Compute diffs between consecutive versions.
 * Returns a map: version -> diffs showing what changed FROM this version TO the next.
 */
function computeAllDiffs(
  snapshots: EntrySnapshot[]
): Map<number, EntryDiffItem[]> {
  const map = new Map<number, EntryDiffItem[]>();
  for (let i = 0; i < snapshots.length - 1; i++) {
    const before = snapshots[i];
    const after = snapshots[i + 1];
    map.set(before.version, getEntryDiff(before, after));
  }
  return map;
}
