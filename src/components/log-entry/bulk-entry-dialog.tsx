"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
 CATEGORIES,
 WORK_HOURS,
 MAX_BACKFILL_HOURS,
 MIN_TITLE_LENGTH,
} from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn, formatHour } from "@/lib/utils";
import { Layers, Shield } from "lucide-react";
import { updateStreakOnEntry } from "@/lib/streak-utils";
import { computeCompleteness, detectDeviceType } from "@/lib/entry-metadata";

interface BulkEntryDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
}

export function BulkEntryDialog({ open, onOpenChange }: BulkEntryDialogProps) {
 const now = new Date();
 const [category, setCategory] = useState<WorkCategory |"">("");
 const [title, setTitle] = useState("");
 const [description, setDescription] = useState("");
 const [startHour, setStartHour] = useState<string>(
 Math.max(7, now.getHours() - 3).toString()
 );
 const [endHour, setEndHour] = useState<string>(
 Math.min(18, now.getHours()).toString()
 );
 const [date, setDate] = useState(now.toISOString().split("T")[0]);
 const [project, setProject] = useState("");
 const [proofUrls, setProofUrls] = useState("");
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [result, setResult] = useState<string | null>(null);

 // Reset form state when dialog closes
 useEffect(() => {
 if (!open) {
 const now = new Date();
 setCategory("");
 setTitle("");
 setDescription("");
 setStartHour(Math.max(7, now.getHours() - 3).toString());
 setEndHour(Math.min(18, now.getHours()).toString());
 setDate(now.toISOString().split("T")[0]);
 setProject("");
 setProofUrls("");
 setError(null);
 setResult(null);
 }
 }, [open]);

 const start = parseInt(startHour);
 const end = parseInt(endHour);
 const hoursCount = end >= start ? end - start + 1 : 0;
 const hasProof = proofUrls.trim().length > 0;
 const titleTooShort = title.length > 0 && title.length < MIN_TITLE_LENGTH;

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!category || hoursCount <= 0) return;
 if (title.length < MIN_TITLE_LENGTH) {
 setError(`El titulo debe tener al menos ${MIN_TITLE_LENGTH} caracteres.`);
 return;
 }
 setLoading(true);
 setError(null);
 setResult(null);

 const supabase = createClient();
 const {
 data: { user },
 } = await supabase.auth.getUser();

 if (!user) {
 setError("No estas autenticado");
 setLoading(false);
 return;
 }

 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id")
 .eq("user_id", user.id)
 .limit(1)
 .single();

 if (!membership) {
 setError("No perteneces a ninguna organizacion");
 setLoading(false);
 return;
 }

 const proofArray = proofUrls
 .split("\n")
 .map((l) => l.trim())
 .filter(Boolean);

 const entries = [] as Array<Record<string, unknown>>;
 for (let h = start; h <= end; h++) {
 const entryDate = new Date(
`${date}T${String(h + 1).padStart(2,"0")}:00:00`);
 const diff = (now.getTime() - entryDate.getTime()) / 1000 / 60;
 const isLate = diff > 60;
 const minutesLate = Math.max(0, Math.round(diff - 60));

 const { fieldsFilled, completenessScore } = computeCompleteness({
   category, title, description: description || null,
   proof_urls: proofArray.length > 0 ? proofArray : null,
   project: project.trim() || null,
 });
 entries.push({
 user_id: user.id,
 org_id: membership.org_id,
 date,
 hour: h,
 category: category as WorkCategory,
 title,
 description: description || null,
 mood: null,
 energy: null,
 links: null,
 project: project.trim() || null,
 proof_urls: proofArray.length > 0 ? proofArray : null,
 is_late: isLate,
 minutes_late: minutesLate,
 logged_at: new Date().toISOString(),
 verification_status:"unverified",
 // V15 — Entry metadata
 entry_source: "bulk" as const,
 fields_filled: fieldsFilled,
 completeness_score: completenessScore,
 device_type: detectDeviceType(),
 });
 }

 const { error: insertError } = await supabase
 .from("time_entries")
 .upsert(entries, { onConflict:"user_id,org_id,date,hour"});

 if (insertError) {
 setError(insertError.message);
 } else {
 updateStreakOnEntry(user.id, membership.org_id, date);
 // V15 — Auto-enrich bulk entries (fire-and-forget)
 fetch("/api/ai/enrich", {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ org_id: membership.org_id, date, user_id: user.id }),
 }).catch(() => {});
 setResult(`${hoursCount} horas registradas (${formatHour(start)} - ${formatHour(end)})`);
 setCategory("");
 setTitle("");
 setDescription("");
 setProject("");
 setProofUrls("");
 }
 setLoading(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="text-xl font-bold flex items-center gap-2.5 tracking-tight">
 <Layers className="w-5 h-5 text-primary"/>
 Registrar bloque de horas
 </DialogTitle>
 </DialogHeader>

 <form onSubmit={handleSubmit} className="space-y-5">
 {/* Date */}
 <div className="space-y-2">
 <Label>Fecha</Label>
 <Input
 type="date"value={date}
 onChange={(e) => setDate(e.target.value)}
 max={now.toISOString().split("T")[0]}
 />
 </div>

 {/* Hour range */}
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-2">
 <Label>Desde</Label>
 <Select value={startHour} onValueChange={(v) => v && setStartHour(v)}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {WORK_HOURS.map((h) => (
 <SelectItem key={h} value={h.toString()}>
 {formatHour(h)}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label>Hasta</Label>
 <Select value={endHour} onValueChange={(v) => v && setEndHour(v)}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {WORK_HOURS.filter((h) => h >= start).map((h) => (
 <SelectItem key={h} value={h.toString()}>
 {formatHour(h)}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>

 {hoursCount > 0 && (
 <Badge variant="outline"className="text-xs">
 {hoursCount} hora{hoursCount > 1 ?"s":""}: {formatHour(start)} - {formatHour(end)}
 </Badge>
 )}

 {/* Category */}
 <div className="space-y-2">
 <Label>Categoría</Label>
 <div className="grid grid-cols-4 gap-2">
 {(Object.keys(CATEGORIES) as WorkCategory[]).map((key) => {
 const cat = CATEGORIES[key];
 return (
 <button
 key={key}
 type="button"onClick={() => setCategory(key)}
 className={cn(
"flex flex-col items-center gap-1.5 p-3 border-2 text-xs font-semibold transition-all duration-200",
 category === key
 ?"border-primary bg-primary/5 shadow-primary/10 scale-[1.02]":"border-transparent bg-accent/50 hover:bg-accent hover:scale-[1.01]")}
 >
 <span className="text-lg">{cat.emoji}</span>
 <span className="truncate w-full text-center">{cat.label}</span>
 </button>
 );
 })}
 </div>
 </div>

 {/* Title */}
 <div className="space-y-2">
 <Label htmlFor="bulk-title">
 ¿Qué hiciste?{""}
 <span className="text-muted-foreground text-xs">
 (mín. {MIN_TITLE_LENGTH} caracteres)
 </span>
 </Label>
 <Input
 id="bulk-title"placeholder="Se aplicara a todas las horas del bloque"value={title}
 onChange={(e) => setTitle(e.target.value)}
 required
 minLength={MIN_TITLE_LENGTH}
 className={cn(titleTooShort &&"border-yellow-500")}
 />
 {titleTooShort && (
 <p className="text-xs text-yellow-600">
 {MIN_TITLE_LENGTH - title.length} caracteres mas.
 </p>
 )}
 </div>

 {/* Description */}
 <div className="space-y-2">
 <Label htmlFor="bulk-desc">Detalles</Label>
 <Textarea
 id="bulk-desc"placeholder="Detalles del bloque de trabajo..."value={description}
 onChange={(e) => setDescription(e.target.value)}
 rows={2}
 />
 </div>

 {/* Project */}
 <div className="space-y-2">
 <Label htmlFor="bulk-project">
 Proyecto <span className="text-muted-foreground text-xs">(opcional)</span>
 </Label>
 <Input
 id="bulk-project"placeholder="ej: landing-page, api-v2"value={project}
 onChange={(e) => setProject(e.target.value)}
 />
 </div>

 {/* Proof */}
 <div className="space-y-2">
 <Label htmlFor="bulk-proof"className="flex items-center gap-2">
 <Shield className="w-4 h-4 text-primary"/>
 Evidencia
 {!hasProof && (
 <Badge variant="outline"className="text-[10px] text-yellow-600 border-yellow-300">
 Sin evidencia
 </Badge>
 )}
 </Label>
 <Textarea
 id="bulk-proof"placeholder={"Links a commits, PRs, documentos..."}
 value={proofUrls}
 onChange={(e) => setProofUrls(e.target.value)}
 rows={2}
 className={cn(!hasProof &&"border-yellow-300 dark:border-yellow-700")}
 />
 </div>

 {error && <p className="text-sm text-red-600">{error}</p>}
 {result && (
 <p className="text-sm text-green-600 font-medium">{result}</p>
 )}

 <Button
 type="submit"className="w-full h-10 bg-primary hover:from-blue-700 hover:to-blue-800 text-white border-0 hover:shadow-blue-600/40 transition-all duration-300 font-semibold"disabled={loading || !category || hoursCount <= 0}
 >
 {loading
 ?"Guardando...":`Registrar ${hoursCount} hora${hoursCount > 1 ?"s":""}`}
 </Button>

 <p className="text-[11px] text-center text-muted-foreground/60">
 Se crearán {hoursCount} entradas individuales con la misma información.
 </p>
 </form>
 </DialogContent>
 </Dialog>
 );
}
