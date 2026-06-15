"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

type MenuItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
};

export function RecurringRowMoreMenu({
  items,
  ariaLabel = "Más opciones",
}: {
  items: MenuItem[];
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  }

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="rounded p-1 text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-soft-bg)] hover:text-[var(--copilot-ink)]"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && pos ? (
        <div
          ref={menuRef}
          className="fixed z-[var(--copilot-z-modal)] min-w-[140px] overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] py-1 shadow-lg"
          style={{ top: pos.top, right: pos.right }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`block w-full px-3 py-2 text-left text-xs transition hover:bg-[var(--copilot-soft-bg)] ${
                item.danger
                  ? "text-[var(--copilot-danger-text)]"
                  : "text-[var(--copilot-ink)]"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
