"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, VerificationStatus } from "@/lib/types/database";
import { VERIFICATION_STATUS } from "@/lib/constants";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

interface VerifyEntryDialogProps {
 entry: TimeEntry;
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onSaved?: () => void;
}

export function VerifyEntryDialog({ entry, open, onOpenChange, onSaved }: VerifyEntryDialogProps) {
 const [status, setStatus] = useState<VerificationStatus>(entry.verification_status);
 const [note, setNote] = useState(entry.verification_note ??"");
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const statusOptions: { value: VerificationStatus; label: string; icon: React.ReactNode; color: string }[] = [
 { value:"verified", label:"Verificado", icon: <ShieldCheck className="w-4 h-4"/>, color:"border-green-500 bg-green-50 dark:bg-green-950/30 text-green-700"},
 { value:"unverified", label:"Sin verificar", icon: <ShieldQuestion className="w-4 h-4"/>, color:"border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700"},
 { value:"flagged", label:"Sospechoso", icon: <ShieldAlert className="w-4 h-4"/>, color:"border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700"},
 { value:"disputed", label:"Disputado", icon: <ShieldAlert className="w-4 h-4"/>, color:"border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700"},
 ];

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setLoading(true);
 setError(null);

 const supabase = createClient();
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) { setError("No autenticado"); setLoading(false); return; }

 const { error: updateError } = await supabase
 .from("time_entries")
 .update({
 verification_status: status,
 verification_note: note || null,
 verified_by: user.id,
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

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2.5 font-bold tracking-tight">
 <ShieldCheck className="w-4 h-4 text-primary"/>
 Verificar entrada
 </DialogTitle>
 </DialogHeader>

 <div className="text-sm text-muted-foreground mb-2">
 <p className="font-medium text-foreground">{entry.title}</p>
 <p className="text-xs mt-0.5">{entry.date} - Hora {entry.hour}</p>
 </div>

 <form onSubmit={handleSubmit} className="space-y-4">
 <div className="space-y-2">
 <Label>Estado de verificacion</Label>
 <div className="grid grid-cols-2 gap-2">
 {statusOptions.map((opt) => (
 <button
 key={opt.value}
 type="button"onClick={() => setStatus(opt.value)}
 className={cn(
"flex items-center gap-2 p-3 border-2 text-sm font-semibold transition-all duration-200",
 status === opt.value ? cn(opt.color,"scale-[1.02]") :"border-transparent bg-accent/50 hover:bg-accent")}
 >
 {opt.icon}
 {opt.label}
 </button>
 ))}
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="verify-note">Nota (opcional)</Label>
 <Textarea
 id="verify-note"value={note}
 onChange={(e) => setNote(e.target.value)}
 placeholder="Razon de la verificacion o disputa..."rows={2}
 />
 </div>

 {error && (
 <div className="bg-destructive/5 border border-destructive/20 px-3 py-2">
 <p className="text-sm text-destructive font-medium">{error}</p>
 </div>
 )}

 <Button type="submit"className="w-full bg-primary hover:from-blue-700 hover:to-blue-800 text-white border-0 font-semibold"disabled={loading}>
 {loading ?"Guardando...":"Actualizar verificacion"}
 </Button>
 </form>
 </DialogContent>
 </Dialog>
 );
}
