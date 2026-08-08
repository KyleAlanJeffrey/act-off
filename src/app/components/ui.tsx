import type { ReactNode } from "react";

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className ?? ""}`}>{name}</span>
  );
}

/** Ambient neon blobs behind every page. */
export function BgBlobs() {
  return (
    <div className="fixed inset-0 pointer-events-none opacity-40 overflow-hidden">
      <div className="bg-blob top-[8%] left-[18%] w-[38vw] h-[38vw] bg-primary-container" />
      <div
        className="bg-blob bottom-[15%] right-[8%] w-[32vw] h-[32vw] bg-secondary-container"
        style={{ animationDelay: "-4.5s" }}
      />
    </div>
  );
}

export function NeonButton({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "tertiary" | "danger" | "ghost";
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-primary-container text-on-primary-container border-primary glow-primary hover:-translate-y-0.5",
    secondary:
      "bg-transparent text-secondary-container border-secondary-container hover:bg-secondary-container hover:text-on-secondary",
    tertiary:
      "bg-tertiary text-on-tertiary border-tertiary-fixed glow-tertiary hover:-translate-y-0.5",
    danger:
      "bg-error-container text-white border-error glow-error hover:-translate-y-0.5",
    ghost:
      "bg-surface-container-high text-on-surface border-outline-variant hover:border-outline",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-body font-bold uppercase tracking-wider text-sm rounded-full border-3 px-6 py-3 transition-all duration-200 active:translate-y-0.5 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center gap-2 cursor-pointer ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
  active = false,
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <div
      className={`bg-surface-container-high/90 backdrop-blur-sm rounded-lg border-3 transition-colors duration-300 ${
        active ? "border-secondary-container glow-secondary" : "border-outline-variant"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Chip({
  children,
  color = "lime",
  className = "",
}: {
  children: ReactNode;
  color?: "lime" | "cyan" | "pink" | "dim";
  className?: string;
}) {
  const styles = {
    lime: "bg-tertiary text-on-tertiary",
    cyan: "bg-secondary-container text-on-secondary",
    pink: "bg-primary-container text-on-primary-container",
    dim: "bg-surface-container-highest text-on-surface-variant",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${styles[color]} ${className}`}
    >
      {children}
    </span>
  );
}

export function LevelMeter({ level, className = "" }: { level: number; className?: string }) {
  const bars = 14;
  const lit = Math.round(level * bars);
  return (
    <div className={`flex items-end gap-1 h-6 ${className}`}>
      {Array.from({ length: bars }, (_, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-full transition-colors duration-75 ${
            i < lit
              ? i > bars - 4
                ? "bg-error"
                : "bg-tertiary"
              : "bg-surface-container-highest"
          }`}
          style={{ height: `${30 + (i / bars) * 70}%` }}
        />
      ))}
    </div>
  );
}
