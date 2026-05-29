"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Profile } from "@/lib/types/database";
import { CATEGORIES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { Search, Command } from "lucide-react";

type EntryWithProfile = TimeEntry & { profiles: Profile };

const QUICK_LINKS = [
  { label: "Timeline", href: "/dashboard", shortcut: "d" },
  { label: "Accountability", href: "/accountability", shortcut: "a" },
  { label: "Leaderboard", href: "/leaderboard", shortcut: "l" },
  { label: "Weekly", href: "/weekly", shortcut: "w" },
  { label: "Insights", href: "/insights", shortcut: "i" },
  { label: "Profile", href: "/profile", shortcut: "p" },
  { label: "Team Now", href: "/now", shortcut: "n" },
  { label: "Org Stats", href: "/org-stats", shortcut: "o" },
  { label: "Settings", href: "/settings", shortcut: "s" },
];

interface KeyboardShortcutsProps {
  onNewEntry?: () => void;
}

export function KeyboardShortcuts({ onNewEntry }: KeyboardShortcutsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntryWithProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Listen for cmd+k and cmd+n
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onNewEntry?.();
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onNewEntry]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSearching(false); return; }

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) { setSearching(false); return; }

    const { data } = await supabase
      .from("time_entries")
      .select("*, profiles(*)")
      .eq("org_id", membership.org_id)
      .or(`title.ilike.%${q}%,description.ilike.%${q}%,project.ilike.%${q}%`)
      .order("date", { ascending: false })
      .limit(8)
      ;

    setResults(data ?? []);
    setSearching(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleInput(value: string) {
    setQuery(value);
    const timer = setTimeout(() => search(value), 300);
    return () => clearTimeout(timer);
  }

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const filteredLinks = query
    ? QUICK_LINKS.filter((l) => l.label.toLowerCase().includes(query.toLowerCase()))
    : QUICK_LINKS;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Command palette */}
      <div className="relative w-full max-w-lg bg-background/95 glass border border-border/50 rounded-2xl shadow-2xl shadow-primary/10 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50">
          <Search className="w-4 h-4 text-muted-foreground/60" />
          <input
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Buscar entradas, paginas..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/40"
            autoFocus
          />
          <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {/* Quick links */}
          {filteredLinks.length > 0 && (
            <div className="p-2">
              <p className="text-[10px] text-muted-foreground px-2 mb-1">Paginas</p>
              {filteredLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => navigate(link.href)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-accent/60 transition-all duration-150 text-left group/cmd"
                >
                  <span className="flex-1">{link.label}</span>
                  <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{link.shortcut}</kbd>
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {results.length > 0 && (
            <div className="p-2 border-t">
              <p className="text-[10px] text-muted-foreground px-2 mb-1">Entradas</p>
              {results.map((entry) => {
                const cat = CATEGORIES[entry.category];
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    {entry.profiles && (
                      <Avatar className="w-5 h-5">
                        <AvatarImage src={entry.profiles.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[8px]">{getInitials(entry.profiles.full_name)}</AvatarFallback>
                      </Avatar>
                    )}
                    <span className="text-sm flex-1 truncate">{entry.title}</span>
                    <span className="text-[10px] text-muted-foreground">{entry.date}</span>
                    <Badge variant="secondary" className={cn("text-[9px] py-0", cat.color, cat.bgColor)}>
                      {cat.emoji}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          {searching && (
            <p className="text-xs text-muted-foreground text-center py-3">Buscando...</p>
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border/50 bg-muted/30 text-[10px] text-muted-foreground/60">
          <span className="flex items-center gap-1.5">
            <kbd className="bg-background/80 border border-border/50 px-1.5 py-0.5 rounded-md font-mono text-[9px] shadow-sm">
              <Command className="w-2.5 h-2.5 inline" />K
            </kbd>
            Buscar
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="bg-background/80 border border-border/50 px-1.5 py-0.5 rounded-md font-mono text-[9px] shadow-sm">
              <Command className="w-2.5 h-2.5 inline" />N
            </kbd>
            Nueva entrada
          </span>
          <span className="flex items-center gap-1.5 ml-auto">
            <kbd className="bg-background/80 border border-border/50 px-1.5 py-0.5 rounded-md font-mono text-[9px] shadow-sm">
              ESC
            </kbd>
            Cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
