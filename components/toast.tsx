"use client";

import { useEffect, useState } from "react";
import { CheckCircle, AlertTriangle, XCircle, X } from "lucide-react";

export type ToastType = "success" | "warning" | "error";
interface Toast { id: number; message: string; type: ToastType; }

let nextId = 1;
const listeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];

export function toast(message: string, type: ToastType = "success") {
  const t = { id: nextId++, message, type };
  toasts = [...toasts, t];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listeners.forEach((l) => l(toasts));
  }, 4000);
}

export function ToastContainer() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => { listeners.add(setList); return () => { listeners.delete(setList); }; }, []);
  if (!list.length) return null;

  const styles = {
    success: { bg: "#10241C", border: "#1F4636", icon: "#34D399", Icon: CheckCircle },
    warning: { bg: "#241C0E", border: "#4A3A16", icon: "#F0B429", Icon: AlertTriangle },
    error:   { bg: "#241111", border: "#4A1F1F", icon: "#F4645C", Icon: XCircle },
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 md:bottom-6" role="region" aria-label="Notifications">
      {list.map((t) => {
        const s = styles[t.type];
        return (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm font-medium text-ink"
            style={{ background: s.bg, borderColor: s.border, minWidth: 260, maxWidth: 360 }}
            role="alert"
          >
            <s.Icon size={16} style={{ color: s.icon, flexShrink: 0 }} />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => { toasts = toasts.filter((x) => x.id !== t.id); listeners.forEach((l) => l(toasts)); }}
              className="text-faint hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
