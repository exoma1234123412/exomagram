"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, MIN_TITLE_LENGTH } from "@/lib/constants";
import type { TimeEntry, WorkCategory } from "@/lib/types/database";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Pencil, Shield, Trash2 } from "lucide-react";

interface EditEntryDialogProps {
  entry: TimeEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EditEntryDialog({ entry, open, onOpenChange, onSaved }: EditEntryDialogProps) {
  const [category, setCategory] = useState<WorkCategory>(entry.category);
  const [title, setTitle] = useState(entry.title);
  const [description, setDescription] = useState(entry.description ?? "");
  const [project, setProject] = useState(entry.project ?? "");
  const [proofUrls, setProofUrls] = useState(entry.proof_urls?.join("\n") ?? "");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasProof = proofUrls.trim().length > 0;
  const titleTooShort = title.length > 0 && title.length < MIN_TITLE_LENGTH;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (title.length < MIN_TITLE_LENGTH) {
      setError(`El titulo debe tener al menos ${MIN_TITLE_LENGTH} caracteres.`);
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const proofArray = proofUrls.split("\n").map((l) => l.trim()).filter(Boolean);

    const { error: updateError } = await supabase
      .from("time_entries")
      .update({
        category,
        title,
        description: description || null,
        project: project.trim() || null,
        proof_urls: proofArray.length > 0 ? proofArray : null,
      })
      .eq("id", entry.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      onOpenChange(false);
      onSaved?.();
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm("Seguro que quieres eliminar esta entrada? Esta accion no se puede deshacer.")) return;
    setDeleting(true);

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("time_entries")
      .delete()
      .eq("id", entry.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      onOpenChange(false);
      onSaved?.();
    }
    setDeleting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-bold tracking-tight">
            <Pencil className="w-4 h-4 text-primary" />
            Editar entrada
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(CATEGORIES) as WorkCategory[]).map((key) => {
                const cat = CATEGORIES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 text-xs font-semibold transition-all duration-200",
                      category === key
                        ? "border-primary bg-primary/5 shadow-sm shadow-primary/10 scale-[1.02]"
                        : "border-transparent bg-accent/50 hover:bg-accent hover:scale-[1.01]"
                    )}
                  >
                    <span className="text-base">{cat.emoji}</span>
                    <span className="truncate w-full text-center text-[10px]">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title">Titulo</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={MIN_TITLE_LENGTH}
              className={cn(titleTooShort && "border-yellow-500")}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-desc">Detalles</Label>
            <Textarea
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Project */}
          <div className="space-y-2">
            <Label htmlFor="edit-project">Proyecto</Label>
            <Input
              id="edit-project"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="opcional"
            />
          </div>

          {/* Proof */}
          <div className="space-y-2">
            <Label htmlFor="edit-proof" className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Evidencia
              {hasProof && (
                <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">
                  Con evidencia
                </Badge>
              )}
            </Label>
            <Textarea
              id="edit-proof"
              value={proofUrls}
              onChange={(e) => setProofUrls(e.target.value)}
              rows={2}
              placeholder="Links a commits, PRs, documentos..."
            />
          </div>

          {error && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2">
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-lg shadow-blue-600/25 font-semibold" disabled={loading}>
              {loading ? "Guardando..." : "Guardar cambios"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={handleDelete}
              disabled={deleting}
              title="Eliminar entrada"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
