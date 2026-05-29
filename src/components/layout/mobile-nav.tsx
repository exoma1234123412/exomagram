"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, LayoutDashboard, Plus, Brain, User } from "lucide-react";

const leftTabs = [
  { href: "/home", label: "Inicio", icon: Home },
  { href: "/dashboard", label: "Timeline", icon: LayoutDashboard },
];

const rightTabs = [
  { href: "/brain", label: "AI", icon: Brain },
  { href: "/profile", label: "Perfil", icon: User },
];

export function MobileNav({ onLogEntry }: { onLogEntry: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/80 glass border-t border-border/50 z-50 safe-area-pb">
      <div className="flex items-center justify-around py-2 px-1">
        {leftTabs.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium transition-all duration-200 rounded-xl",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:scale-95"
              )}
            >
              <item.icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
              {item.label}
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />
              )}
            </Link>
          );
        })}

        <button
          onClick={onLogEntry}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium text-white active:scale-95 transition-transform"
        >
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center -mt-6 shadow-xl shadow-blue-600/30 ring-4 ring-background">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-foreground mt-0.5">Registrar</span>
        </button>

        {rightTabs.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium transition-all duration-200 rounded-xl",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:scale-95"
              )}
            >
              <item.icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
              {item.label}
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
