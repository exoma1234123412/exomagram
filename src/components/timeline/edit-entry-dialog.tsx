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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-violet-600" />
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
                      "flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs font-medium transition-all",
                      category === key
                        ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30"
                        : "border-transparent bg-muted/50 hover:bg-muted"
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
              <Shield className="w-4 h-4 text-violet-600" />
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={loading}>
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
