"use client";

import { useState, useEffect } from "react";
import { CATEGORIES } from "@/lib/constants";
import type { WorkCategory } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { BookTemplate, Plus, Trash2, Zap } from "lucide-react";

export interface EntryTemplate {
  id: string;
  name: string;
  category: WorkCategory;
  title: string;
  description: string;
  project: string;
}

const STORAGE_KEY = "exomagram_entry_templates";

function loadTemplates(): EntryTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: EntryTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

interface EntryTemplatesProps {
  onApply: (template: EntryTemplate) => void;
}

export function EntryTemplates({ onApply }: EntryTemplatesProps) {
  const [templates, setTemplates] = useState<EntryTemplate[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  if (templates.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      <span className="text-[10px] text-muted-foreground flex items-center gap-1 mr-1">
        <Zap className="w-3 h-3" />
        Rapido:
      </span>
      {templates.map((t) => {
        const cat = CATEGORIES[t.category];
        return (
          <button
            key={t.id}
            onClick={() => onApply(t)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-muted/50 hover:bg-muted transition-colors"
            title={`${cat.label}: ${t.title}`}
          >
            <span>{cat.emoji}</span>
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

interface ManageTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageTemplatesDialog({ open, onOpenChange }: ManageTemplatesDialogProps) {
  const [templates, setTemplates] = useState<EntryTemplate[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<WorkCategory>("deep_work");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [project, setProject] = useState("");

  useEffect(() => {
    setTemplates(loadTemplates());
  }, [open]);

  function handleAdd() {
    if (!name.trim() || !title.trim()) return;
    const newTemplate: EntryTemplate = {
      id: Date.now().toString(),
      name: name.trim(),
      category,
      title: title.trim(),
      description: description.trim(),
      project: project.trim(),
    };
    const updated = [...templates, newTemplate];
    setTemplates(updated);
    saveTemplates(updated);
    setName("");
    setTitle("");
    setDescription("");
    setProject("");
  }

  function handleDelete(id: string) {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookTemplate className="w-5 h-5 text-violet-600" />
            Plantillas de entrada
          </DialogTitle>
        </DialogHeader>

        {/* Existing templates */}
        {templates.length > 0 && (
          <div className="space-y-2 mb-4">
            {templates.map((t) => {
              const cat = CATEGORIES[t.category];
              return (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border">
                  <span className="text-base">{cat.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.title}</p>
                  </div>
                  {t.project && (
                    <Badge variant="outline" className="text-[10px]">{t.project}</Badge>
                  )}
                  <button onClick={() => handleDelete(t.id)} className="text-muted-foreground hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add new */}
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Nueva plantilla</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ej: Standup" className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Proyecto</Label>
              <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="opcional" className="text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Titulo</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titulo de la entrada" className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(CATEGORIES) as WorkCategory[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] font-medium",
                    category === key ? "bg-violet-600 text-white" : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {CATEGORIES[key].emoji} {CATEGORIES[key].label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleAdd} size="sm" disabled={!name.trim() || !title.trim()} className="w-full gap-2">
            <Plus className="w-3 h-3" />
            Guardar plantilla
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
