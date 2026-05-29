import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchX, Home } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <SearchX className="w-8 h-8 text-primary/40" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Página no encontrada</h2>
          <p className="text-sm text-muted-foreground">
            La página que buscas no existe o fue movida.
          </p>
          <Button className="gap-2 rounded-xl" render={<Link href="/feed" />}>
            <Home className="w-4 h-4" />
            Volver al inicio
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
