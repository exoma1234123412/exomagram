"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
 CATEGORIES,
 WORK_HOURS,
 MOOD_LABELS,
 ENERGY_LABELS,
 MAX_BACKFILL_HOURS,
 MIN_TITLE_LENGTH,
 OUTPUT_TYPES,
 TOOLS,
 LOCATIONS,
 DIFFICULTY_LABELS,
 FOCUS_LABELS,
 VALUE_LABELS,
 STRESS_LABELS,
 CONFIDENCE_LABELS,
} from "@/lib/constants";
import type { WorkCategory, OutputType, WorkLocation } from "@/lib/types/database";
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
import { AlertTriangle, Shield, Clock, BookTemplate, CheckCircle2, ChevronDown } from "lucide-react";
import { updateStreakOnEntry } from "@/lib/streak-utils";
import { EntryTemplates, ManageTemplatesDialog, type EntryTemplate } from "./entry-templates";
import { EntryValidator } from "@/components/tracking/entry-validator";
import { PostEntryShame } from "@/components/social/post-entry-shame";
import { ClaudeFollowup } from "@/components/ai/claude-followup";

interface LogEntryDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 defaultHour?: number;
 defaultDate?: string;
}

export function LogEntryDialog({
 open,
 onOpenChange,
 defaultHour,
 defaultDate,
}: LogEntryDialogProps) {
 const now = new Date();
 const [category, setCategory] = useState<WorkCategory |"">("");
 const [title, setTitle] = useState("");
 const [description, setDescription] = useState("");
 const [hour, setHour] = useState<string>(
 defaultHour?.toString() ?? now.getHours().toString()
 );
 const [date, setDate] = useState(
 defaultDate ?? now.toISOString().split("T")[0]
 );
 const [mood, setMood] = useState<number | null>(null);
 const [energy, setEnergy] = useState<number | null>(null);
 const [project, setProject] = useState("");
 const [proofUrls, setProofUrls] = useState("");
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [templatesOpen, setTemplatesOpen] = useState(false);
 const [showSuccess, setShowSuccess] = useState(false);
 const [showShame, setShowShame] = useState(false);
 const [shameEntry, setShameEntry] = useState<{
 hour: number;
 date: string;
 category: string;
 title: string;
 description: string;
 proof_urls: string[];
 } | null>(null);
 const savedTitleRef = useRef("");
 const [showFollowup, setShowFollowup] = useState(false);
 const [followupEntryId, setFollowupEntryId] = useState<string | null>(null);
 const [followupCategory, setFollowupCategory] = useState("");
 const [followupTitle, setFollowupTitle] = useState("");
 const [followupDescription, setFollowupDescription] = useState("");

 // Validation state
 const [validating, setValidating] = useState(false);
 const [recentEntries, setRecentEntries] = useState<{ title: string; description: string }[]>([]);

 // V10 — Advanced data fields
 const [advancedOpen, setAdvancedOpen] = useState(false);
 const [difficulty, setDifficulty] = useState<number | null>(null);
 const [focusQuality, setFocusQuality] = useState<number | null>(null);
 const [valueRating, setValueRating] = useState<number | null>(null);
 const [stressLevel, setStressLevel] = useState<number | null>(null);
 const [confidence, setConfidence] = useState<number | null>(null);
 const [interruptions, setInterruptions] = useState<number>(0);
 const [contextSwitches, setContextSwitches] = useState<number>(0);
 const [outputType, setOutputType] = useState<OutputType | null>(null);
 const [location, setLocation] = useState<WorkLocation | null>(null);
 const [toolsUsed, setToolsUsed] = useState<string[]>([]);
 const [collaborators, setCollaborators] = useState<string[]>([]);
 const [clientFacing, setClientFacing] = useState(false);
 const [couldBeAsync, setCouldBeAsync] = useState(false);
 const [blockerDetail, setBlockerDetail] = useState<string | null>(null);
 const [skillsTags, setSkillsTags] = useState("");
 const [learningNotes, setLearningNotes] = useState<string | null>(null);
 const [orgMembers, setOrgMembers] = useState<{ id: string; full_name: string | null }[]>([]);
 const [orgProjects, setOrgProjects] = useState<{ id: string; name: string }[]>([]);
 const [projectId, setProjectId] = useState<string | null>(null);

 // Fetch org members + projects for selection
 useEffect(() => {
 if (!open) return;
 async function loadMembers() {
 const supabase = createClient();
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;
 const { data: membership } = await supabase
 .from("org_members")
 .select("org_id")
 .eq("user_id", user.id)
 .limit(1)
 .single();
 if (!membership) return;
 const { data: members } = await supabase
 .from("org_members")
 .select("user_id")
 .eq("org_id", membership.org_id);
 if (!members) return;
 const otherIds = members
 .map((m: { user_id: string }) => m.user_id)
 .filter((id: string) => id !== user.id);
 if (otherIds.length === 0) { setOrgMembers([]); return; }
 const { data: profiles } = await supabase
 .from("profiles")
 .select("id, full_name")
 .in("id", otherIds);
 if (profiles) setOrgMembers(profiles);
 // Load org projects
 const { data: projects } = await supabase
 .from("projects")
 .select("id, name")
 .eq("org_id", membership.org_id)
 .eq("status", "active")
 .order("name");
 if (projects) setOrgProjects(projects);
 }
 loadMembers();

 // Fetch recent entries for copycat detection
 async function loadRecentEntries() {
 const supabase = createClient();
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;
 const { data: recent } = await supabase
 .from("time_entries")
 .select("title, description")
 .eq("user_id", user.id)
 .order("created_at", { ascending: false })
 .limit(5);
 if (recent) setRecentEntries(recent.map((r) => ({ title: r.title, description: r.description ??""})));
 }
 loadRecentEntries();
 }, [open]);

 // Reset form state when dialog closes
 useEffect(() => {
 if (!open) {
 setCategory("");
 setTitle("");
 setDescription("");
 setHour(defaultHour?.toString() ?? new Date().getHours().toString());
 setDate(defaultDate ?? new Date().toISOString().split("T")[0]);
 setMood(null);
 setEnergy(null);
 setProject("");
 setProjectId(null);
 setProofUrls("");
 setError(null);
 setShowSuccess(false);
 setShowShame(false);
 setShameEntry(null);
 setShowFollowup(false);
 setFollowupEntryId(null);
 setFollowupCategory("");
 setFollowupTitle("");
 setFollowupDescription("");
 setValidating(false);
 // Reset advanced fields
 setAdvancedOpen(false);
 setDifficulty(null);
 setFocusQuality(null);
 setValueRating(null);
 setStressLevel(null);
 setConfidence(null);
 setInterruptions(0);
 setContextSwitches(0);
 setOutputType(null);
 setLocation(null);
 setToolsUsed([]);
 setCollaborators([]);
 setClientFacing(false);
 setCouldBeAsync(false);
 setBlockerDetail(null);
 setSkillsTags("");
 setLearningNotes(null);
 }
 }, [open, defaultHour, defaultDate]);

 function applyTemplate(template: EntryTemplate) {
 setCategory(template.category);
 setTitle(template.title);
 setDescription(template.description);
 setProject(template.project);
 }

 // Anti-gaming: calculate if entry is late
 function calculateLateness(): { isLate: boolean; minutesLate: number } {
 const entryDate = new Date(`${date}T${String(parseInt(hour) + 1).padStart(2,"0")}:00:00`);
 const diff = (now.getTime() - entryDate.getTime()) / 1000 / 60;
 return { isLate: diff > 60, minutesLate: Math.max(0, Math.round(diff - 60)) };
 }

 // Anti-gaming: check if backfill is too old
 function isBackfillTooOld(): boolean {
 const entryDate = new Date(`${date}T${String(parseInt(hour)).padStart(2,"0")}:00:00`);
 const diffHours = (now.getTime() - entryDate.getTime()) / 1000 / 60 / 60;
 return diffHours > MAX_BACKFILL_HOURS;
 }

 const lateness = calculateLateness();
 const tooOld = isBackfillTooOld();
 const hasProof = proofUrls.trim().length > 0;
 const titleTooShort = title.length > 0 && title.length < MIN_TITLE_LENGTH;

 // Step 1: User clicks submit -> trigger validation overlay
 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!category || tooOld) return;
 if (title.length < MIN_TITLE_LENGTH) {
 setError(`El título debe tener al menos ${MIN_TITLE_LENGTH} caracteres. Sé específico.`);
 return;
 }
 setError(null);
 setValidating(true);
 }

 // Step 2: Called by EntryValidator when Claude approves (may include corrected text)
 async function handleActualSubmit(updatedEntry?: { title: string; description: string }) {
 // Apply corrected text from inline editor if provided
 if (updatedEntry) {
 setTitle(updatedEntry.title);
 setDescription(updatedEntry.description);
 }
 const finalTitle = updatedEntry?.title ?? title;
 const finalDescription = updatedEntry?.description ?? description;
 setValidating(false);
 setLoading(true);
 setError(null);

 const supabase = createClient();
 const {
 data: { user },
 } = await supabase.auth.getUser();

 if (!user) {
 setError("No estás autenticado");
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
 setError("No perteneces a ninguna organización");
 setLoading(false);
 return;
 }

 const proofArray = proofUrls
 .split("\n")
 .map((l) => l.trim())
 .filter(Boolean);

 const skillsArray = skillsTags
 .split(",")
 .map((s) => s.trim())
 .filter(Boolean);

 // V12 — Capture revision if editing existing entry
 const { data: existingEntry } = await supabase
 .from("time_entries")
 .select("*")
 .eq("user_id", user.id)
 .eq("org_id", membership.org_id)
 .eq("date", date)
 .eq("hour", parseInt(hour))
 .maybeSingle();

 const currentVersion = existingEntry?.entry_version ?? 0;

 const { data: upsertedEntry, error: insertError } = await supabase.from("time_entries").upsert(
 {
 user_id: user.id,
 org_id: membership.org_id,
 date,
 hour: parseInt(hour),
 category: category as WorkCategory,
 title: finalTitle,
 description: finalDescription || null,
 mood: mood as 1 | 2 | 3 | 4 | 5 | null,
 energy: energy as 1 | 2 | 3 | 4 | 5 | null,
 links: null,
 project: project.trim() || null,
 project_id: projectId || null,
 proof_urls: proofArray.length > 0 ? proofArray : null,
 is_late: lateness.isLate,
 minutes_late: lateness.minutesLate,
 logged_at: new Date().toISOString(),
 verification_status: proofArray.length > 0 ?"unverified":"unverified",
 // V10 — Advanced data
 difficulty: difficulty as 1 | 2 | 3 | 4 | 5 | null,
 focus_quality: focusQuality as 1 | 2 | 3 | 4 | 5 | null,
 value_rating: valueRating as 1 | 2 | 3 | 4 | 5 | null,
 stress_level: stressLevel as 1 | 2 | 3 | 4 | 5 | null,
 confidence: confidence as 1 | 2 | 3 | 4 | 5 | null,
 interruptions,
 context_switches: contextSwitches,
 output_type: outputType,
 location,
 tools_used: toolsUsed.length > 0 ? toolsUsed : [],
 collaborators: collaborators.length > 0 ? collaborators : [],
 client_facing: clientFacing,
 could_be_async: category ==="meeting"? couldBeAsync : null,
 blocker_detail: category ==="blocked"? blockerDetail : null,
 skills_tags: skillsArray.length > 0 ? skillsArray : [],
 learning_notes: category ==="learning"? learningNotes : null,
 // V12 — Version tracking
 entry_version: currentVersion + 1,
 },
 { onConflict:"user_id,org_id,date,hour"}
 ).select("id").single();

 if (insertError) {
 setError(insertError.message);
 setLoading(false);
 return;
 }

 // V12 — Save revision if this was an edit (existing entry had data)
 const savedEntryId = upsertedEntry?.id ?? null;
 if (existingEntry && savedEntryId) {
   const newData = {
     category, title: finalTitle, description: finalDescription || null,
     mood, energy, proof_urls: proofArray.length > 0 ? proofArray : null,
     difficulty, focus_quality: focusQuality, value_rating: valueRating,
     stress_level: stressLevel, confidence: confidence, interruptions,
     context_switches: contextSwitches, output_type: outputType, location,
     tools_used: toolsUsed, collaborators, client_facing: clientFacing,
     project: project.trim() || null,
   };
   const changedFields = Object.keys(newData).filter((k) => {
     const oldVal = JSON.stringify((existingEntry as Record<string, unknown>)[k] ?? null);
     const newVal = JSON.stringify((newData as Record<string, unknown>)[k] ?? null);
     return oldVal !== newVal;
   });
   if (changedFields.length > 0) {
     supabase.from("entry_revisions").insert({
       entry_id: savedEntryId,
       user_id: user.id,
       org_id: membership.org_id,
       version: currentVersion,
       old_data: Object.fromEntries(changedFields.map((k) => [k, (existingEntry as Record<string, unknown>)[k] ?? null])),
       new_data: Object.fromEntries(changedFields.map((k) => [k, (newData as Record<string, unknown>)[k] ?? null])),
       changed_fields: changedFields,
       change_source: "user",
     }).then(() => {}); // fire-and-forget
   }
 }

 // Store entry data for Claude followup
 setFollowupEntryId(savedEntryId);
 setFollowupCategory(category as string);
 setFollowupTitle(finalTitle);
 setFollowupDescription(finalDescription || "");

 // Update activity streak
 updateStreakOnEntry(user.id, membership.org_id, date);

 // Show shame comparison overlay, then success
 savedTitleRef.current = title;
 setShameEntry({
 hour: parseInt(hour),
 date,
 category: category as string,
 title,
 description: description || "",
 proof_urls: proofArray,
 });
 setShowShame(true);
 setLoading(false);

 // Fire claude-react in background (fire and forget)
 const profilePromise = supabase
 .from("profiles")
 .select("full_name")
 .eq("id", user.id)
 .single();

 profilePromise.then(({ data: profile }) => {
 fetch("/api/claude-react", {
 method:"POST",
 headers: {"Content-Type":"application/json"},
 body: JSON.stringify({
 org_id: membership.org_id,
 event_type:"entry_created",
 event_data: {
 user_name: profile?.full_name ??"Usuario",
 title: title,
 category: category,
 hour: parseInt(hour),
 has_proof: proofArray.length > 0,
 },
 }),
 }).catch(() => {});
 });

 // Shame overlay handles its own timing — no auto-close here
 }

 // Negative submit — entry registered with penalty when Claude rejects and user can't improve
 async function handleNegativeSubmit() {
  setValidating(false);
  setLoading(true);
  setError(null);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { setError("No autenticado"); setLoading(false); return; }

  const { data: membership } = await supabase
   .from("org_members")
   .select("org_id")
   .eq("user_id", user.id)
   .limit(1)
   .single();
  if (!membership) { setError("Sin organización"); setLoading(false); return; }

  // Save entry as flagged with original (rejected) content
  const { error: insertError } = await supabase.from("time_entries").upsert(
   {
    user_id: user.id,
    org_id: membership.org_id,
    date,
    hour: parseInt(hour),
    category: (category || "admin") as WorkCategory,
    title: title || "Hora sin actividad productiva",
    description: "[RECHAZADA POR CLAUDE] " + (description || "El usuario no pudo describir trabajo específico para esta hora."),
    mood: mood as 1 | 2 | 3 | 4 | 5 | null,
    energy: energy as 1 | 2 | 3 | 4 | 5 | null,
    links: null,
    project: null,
    proof_urls: null,
    is_late: lateness.isLate,
    minutes_late: lateness.minutesLate,
    logged_at: new Date().toISOString(),
    verification_status: "flagged" as const,
    verification_note: "Entrada rechazada por Claude AI — el usuario no mejoró la descripción",
    value_rating: 1 as const,
    confidence: 1 as const,
   },
   { onConflict: "user_id,org_id,date,hour" }
  );

  if (insertError) { setError(insertError.message); setLoading(false); return; }

  // Create accountability flag
  await supabase.from("accountability_flags").insert({
   user_id: user.id,
   org_id: membership.org_id,
   date,
   flag_type: "low_detail",
   details: `Entrada ${parseInt(hour)}:00 rechazada por Claude. Título original: "${title}". El usuario admitió no tener trabajo productivo que reportar.`,
   resolved: false,
  });

  // Notify via claude-react
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  fetch("/api/claude-react", {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({
    org_id: membership.org_id,
    event_type: "entry_created",
    event_data: {
     user_id: user.id,
     user_name: profile?.full_name ?? "Usuario",
     title: "HORA IMPRODUCTIVA (rechazada por Claude)",
     category: category || "admin",
     hour: parseInt(hour),
     has_proof: false,
     is_late: lateness.isLate,
    },
   }),
  }).catch(() => {});

  // Show success and close
  savedTitleRef.current = "Hora registrada como improductiva";
  setLoading(false);
  setShowSuccess(true);
  setTimeout(() => {
   setCategory("");
   setTitle("");
   setDescription("");
   setMood(null);
   setEnergy(null);
   setProject("");
   setProjectId(null);
   setProofUrls("");
   setShowSuccess(false);
   setValidating(false);
   setAdvancedOpen(false);
   setDifficulty(null);
   setFocusQuality(null);
   setValueRating(null);
   setStressLevel(null);
   setConfidence(null);
   setInterruptions(0);
   setContextSwitches(0);
   setOutputType(null);
   setLocation(null);
   setToolsUsed([]);
   setCollaborators([]);
   setClientFacing(false);
   setCouldBeAsync(false);
   setBlockerDetail(null);
   setSkillsTags("");
   setLearningNotes(null);
   onOpenChange(false);
  }, 1500);
 }

 function handleShameClose() {
 setShowShame(false);
 setShameEntry(null);
 // Show Claude followup if we have an entry ID and category isn't break
 if (followupEntryId && followupCategory !== "break") {
 setShowFollowup(true);
 return;
 }
 // Otherwise go straight to success
 finishAndClose();
 }

 function handleFollowupComplete() {
 setShowFollowup(false);
 finishAndClose();
 }

 function finishAndClose() {
 // Show brief success then close
 setShowSuccess(true);
 setTimeout(() => {
 setCategory("");
 setTitle("");
 setDescription("");
 setMood(null);
 setEnergy(null);
 setProject("");
 setProjectId(null);
 setProofUrls("");
 setShowSuccess(false);
 setValidating(false);
 setShowFollowup(false);
 setFollowupEntryId(null);
 setFollowupCategory("");
 setFollowupTitle("");
 setFollowupDescription("");
 setAdvancedOpen(false);
 setDifficulty(null);
 setFocusQuality(null);
 setValueRating(null);
 setStressLevel(null);
 setConfidence(null);
 setInterruptions(0);
 setContextSwitches(0);
 setOutputType(null);
 setLocation(null);
 setToolsUsed([]);
 setCollaborators([]);
 setClientFacing(false);
 setCouldBeAsync(false);
 setBlockerDetail(null);
 setSkillsTags("");
 setLearningNotes(null);
 onOpenChange(false);
 }, 1000);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-lg max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="text-xl font-bold flex items-center gap-2.5 tracking-tight">
 Registrar hora
 {lateness.isLate && (
 <Badge variant="destructive"className="text-[10px] font-semibold">
 <Clock className="w-3 h-3 mr-1"/>
 {lateness.minutesLate}min tarde
 </Badge>
 )}
 </DialogTitle>
 </DialogHeader>

 {/* Quick templates */}
 <EntryTemplates onApply={applyTemplate} />

 {/* Anti-gaming warnings */}
 {tooOld && (
 <div className="bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 p-3.5 flex items-start gap-2.5">
 <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5"/>
 <div className="text-sm">
 <p className="font-semibold text-red-700 dark:text-red-400">
 No puedes registrar más de {MAX_BACKFILL_HOURS}h hacia atrás
 </p>
 <p className="text-red-600/70 dark:text-red-400/70 text-xs mt-0.5">
 Registra tus horas a tiempo. Las entradas tardías quedan marcadas.
 </p>
 </div>
 </div>
 )}

 <form onSubmit={handleSubmit} className="space-y-5">
 {/* Date & Hour */}
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-2">
 <Label className="text-sm font-medium">Fecha</Label>
 <Input
 type="date"value={date}
 onChange={(e) => setDate(e.target.value)}
 max={now.toISOString().split("T")[0]}
 className=""/>
 </div>
 <div className="space-y-2">
 <Label className="text-sm font-medium">Hora</Label>
 <Select value={hour} onValueChange={(v) => v && setHour(v)}>
 <SelectTrigger className="">
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
 </div>

 {/* Category */}
 <div className="space-y-2.5">
 <Label className="text-sm font-medium">Categoría</Label>
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
 <span className="text-xl">{cat.emoji}</span>
 <span className="truncate w-full text-center text-[11px]">
 {cat.label}
 </span>
 </button>
 );
 })}
 </div>
 </div>

 {/* Title */}
 <div className="space-y-2">
 <Label htmlFor="title"className="text-sm font-medium">
 ¿Qué hiciste?{""}
 <span className="text-muted-foreground/60 text-xs font-normal">
 (mín. {MIN_TITLE_LENGTH} caracteres)
 </span>
 </Label>
 <Input
 id="title"placeholder="Sé específico: 'Implementé validación de formulario de registro con Zod'"value={title}
 onChange={(e) => setTitle(e.target.value)}
 required
 minLength={MIN_TITLE_LENGTH}
 className={cn("", titleTooShort &&"border-yellow-500 focus-visible:ring-yellow-500/30")}
 />
 {titleTooShort && (
 <p className="text-xs text-yellow-600 font-medium">
 {MIN_TITLE_LENGTH - title.length} caracteres más. Sé específico sobre lo que hiciste.
 </p>
 )}
 </div>

 {/* Description */}
 <div className="space-y-2">
 <Label htmlFor="desc"className="text-sm font-medium">Detalles</Label>
 <Textarea
 id="desc"placeholder="Explica qué hiciste, qué decisiones tomaste, qué problemas encontraste..."value={description}
 onChange={(e) => setDescription(e.target.value)}
 rows={3}
 className=""/>
 </div>

 {/* Project selection */}
 <div className="space-y-2">
 <Label className="text-sm font-medium">
 Proyecto{""}
 <span className="text-muted-foreground/60 text-xs font-normal">(opcional)</span>
 </Label>
 {orgProjects.length > 0 ? (
 <Select value={projectId ?? "__none__"} onValueChange={(v) => {
 if (v === "__none__") {
 setProjectId(null);
 setProject("");
 } else {
 setProjectId(v);
 const found = orgProjects.find((p) => p.id === v);
 setProject(found?.name ?? "");
 }
 }}>
 <SelectTrigger>
 <SelectValue placeholder="Sin proyecto"/>
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="__none__">Sin proyecto</SelectItem>
 {orgProjects.map((p) => (
 <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 ) : (
 <Input
 id="project" placeholder="ej: landing-page, api-v2, onboarding" value={project}
 onChange={(e) => setProject(e.target.value)}
 className=""/>
 )}
 </div>

 {/* PROOF OF WORK */}
 <div className="space-y-2">
 <Label htmlFor="proof"className="flex items-center gap-2 text-sm font-medium">
 <Shield className="w-4 h-4 text-primary"/>
 Evidencia de trabajo
 <Badge
 variant="outline"className={cn(
"text-[10px] rounded-md font-semibold ml-auto",
 hasProof
 ?"text-green-600 border-green-300/50 bg-green-50/50 dark:bg-green-950/20":"text-yellow-600 border-yellow-300/50 bg-yellow-50/50 dark:bg-yellow-950/20")}
 >
 {hasProof ?"Con evidencia":"Sin evidencia"}
 </Badge>
 </Label>
 <Textarea
 id="proof"placeholder={"Links a commits, PRs, documentos, screenshots...\nhttps://github.com/org/repo/pull/123\nhttps://linear.app/team/issue/EX-45"}
 value={proofUrls}
 onChange={(e) => setProofUrls(e.target.value)}
 rows={2}
 className={cn(
"",
 !hasProof &&"border-yellow-300/60 dark:border-yellow-700/40")}
 />
 <p className="text-[11px] text-muted-foreground/70">
 Las entradas sin evidencia se marcan como <span className="text-yellow-600 font-semibold">sin verificar</span>.
 Tu equipo puede ver cuáles tienen prueba y cuáles no.
 </p>
 </div>

 {/* Mood & Energy */}
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label className="text-sm font-medium">Ánimo</Label>
 <div className="flex gap-1">
 {[1, 2, 3, 4, 5].map((level) => (
 <button
 key={level}
 type="button"onClick={() => setMood(mood === level ? null : level)}
 className={cn(
"flex-1 py-2 text-xs font-semibold transition-all duration-200",
 mood === level
 ?"bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-blue-600/25 scale-105":"bg-accent/60 hover:bg-accent text-foreground/70")}
 title={MOOD_LABELS[level]}
 >
 {level}
 </button>
 ))}
 </div>
 </div>
 <div className="space-y-2">
 <Label className="text-sm font-medium">Energía</Label>
 <div className="flex gap-1">
 {[1, 2, 3, 4, 5].map((level) => (
 <button
 key={level}
 type="button"onClick={() => setEnergy(energy === level ? null : level)}
 className={cn(
"flex-1 py-2 text-xs font-semibold transition-all duration-200",
 energy === level
 ?"bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-emerald-500/25 scale-105":"bg-accent/60 hover:bg-accent text-foreground/70")}
 title={ENERGY_LABELS[level]}
 >
 {level}
 </button>
 ))}
 </div>
 </div>
 </div>

 {/* DATOS AVANZADOS — collapsible section */}
 <div className="border border-border p-3 mt-4">
 <button
 type="button"onClick={() => setAdvancedOpen(!advancedOpen)}
 className="flex items-center gap-1 px-2 py-1 cursor-pointer w-full">
 <ChevronDown
 className={cn(
"w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
 advancedOpen &&"rotate-180")}
 />
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Datos avanzados
 </span>
 </button>

 {advancedOpen && (
 <div className="mt-3 space-y-4">
 {/* Row 1 — Five 1-5 Rating Scales */}
 <div className="space-y-3">
 {([
 { label:"Dificultad", value: difficulty, setter: setDifficulty, labels: DIFFICULTY_LABELS },
 { label:"Enfoque", value: focusQuality, setter: setFocusQuality, labels: FOCUS_LABELS },
 { label:"Valor", value: valueRating, setter: setValueRating, labels: VALUE_LABELS },
 { label:"Estrés", value: stressLevel, setter: setStressLevel, labels: STRESS_LABELS },
 { label:"Confianza", value: confidence, setter: setConfidence, labels: CONFIDENCE_LABELS },
 ] as const).map((rating) => (
 <div key={rating.label} className="flex items-center gap-3">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground w-20 shrink-0">
 {rating.label}
 </span>
 <div className="flex gap-1">
 {[1, 2, 3, 4, 5].map((level) => (
 <button
 key={level}
 type="button"onClick={() => rating.setter(rating.value === level ? null : level)}
 className={cn(
"w-7 h-7 text-xs font-mono border border-border transition-colors",
 rating.value === level
 ?"bg-primary text-primary-foreground border-primary":"hover:border-primary/30")}
 title={rating.labels[level]}
 >
 {level}
 </button>
 ))}
 </div>
 {rating.value && (
 <span className="text-[10px] font-mono text-muted-foreground/60">
 {rating.labels[rating.value]}
 </span>
 )}
 </div>
 ))}
 </div>

 {/* Row 2 — Counts */}
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Interrupciones
 </span>
 <Input
 type="number"min={0}
 value={interruptions}
 onChange={(e) => setInterruptions(Math.max(0, parseInt(e.target.value) || 0))}
 className="h-7 text-xs font-mono w-20"/>
 </div>
 <div className="space-y-1">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Cambios de contexto
 </span>
 <Input
 type="number"min={0}
 value={contextSwitches}
 onChange={(e) => setContextSwitches(Math.max(0, parseInt(e.target.value) || 0))}
 className="h-7 text-xs font-mono w-20"/>
 </div>
 </div>

 {/* Row 3 — Output Type & Location */}
 <div className="space-y-1">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Tipo de output
 </span>
 <div className="flex flex-wrap gap-1">
 {(Object.keys(OUTPUT_TYPES) as Array<keyof typeof OUTPUT_TYPES>).map((key) => {
 const opt = OUTPUT_TYPES[key];
 return (
 <button
 key={key}
 type="button"onClick={() => setOutputType(outputType === key ? null : key as OutputType)}
 className={cn(
"px-2 py-1 text-[10px] font-mono border border-border transition-colors",
 outputType === key
 ?"bg-primary/10 border-primary/40 text-primary":"hover:border-primary/30")}
 >
 {opt.emoji} {opt.label}
 </button>
 );
 })}
 </div>
 </div>

 <div className="space-y-1">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Ubicacion
 </span>
 <div className="flex flex-wrap gap-1">
 {(Object.keys(LOCATIONS) as Array<keyof typeof LOCATIONS>).map((key) => {
 const loc = LOCATIONS[key];
 return (
 <button
 key={key}
 type="button"onClick={() => setLocation(location === key ? null : key as WorkLocation)}
 className={cn(
"px-2 py-1 text-[10px] font-mono border border-border transition-colors",
 location === key
 ?"bg-primary/10 border-primary/40 text-primary":"hover:border-primary/30")}
 >
 {loc.emoji} {loc.label}
 </button>
 );
 })}
 </div>
 </div>

 {/* Row 4 — Tools Used */}
 <div className="space-y-1">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Herramientas
 </span>
 <div className="flex flex-wrap gap-1">
 {(Object.keys(TOOLS) as Array<keyof typeof TOOLS>).map((key) => {
 const tool = TOOLS[key];
 const selected = toolsUsed.includes(key);
 return (
 <button
 key={key}
 type="button"onClick={() =>
 setToolsUsed(
 selected
 ? toolsUsed.filter((t) => t !== key)
 : [...toolsUsed, key]
 )
 }
 className={cn(
"px-2 py-1 text-[10px] font-mono border border-border transition-colors",
 selected
 ?"bg-primary/10 border-primary/40 text-primary":"hover:border-primary/30")}
 >
 {tool.emoji} {tool.label}
 </button>
 );
 })}
 </div>
 </div>

 {/* Row 5 — Collaborators */}
 {orgMembers.length > 0 && (
 <div className="space-y-1">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Colaboradores
 </span>
 <div className="flex flex-wrap gap-2">
 {orgMembers.map((member) => (
 <label
 key={member.id}
 className={cn(
"flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-border cursor-pointer transition-colors",
 collaborators.includes(member.id)
 ?"bg-primary/10 border-primary/40 text-primary":"hover:border-primary/30")}
 >
 <input
 type="checkbox"checked={collaborators.includes(member.id)}
 onChange={(e) =>
 setCollaborators(
 e.target.checked
 ? [...collaborators, member.id]
 : collaborators.filter((c) => c !== member.id)
 )
 }
 className="w-3 h-3 accent-primary"/>
 {member.full_name ||"Sin nombre"}
 </label>
 ))}
 </div>
 </div>
 )}

 {/* Row 6 — Boolean Flags */}
 <div className="flex flex-wrap gap-3">
 <label className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-border cursor-pointer transition-colors hover:border-primary/30">
 <input
 type="checkbox"checked={clientFacing}
 onChange={(e) => setClientFacing(e.target.checked)}
 className="w-3 h-3 accent-primary"/>
 Cliente externo
 </label>
 {category ==="meeting"&& (
 <label className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-border cursor-pointer transition-colors hover:border-primary/30">
 <input
 type="checkbox"checked={couldBeAsync}
 onChange={(e) => setCouldBeAsync(e.target.checked)}
 className="w-3 h-3 accent-primary"/>
 Pudo ser async
 </label>
 )}
 </div>

 {/* Row 7 — Conditional text fields */}
 {category ==="blocked"&& (
 <div className="space-y-1">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Detalle del bloqueo
 </span>
 <Textarea
 value={blockerDetail ??""}
 onChange={(e) => setBlockerDetail(e.target.value || null)}
 placeholder="Describe qué te bloquea y qué necesitas para avanzar..."rows={2}
 className="text-xs"/>
 </div>
 )}

 <div className="space-y-1">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Skills usados
 </span>
 <Input
 value={skillsTags}
 onChange={(e) => setSkillsTags(e.target.value)}
 placeholder="react, typescript, sql (separados por coma)"className="h-7 text-xs font-mono"/>
 </div>

 {category ==="learning"&& (
 <div className="space-y-1">
 <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
 Notas de aprendizaje
 </span>
 <Textarea
 value={learningNotes ??""}
 onChange={(e) => setLearningNotes(e.target.value || null)}
 placeholder="Que aprendiste, recursos consultados, conclusiones..."rows={2}
 className="text-xs"/>
 </div>
 )}
 </div>
 )}
 </div>

 {error && (
 <div className="bg-destructive/5 border border-destructive/20 px-3 py-2">
 <p className="text-sm text-destructive font-medium">{error}</p>
 </div>
 )}

 <Button
 type="submit"className="w-full h-10 bg-primary hover:from-blue-700 hover:to-blue-800 text-white border-0 hover:shadow-blue-600/40 transition-all duration-300 font-semibold"disabled={loading || !category || tooOld}
 >
 {loading ?"Guardando...":"Guardar entrada"}
 </Button>

 {/* Transparency notice */}
 <p className="text-[11px] text-center text-muted-foreground">
 Todo tu equipo vera esta entrada, incluyendo si fue registrada tarde
 y si tiene evidencia.
 </p>

 {/* Manage templates link */}
 <button
 type="button"onClick={() => setTemplatesOpen(true)}
 className="text-[11px] text-center text-primary/60 hover:text-primary w-full flex items-center justify-center gap-1 transition-colors">
 <BookTemplate className="w-3 h-3"/>
 Gestionar plantillas
 </button>
 </form>

 <ManageTemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />

 {/* Validation overlay — blocks submission until Claude approves */}
 {validating && (
 <EntryValidator
 entry={{
 category: category as string,
 title,
 description,
 hour: parseInt(hour),
 date,
 proof_urls: proofUrls.split("\n").map((l) => l.trim()).filter(Boolean),
 }}
 recentEntries={recentEntries}
 onApproved={handleActualSubmit}
 onNegativeSubmit={handleNegativeSubmit}
 onCancel={() => setValidating(false)}
 />
 )}

 {/* Post-entry shame comparison overlay */}
 {showShame && shameEntry && (
 <PostEntryShame
 entry={shameEntry}
 onClose={handleShameClose}
 />
 )}

 {/* Claude followup interrogation — after shame, before success */}
 {showFollowup && followupEntryId && (
 <ClaudeFollowup
 entryId={followupEntryId}
 category={followupCategory}
 title={followupTitle}
 description={followupDescription}
 onComplete={handleFollowupComplete}
 />
 )}

 {/* Success overlay */}
 {showSuccess && (
 <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-200">
 <div className="flex flex-col items-center gap-3">
 <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-in zoom-in duration-300">
 <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400"/>
 </div>
 <p className="text-sm font-medium text-foreground/80 max-w-[280px] text-center truncate">
 {savedTitleRef.current}
 </p>
 <p className="text-lg font-bold text-green-600 dark:text-green-400">
 Registrado
 </p>
 </div>
 </div>
 )}
 </DialogContent>
 </Dialog>
 );
}
