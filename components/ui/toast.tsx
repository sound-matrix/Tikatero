"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastTone = "info" | "success" | "error";

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  push: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClass: Record<ToastTone, string> = {
  info: "border-line bg-white text-ink",
  success: "border-success bg-success-soft text-ink",
  error: "border-danger bg-danger-soft text-ink",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(100%-2rem,22rem)] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <p
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-xl border px-4 py-3 font-semibold shadow-sm ${toneClass[toast.tone]}`}
          >
            {toast.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return value;
}
