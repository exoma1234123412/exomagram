"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Card,
 CardContent,
 CardDescription,
 CardHeader,
 CardTitle,
} from "@/components/ui/card";
import { Clock, Lock, ArrowLeft } from "lucide-react";

export default function ResetPasswordPage() {
 const [password, setPassword] = useState("");
 const [confirmPassword, setConfirmPassword] = useState("");
 const [error, setError] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);
 const router = useRouter();
 const supabase = createClient();

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setError(null);

 if (password.length < 8) {
 setError("La contraseña debe tener al menos 8 caracteres.");
 return;
 }

 if (password !== confirmPassword) {
 setError("Las contraseñas no coinciden.");
 return;
 }

 setLoading(true);

 const { error } = await supabase.auth.updateUser({ password });

 if (error) {
 setError(error.message);
 setLoading(false);
 } else {
 router.push("/login");
 }
 }

 return (
 <div className="min-h-screen flex items-center justify-center p-4 bg-background">
 <Card className="w-full max-w-md border-border/50">
 <CardHeader className="text-center space-y-3 pb-2">
 <div className="mx-auto w-10 h-10 bg-primary flex items-center justify-center mb-1">
 <Clock className="w-5 h-5 text-primary-foreground"/>
 </div>
 <div className="space-y-1">
 <CardTitle className="text-xl font-medium tracking-tight">
 Restablecer contraseña
 </CardTitle>
 <CardDescription className="text-muted-foreground">
 Ingresa tu nueva contraseña
 </CardDescription>
 </div>
 </CardHeader>
 <CardContent className="pt-2">
 <form onSubmit={handleSubmit} className="space-y-4">
 <div className="space-y-2">
 <Label htmlFor="password"className="text-sm font-medium">
 Nueva contraseña
 </Label>
 <div className="relative">
 <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
 <Input
 id="password"type="password"placeholder="••••••••"value={password}
 onChange={(e) => setPassword(e.target.value)}
 required
 minLength={8}
 className="h-10 pl-9"/>
 </div>
 <p className="text-xs text-muted-foreground">
 Mínimo 8 caracteres
 </p>
 </div>
 <div className="space-y-2">
 <Label htmlFor="confirmPassword"className="text-sm font-medium">
 Confirmar contraseña
 </Label>
 <div className="relative">
 <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
 <Input
 id="confirmPassword"type="password"placeholder="••••••••"value={confirmPassword}
 onChange={(e) => setConfirmPassword(e.target.value)}
 required
 minLength={8}
 className="h-10 pl-9"/>
 </div>
 </div>
 {error && (
 <div className="bg-destructive/5 border border-destructive/20 px-3 py-2">
 <p className="text-sm text-destructive font-medium">{error}</p>
 </div>
 )}
 <Button
 type="submit"className="w-full h-10 font-medium"disabled={loading}
 >
 {loading ?"Restableciendo...":"Restablecer contraseña"}
 </Button>
 </form>
 <p className="text-center text-sm text-muted-foreground mt-4">
 <Link
 href="/login"className="text-foreground hover:underline font-medium transition-colors inline-flex items-center gap-1">
 <ArrowLeft className="w-3 h-3"/>
 Volver al inicio de sesión
 </Link>
 </p>
 </CardContent>
 </Card>
 </div>
 );
}
