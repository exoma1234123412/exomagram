"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Camera, Clock, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";

// PSYCHOLOGY: Random proof request
// At random intervals, you must upload a screenshot of what you're working on RIGHT NOW.
// 3 minutes to respond. Miss it = flag + trust score penalty.
// You can't prepare because it's random.
// The screenshot is stored and visible to admins in the audit log.

export function ProofSnapshotProvider({ children }: { children: React.ReactNode }) {
 const [showRequest, setShowRequest] = useState(false);
 const [deadline, setDeadline] = useState(0);
 const [timeLeft, setTimeLeft] = useState(180);
 const [imageUrl, setImageUrl] = useState<string | null>(null);
 const [uploading, setUploading] = useState(false);
 const [submitted, setSubmitted] = useState(false);
 const [description, setDescription] = useState("");
 const fileRef = useRef<HTMLInputElement>(null);
 const supabase = createClient();

 useEffect(() => {
 function scheduleNext() {
 const hour = new Date().getHours();
 if (hour < 8 || hour > 17) return;

 // Random: every 2-4 hours
 const delayMinutes = 120 + Math.floor(Math.random() * 120);
 setTimeout(() => {
 const currentHour = new Date().getHours();
 if (currentHour >= 8 && currentHour <= 17) {
 setShowRequest(true);
 setDeadline(Date.now() + 180_000);
 setTimeLeft(180);
 setSubmitted(false);
 setImageUrl(null);
 setDescription("");
 }
 scheduleNext();
 }, delayMinutes * 60_000);
 }
 scheduleNext();
 }, []);

 // Countdown
 useEffect(() => {
 if (!showRequest || submitted) return;
 const interval = setInterval(() => {
 const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
 setTimeLeft(left);
 if (left === 0) {
 logResult("missed");
 setShowRequest(false);
 }
 }, 1000);
 return () => clearInterval(interval);
 }, [showRequest, deadline, submitted]);

 async function logResult(status:"submitted"|"missed") {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) return;
 const { data: membership } = await supabase
 .from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
 if (!membership) return;

 await supabase.from("audit_log").insert({
 org_id: membership.org_id,
 user_id: user.id,
 action:"entry_created",
 target_type:"proof_snapshot",
 new_data: {
 status,
 image_url: imageUrl,
 description,
 response_time_seconds: 180 - timeLeft,
 timestamp: new Date().toISOString(),
 },
 });

 if (status ==="missed") {
 await supabase.from("accountability_flags").insert({
 user_id: user.id,
 org_id: membership.org_id,
 flag_type:"suspicious_pattern",
 date: new Date().toISOString().split("T")[0],
 details:"No subió screenshot de prueba en 3 minutos",
 });
 }
 }

 async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
 const file = e.target.files?.[0];
 if (!file) return;
 setUploading(true);

 // Convert to base64 data URL for storage (or use Supabase Storage)
 const reader = new FileReader();
 reader.onload = () => {
 setImageUrl(reader.result as string);
 setUploading(false);
 };
 reader.readAsDataURL(file);
 }

 async function handleSubmit() {
 if (!imageUrl) return;
 await logResult("submitted");
 setSubmitted(true);
 setTimeout(() => setShowRequest(false), 2000);
 }

 const minutes = Math.floor(timeLeft / 60);
 const seconds = timeLeft % 60;

 return (
 <>
 {children}
 <Dialog open={showRequest} onOpenChange={() => {}}>
 <DialogContent className="sm:max-w-md [&>button]:hidden">
 {submitted ? (
 <div className="text-center py-8">
 <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3"/>
 <h3 className="text-lg font-bold">Screenshot recibido</h3>
 <p className="text-sm text-muted-foreground">Registrado en el audit log.</p>
 </div>
 ) : (
 <>
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Camera className="w-5 h-5 text-primary"/>
 Prueba de pantalla
 </DialogTitle>
 </DialogHeader>

 <div className="text-center mb-3">
 <div className={cn(
"inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-mono font-bold",
 timeLeft > 90 ?"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400": timeLeft > 30 ?"bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400":"bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse")}>
 <Clock className="w-4 h-4"/>
 {minutes}:{String(seconds).padStart(2,"0")}
 </div>
 </div>

 <p className="text-sm text-center text-muted-foreground mb-4">
 Toma un screenshot de tu pantalla <span className="font-bold text-foreground">AHORA MISMO</span> y súbelo.
 <br />
 <span className="text-[10px]">3 minutos. Si no respondes, se registra como ausencia.</span>
 </p>

 {/* Upload area */}
 <div
 onClick={() => fileRef.current?.click()}
 className={cn(
"border-2 border-dashed p-6 text-center cursor-pointer transition-all",
 imageUrl ?"border-green-300 bg-green-50 dark:bg-green-950/20":"border-border hover:border-primary/50 hover:bg-accent/30")}
 >
 {uploading ? (
 <p className="text-sm text-muted-foreground">Subiendo...</p>
 ) : imageUrl ? (
 <div>
 <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2"/>
 <p className="text-sm text-green-700 dark:text-green-400 font-medium">Screenshot listo</p>
 <p className="text-[10px] text-muted-foreground mt-1">Click para cambiar</p>
 </div>
 ) : (
 <div>
 <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2"/>
 <p className="text-sm text-muted-foreground">Click para subir screenshot</p>
 <p className="text-[10px] text-muted-foreground/60 mt-1">PNG, JPG, o WEBP</p>
 </div>
 )}
 </div>
 <input ref={fileRef} type="file"accept="image/*"className="hidden"onChange={handleFileChange} />

 <Input
 placeholder="¿Qué estás haciendo? (opcional)"value={description}
 onChange={(e) => setDescription(e.target.value)}
 />

 <Button onClick={handleSubmit} disabled={!imageUrl} className="w-full gap-2">
 <Camera className="w-4 h-4"/>
 Enviar prueba
 </Button>
 </>
 )}
 </DialogContent>
 </Dialog>
 </>
 );
}
