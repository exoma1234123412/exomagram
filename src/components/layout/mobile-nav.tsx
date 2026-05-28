"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Grid3X3, User, Plus, Eye, BarChart3 } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Timeline", icon: LayoutDashboard },
  { href: "/grid", label: "Equipo", icon: Grid3X3 },
  { href: "/accountability", label: "Control", icon: Eye },
  { href: "/weekly", label: "Semanal", icon: BarChart3 },
  { href: "/profile", label: "Perfil", icon: User },
];

export function MobileNav({ onLogEntry }: { onLogEntry: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50">
      <div className="flex items-center justify-around py-2">
        {navItems.slice(0, 2).map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1.5 text-xs transition-colors",
                isActive ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}

        <button
          onClick={onLogEntry}
          className="flex flex-col items-center gap-1 px-3 py-1.5 text-xs text-white"
        >
          <div className="w-10 h-10 bg-violet-600 rounded-full flex items-center justify-center -mt-4 shadow-lg">
            <Plus className="w-5 h-5" />
          </div>
          Registrar
        </button>

        {navItems.slice(2).map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1.5 text-xs transition-colors",
                isActive ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
