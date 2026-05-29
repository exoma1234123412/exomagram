"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
 children: ReactNode;
 fallback?: ReactNode;
}

interface State {
 hasError: boolean;
 error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
 constructor(props: Props) {
 super(props);
 this.state = { hasError: false, error: null };
 }

 static getDerivedStateFromError(error: Error): State {
 return { hasError: true, error };
 }

 componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
 console.error("ErrorBoundary caught an error:", error, errorInfo);
 }

 private handleReset = () => {
 this.setState({ hasError: false, error: null });
 };

 render() {
 if (this.state.hasError) {
 if (this.props.fallback) return this.props.fallback;

 const isDev = process.env.NODE_ENV ==="development";

 return (
 <div className="flex items-center justify-center min-h-[400px] px-4">
 <Card
 className={cn(
"max-w-md w-full text-center transition-all duration-300",
"hover:border-primary/30")}
 >
 <CardContent className="py-8 space-y-6">
 <div className="w-16 h-16 bg-destructive/10 flex items-center justify-center mx-auto">
 <AlertTriangle className="w-7 h-7 text-destructive"/>
 </div>
 <div className="space-y-2">
 <h2 className="text-xl font-bold tracking-tight">
 Algo salió mal
 </h2>
 <p className="text-sm text-muted-foreground">
 Ocurrió un error inesperado. Intenta de nuevo.
 </p>
 {isDev && this.state.error && (
 <div className="bg-destructive/5 border border-destructive/20 p-3 mt-3">
 <p className="text-xs text-muted-foreground/70 font-mono break-all text-left">
 {this.state.error.message}
 </p>
 {this.state.error.stack && (
 <pre className="text-[10px] text-muted-foreground font-mono mt-2 text-left overflow-x-auto max-h-32 overflow-y-auto">
 {this.state.error.stack}
 </pre>
 )}
 </div>
 )}
 </div>
 <Button
 onClick={this.handleReset}
 className="bg-primary text-white border-0 font-semibold gap-2">
 <RefreshCw className="w-4 h-4"/>
 Reintentar
 </Button>
 </CardContent>
 </Card>
 </div>
 );
 }

 return this.props.children;
 }
}
