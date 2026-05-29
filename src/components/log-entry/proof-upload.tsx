"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Upload, X, FileText, Image, Film, Music, Loader2, CheckCircle2 } from "lucide-react";

interface ProofUploadProps {
  userId: string;
  onUploadComplete: (url: string) => void;
  existingUrls?: string[];
}

const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/heic",
  "application/pdf",
  "video/mp4", "video/quicktime",
  "audio/mpeg", "audio/mp4",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPT = "image/*,application/pdf,video/mp4,video/quicktime,audio/mpeg,audio/mp4";

type FileStatus = "uploading" | "done" | "error";

interface TrackedFile {
  id: string;
  name: string;
  status: FileStatus;
  url?: string;
  storagePath?: string;
  error?: string;
  type: string;
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return <Image className="w-4 h-4 text-muted-foreground" />;
  if (type.startsWith("video/")) return <Film className="w-4 h-4 text-muted-foreground" />;
  if (type.startsWith("audio/")) return <Music className="w-4 h-4 text-muted-foreground" />;
  return <FileText className="w-4 h-4 text-muted-foreground" />;
}

export function ProofUpload({ userId, onUploadComplete, existingUrls = [] }: ProofUploadProps) {
  const [files, setFiles] = useState<TrackedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const uploadFile = useCallback(async (file: File) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tracked: TrackedFile = { id, name: file.name, status: "uploading", type: file.type };

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFiles((prev) => [...prev, { ...tracked, status: "error", error: "Tipo de archivo no permitido" }]);
      return;
    }
    if (file.size > MAX_SIZE) {
      setFiles((prev) => [...prev, { ...tracked, status: "error", error: "Archivo excede 10MB" }]);
      return;
    }

    setFiles((prev) => [...prev, tracked]);

    const storagePath = `${userId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("proof-files").upload(storagePath, file);

    if (error) {
      setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "error", error: error.message } : f));
      return;
    }

    const { data } = supabase.storage.from("proof-files").getPublicUrl(storagePath);
    const publicUrl = data.publicUrl;

    setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "done", url: publicUrl, storagePath } : f));
    onUploadComplete(publicUrl);
  }, [userId, supabase, onUploadComplete]);

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(uploadFile);
  }, [uploadFile]);

  const removeFile = useCallback(async (tracked: TrackedFile) => {
    if (tracked.storagePath) {
      await supabase.storage.from("proof-files").remove([tracked.storagePath]);
    }
    setFiles((prev) => prev.filter((f) => f.id !== tracked.id));
  }, [supabase]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const hasItems = files.length > 0 || existingUrls.length > 0;

  return (
    <div className="space-y-1">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "border border-dashed border-border p-4 cursor-pointer transition-colors",
          "flex flex-col items-center justify-center gap-1",
          dragging && "border-primary/70 bg-primary/5"
        )}
      >
        <Upload className="w-5 h-5 text-muted-foreground" />
        <span className="font-mono text-[11px] text-muted-foreground">
          Arrastra archivos o haz clic
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">
          Fotos, screenshots, PDFs, videos, audio (max 10MB)
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* File list */}
      {hasItems && (
        <div className="space-y-1">
          {/* Existing URLs */}
          {existingUrls.map((url) => (
            <div key={url} className="flex items-center gap-2 px-2 py-1 border border-border">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-mono text-[11px] text-muted-foreground truncate flex-1">
                {url.split("/").pop() || url}
              </span>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
            </div>
          ))}

          {/* Tracked uploads */}
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-2 py-1 border border-border">
              {f.status === "uploading" ? (
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
              ) : f.status === "done" && f.url && f.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={f.name} className="w-12 h-12 object-cover border border-border shrink-0" />
              ) : (
                fileIcon(f.type)
              )}

              <div className="flex-1 min-w-0">
                <span className="font-mono text-[11px] text-foreground truncate block">{f.name}</span>
                {f.status === "uploading" && (
                  <span className="font-mono text-[9px] text-muted-foreground">Subiendo...</span>
                )}
                {f.status === "error" && (
                  <span className="font-mono text-[9px] text-destructive">{f.error}</span>
                )}
              </div>

              {f.status === "done" && (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
              )}

              {(f.status === "done" || f.status === "error") && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(f); }}
                  className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
