"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, MessageCircle, X } from "lucide-react";
import { buildAssistantSnapshot } from "@/lib/assistant-context";
import { getState } from "@/lib/store";

interface Msg { role: "user" | "assistant"; content: string; error?: boolean }

const STORE_KEY = "axiom.assistant.v1";
const STARTERS = [
  "What does my risk check say right now?",
  "Explain R multiples in one minute",
  "Help me write today's permitted action",
  "What should I do first today?",
];

export default function AssistantWidget() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupNote, setSetupNote] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore this browser session's conversation (survives navigation, not restarts)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) setMsgs(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-20))); } catch { /* ignore */ }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  if (path === "/login" || path === "/join") return null;

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const nextMsgs: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(nextMsgs);
    setInput("");
    setBusy(true);
    setSetupNote("");
    try {
      const snapshot = buildAssistantSnapshot(getState());
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMsgs.filter((m) => !m.error).slice(-10).map(({ role, content: c }) => ({ role, content: c })),
          snapshot,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        if (j?.setup) setSetupNote(j.setup);
        setMsgs((p) => [...p, { role: "assistant", content: j?.error ?? "Something went wrong — try again.", error: true }]);
      } else {
        setMsgs((p) => [...p, { role: "assistant", content: j.reply as string }]);
      }
    } catch {
      setMsgs((p) => [...p, { role: "assistant", content: "Couldn't reach the assistant — check your connection and try again.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the Axiom guide"
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-[#B4F03C] px-4 py-3 text-sm font-semibold text-[#0B0F0D] shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.97] md:bottom-6 md:right-6"
        >
          <MessageCircle size={18} />
          <span className="hidden sm:inline">Ask Axiom</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Axiom guide"
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82vh] flex-col overflow-hidden rounded-t-[22px] border border-[#232B26] bg-[#121714] shadow-2xl md:inset-x-auto md:bottom-6 md:right-6 md:max-h-[70vh] md:w-[400px] md:rounded-[22px]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[#232B26] px-5 py-4">
            <div>
              <div className="font-display text-lg font-semibold tracking-[-0.02em]">Axiom guide</div>
              <div className="mt-0.5 text-[11px] leading-snug text-faint">
                Answers by Claude · can be wrong · not investment advice
              </div>
            </div>
            <button type="button" className="btn-ghost -mr-2 p-2" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={17} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {msgs.length === 0 && (
              <div>
                <p className="text-sm leading-relaxed text-mut">
                  I can read your gate, journal and portfolio, explain the method, and help you finish today's
                  routine. I never recommend trades or predict markets.
                </p>
                <div className="mt-4 grid gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-[14px] border border-[#232B26] bg-white/[0.06] px-3.5 py-2.5 text-left text-sm text-ink transition-colors hover:border-[#5C6B62]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-[16px] px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-[#B4F03C] text-[#0B0F0D]"
                      : m.error
                        ? "bg-[#241111] text-[#F4645C]"
                        : "bg-[#1A211D] text-ink"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-[16px] bg-[#1A211D] px-3.5 py-2.5 text-sm text-faint">Thinking…</div>
              </div>
            )}
            {setupNote && (
              <p className="rounded-[14px] bg-[#241C0E] px-3.5 py-2.5 text-xs leading-relaxed text-[#F0B429]">{setupNote}</p>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-[#232B26] px-4 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Ask about your gate, a concept, or today's routine…"
                className="field max-h-28 min-h-[42px] flex-1 resize-none"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#B4F03C] text-[#0B0F0D] transition-transform hover:scale-[1.04] active:scale-[0.95] disabled:opacity-35"
              >
                <ArrowUp size={17} />
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-faint">
              Your question plus a snapshot of your Axiom data is sent to Anthropic to generate the answer.
              {msgs.length > 0 && (
                <>
                  {" · "}
                  <button type="button" className="underline" onClick={() => { setMsgs([]); setSetupNote(""); }}>
                    Clear conversation
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
