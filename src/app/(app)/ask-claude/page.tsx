"use client";

import { useState, useRef, useEffect } from "react";
import { useOrg } from "@/lib/context/org-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageSquare, Send, Loader2, Cpu, User, Sparkles } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  "Quien fue mas productivo esta semana?",
  "Cuando fue la ultima vez que todos cumplieron 8 horas?",
  "Muestra la tendencia de evidencia de cada persona",
  "Quien tiene mas flags este mes?",
  "Cual es el dia mas debil del equipo?",
  "Compara el deep work de todos en los ultimos 7 dias",
  "Quien tiene el Trust Score mas bajo y por que?",
  "Cuantas promesas se han roto esta semana?",
];

export default function AskClaudePage() {
  const { orgId, userId, loading: orgLoading } = useOrg();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!orgLoading && orgId) {
      inputRef.current?.focus();
    }
  }, [orgLoading, orgId]);

  async function handleSubmit(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading || !orgId) return;

    setInput("");
    setError(null);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: q,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/ask-claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, org_id: orgId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Error desconocido");
        setLoading(false);
        return;
      }

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  // Loading state
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-muted-foreground font-mono text-xs tracking-widest uppercase">
          Cargando...
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground font-mono text-xs">
          Sin organizacion
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col h-[calc(100vh-2rem)] md:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 border border-border flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-mono font-bold tracking-tight uppercase">
              Ask Claude
            </h1>
            <p className="text-xs font-mono text-muted-foreground">
              Pregunta lo que sea sobre los datos de tu equipo
            </p>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 min-h-0">
        {/* Empty state with suggestions */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 border border-border flex items-center justify-center mb-6">
              <Cpu className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-mono text-sm text-muted-foreground mb-1">
              Acceso directo a todos los datos
            </p>
            <p className="font-mono text-[10px] text-muted-foreground mb-8">
              30 dias de entradas, Trust Scores, flags, rachas, promesas
            </p>

            <div className="w-full max-w-lg">
              <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
                Preguntas sugeridas
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSubmit(q)}
                    className="text-left px-3 py-2.5 border border-border bg-accent/20 hover:bg-accent/40 hover:border-primary/30 transition-colors font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Sparkles className="w-3 h-3 inline mr-1.5 text-primary" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] sm:max-w-[80%]",
                msg.role === "user"
                  ? "bg-primary/10 border border-primary/20 px-4 py-3"
                  : "bg-accent/30 border border-border px-4 py-3",
              )}
            >
              {/* Role label */}
              <div className="flex items-center gap-1.5 mb-2">
                {msg.role === "assistant" ? (
                  <>
                    <Cpu className="w-3 h-3 text-primary" />
                    <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary font-semibold">
                      Claude
                    </span>
                  </>
                ) : (
                  <>
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
                      Tu
                    </span>
                  </>
                )}
                <span className="font-mono text-[9px] text-muted-foreground ml-auto">
                  {msg.timestamp.toLocaleTimeString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {/* Content */}
              {msg.role === "assistant" ? (
                <div className="font-mono text-xs leading-relaxed prose-invert prose-sm max-w-none">
                  <MarkdownContent content={msg.content} />
                </div>
              ) : (
                <p className="font-mono text-xs leading-relaxed">
                  {msg.content}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-accent/30 border border-border px-4 py-3 max-w-[80%]">
              <div className="flex items-center gap-2">
                <Cpu className="w-3 h-3 text-primary" />
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-primary font-semibold">
                  Claude
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span className="font-mono text-xs text-muted-foreground animate-pulse">
                  Analizando datos del equipo...
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-destructive/5 border border-destructive/20 px-4 py-3">
            <p className="font-mono text-xs text-destructive">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions (when in conversation) */}
      {messages.length > 0 && !loading && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-none">
          {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
            <button
              key={i}
              onClick={() => handleSubmit(q)}
              className="whitespace-nowrap text-[10px] font-mono px-2.5 py-1.5 border border-border bg-accent/20 hover:bg-accent/40 hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground shrink-0"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border border-border bg-accent/20 flex items-center gap-2 px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Preguntale a Claude sobre tu equipo..."
          disabled={loading}
          className="flex-1 bg-transparent font-mono text-xs placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        <Button
          onClick={() => handleSubmit()}
          disabled={loading || !input.trim()}
          size="sm"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs h-8 px-3"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      <p className="font-mono text-[9px] text-muted-foreground mt-2 text-center">
        Claude analiza los ultimos 30 dias de datos de tu equipo en tiempo real
      </p>
    </div>
  );
}

// Simple markdown renderer for Claude's responses
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableKey = 0;

  function flushTable() {
    if (tableRows.length === 0) return;
    const headers = tableRows[0];
    // Skip the separator row (row index 1 with dashes)
    const dataRows = tableRows.slice(2);
    elements.push(
      <div key={`table-${tableKey++}`} className="overflow-x-auto my-2">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="text-left px-2 py-1.5 border border-border bg-accent/30 text-muted-foreground font-semibold text-[10px] uppercase tracking-wider"
                >
                  {h.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-2 py-1.5 border border-border tabular-nums"
                  >
                    <InlineMarkdown text={cell.trim()} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableRows = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table detection
    if (line.includes("|") && line.trim().startsWith("|")) {
      const cells = line
        .split("|")
        .slice(1, -1); // Remove leading/trailing empty from split
      if (cells.length > 0) {
        inTable = true;
        tableRows.push(cells);
        continue;
      }
    } else if (inTable) {
      flushTable();
    }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="font-mono font-bold text-xs mt-3 mb-1">
          <InlineMarkdown text={line.slice(4)} />
        </h4>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="font-mono font-bold text-sm mt-4 mb-1.5">
          <InlineMarkdown text={line.slice(3)} />
        </h3>,
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="font-mono font-bold text-base mt-4 mb-2">
          <InlineMarkdown text={line.slice(2)} />
        </h2>,
      );
    }
    // Bullet points
    else if (line.match(/^\s*[-*]\s/)) {
      const text = line.replace(/^\s*[-*]\s/, "");
      elements.push(
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-primary mt-0.5 shrink-0">-</span>
          <span>
            <InlineMarkdown text={text} />
          </span>
        </div>,
      );
    }
    // Numbered list
    else if (line.match(/^\s*\d+\.\s/)) {
      const match = line.match(/^(\s*\d+)\.\s(.*)/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-2 ml-2 my-0.5">
            <span className="text-muted-foreground tabular-nums shrink-0">
              {match[1].trim()}.
            </span>
            <span>
              <InlineMarkdown text={match[2]} />
            </span>
          </div>,
        );
      }
    }
    // Empty line
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    }
    // Regular paragraph
    else {
      elements.push(
        <p key={i} className="my-0.5">
          <InlineMarkdown text={line} />
        </p>,
      );
    }
  }

  // Flush any remaining table
  if (inTable) flushTable();

  return <>{elements}</>;
}

// Inline markdown: **bold**, *italic*, `code`, numbers
function InlineMarkdown({ text }: { text: string }) {
  // Split by markdown patterns
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`(.+?)`/);
    // Italic (single *)
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);

    // Find earliest match
    const matches = [
      boldMatch ? { type: "bold", match: boldMatch } : null,
      codeMatch ? { type: "code", match: codeMatch } : null,
      italicMatch ? { type: "italic", match: italicMatch } : null,
    ]
      .filter(Boolean)
      .sort((a, b) => (a!.match.index ?? 0) - (b!.match.index ?? 0));

    if (matches.length === 0) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    const first = matches[0]!;
    const idx = first.match.index ?? 0;

    // Text before match
    if (idx > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>);
    }

    if (first.type === "bold") {
      parts.push(
        <strong key={key++} className="font-bold text-foreground">
          {first.match[1]}
        </strong>,
      );
    } else if (first.type === "code") {
      parts.push(
        <code
          key={key++}
          className="bg-accent/50 border border-border px-1 py-0.5 text-[10px] font-mono"
        >
          {first.match[1]}
        </code>,
      );
    } else if (first.type === "italic") {
      parts.push(
        <em key={key++} className="italic text-muted-foreground">
          {first.match[1]}
        </em>,
      );
    }

    remaining = remaining.slice(idx + first.match[0].length);
  }

  return <>{parts}</>;
}
