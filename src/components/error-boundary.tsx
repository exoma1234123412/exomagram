"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[400px] px-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight">Algo salió mal</h2>
              <p className="text-sm text-muted-foreground">
                Ocurrió un error inesperado. Intenta recargar la página.
              </p>
              {this.state.error && (
                <p className="text-xs text-muted-foreground/50 font-mono mt-2 p-2 bg-muted rounded-xl">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <Button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0 shadow-lg shadow-blue-600/25 font-semibold gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Recargar página
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
