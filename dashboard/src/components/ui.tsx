"use client";

import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";
import { X, Loader2 } from "lucide-react";
import { toast, type ToastLevel } from "@/lib/api";

/* ── layout primitives ─────────────────────────────────────────────── */

export function Card({
  title,
  actions,
  children,
  className = "",
  pad = true,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  sub,
  accent,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "good" | "warn" | "crit" | "info" | undefined;
  children?: ReactNode; // e.g. a sparkline
}) {
  const valueColor =
    accent === "good"
      ? "text-good"
      : accent === "warn"
        ? "text-warn"
        : accent === "crit"
          ? "text-crit"
          : "text-ink";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink2">{sub}</div>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

/* ── controls ──────────────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "warn";
  size?: "sm" | "md";
  busy?: boolean;
};

export function Button({
  variant = "ghost",
  size = "md",
  busy = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed";
  const sizes = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";
  const variants = {
    primary: "bg-accent-deep text-white hover:bg-accent-deep/80",
    ghost: "border border-border bg-surface2 text-ink hover:bg-surface3",
    danger: "border border-crit/40 bg-crit/10 text-crit hover:bg-crit/20",
    warn: "border border-warn/40 bg-warn/10 text-warn hover:bg-warn/20",
  }[variant];
  return (
    <button className={`${base} ${sizes} ${variants} ${className}`} disabled={disabled || busy} {...rest}>
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={`rounded-lg border border-border bg-surface2 px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-accent-deep focus:outline-none ${className}`}
      {...rest}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-sm text-ink focus:border-accent-deep focus:outline-none ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-accent-deep" : "bg-surface3"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-4.5" : "left-0.5"}`}
        />
      </button>
      {label}
    </label>
  );
}

export function Badge({
  color = "muted",
  children,
}: {
  color?: "good" | "warn" | "crit" | "info" | "muted" | "accent";
  children: ReactNode;
}) {
  const map = {
    good: "bg-good/15 text-good border-good/30",
    warn: "bg-warn/15 text-warn border-warn/30",
    crit: "bg-crit/15 text-crit border-crit/30",
    info: "bg-info/15 text-info border-info/30",
    accent: "bg-accent/15 text-accent border-accent/30",
    muted: "bg-surface3 text-ink2 border-border",
  }[color];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${map}`}>
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <div className="text-sm font-medium text-ink2">{title}</div>
      {hint && <div className="max-w-sm text-xs text-muted">{hint}</div>}
    </div>
  );
}

/* ── modal ─────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-xl border border-border bg-surface shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={16} />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ── tabs ──────────────────────────────────────────────────────────── */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-surface2 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            active === t.id ? "bg-surface3 text-ink" : "text-muted hover:text-ink2"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── toaster ───────────────────────────────────────────────────────── */

type ToastItem = { id: number; message: string; level: ToastLevel };

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    let nextId = 1;
    const onToast = (e: Event) => {
      const { message, level } = (e as CustomEvent).detail as { message: string; level: ToastLevel };
      const id = nextId++;
      setItems((xs) => [...xs, { id, message, level }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5000);
    };
    window.addEventListener("craftdeck-toast", onToast);
    return () => window.removeEventListener("craftdeck-toast", onToast);
  }, []);

  const colors: Record<ToastLevel, string> = {
    info: "border-info/40",
    success: "border-good/40",
    warn: "border-warn/40",
    error: "border-crit/40",
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg border ${colors[t.level]} bg-surface2 px-3.5 py-2.5 text-sm text-ink shadow-xl`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export { toast };
