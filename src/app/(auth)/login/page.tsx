"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";

export default function LoginPage() {
 const [email, setEmail] = useState("");
 const [password, setPassword] = useState("");
 const [error, setError] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);
 const router = useRouter();
 const supabase = createClient();

 async function handleLogin(e: React.FormEvent) {
 e.preventDefault();
 setLoading(true);
 setError(null);

 const { error } = await supabase.auth.signInWithPassword({
 email,
 password,
 });

 if (error) {
 setError(error.message);
 setLoading(false);
 } else {
 router.push("/dashboard");
 router.refresh();
 }
 }

 return (
 <div className="min-h-screen flex items-center justify-center p-4 bg-background">
 <Card className="w-full max-w-sm border-border">
 <CardHeader className="text-center space-y-4 pb-2">
 <div className="mx-auto">
 <Logo size={40} />
 </div>
 <div className="space-y-1">
 <CardTitle className="text-base font-semibold tracking-tight">Exomagram</CardTitle>
 <CardDescription className="text-xs text-muted-foreground">
 Inicia sesion para continuar
 </CardDescription>
 </div>
 </CardHeader>
 <CardContent className="pt-2">
 <form onSubmit={handleLogin} className="space-y-4">
 <div className="space-y-2">
 <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
 <Input
 id="email"type="email"placeholder="tu@email.com"value={email}
 onChange={(e) => setEmail(e.target.value)}
 required
 className="h-10 font-mono text-sm"/>
 </div>
 <div className="space-y-2">
 <Label htmlFor="password" className="text-xs text-muted-foreground">Contrasena</Label>
 <Input
 id="password"type="password"placeholder="••••••••"value={password}
 onChange={(e) => setPassword(e.target.value)}
 required
 className="h-10 font-mono text-sm"/>
 </div>
 {error && (
 <div className="bg-destructive/5 border border-destructive/30 px-3 py-2">
 <p className="text-xs font-mono text-destructive font-medium">{error}</p>
 </div>
 )}
 <Button
 type="submit" className="w-full h-10 text-sm font-medium" disabled={loading}
 >
 {loading ? "Verificando..." : "Iniciar sesion"}
 </Button>
 </form>
 <p className="text-center text-[10px] font-mono text-muted-foreground mt-4">
 <Link href="/forgot-password"className="text-foreground/70 hover:text-primary transition-colors underline underline-offset-2">
 Recuperar acceso
 </Link>
 </p>
 <p className="text-center text-[10px] font-mono text-muted-foreground mt-2">
 Sin acceso?{" "}
 <Link href="/signup"className="text-foreground/70 hover:text-primary transition-colors underline underline-offset-2">
 Solicitar cuenta
 </Link>
 </p>
 </CardContent>
 </Card>
 </div>
 );
}
