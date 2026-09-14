import React, { useEffect, useId, useRef } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from "lucide-react";

const VARIANTS = {
  danger: {
    accent: "bg-red-500",
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    btnBg: "bg-red-600 hover:bg-red-700",
    Icon: Trash2,
  },
  success: {
    accent: "bg-emerald-500",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-700",
    btnBg: "bg-emerald-700 hover:bg-emerald-800",
    Icon: CheckCircle2,
  },
  warning: {
    accent: "bg-amber-500",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
    btnBg: "bg-amber-600 hover:bg-amber-700",
    Icon: AlertTriangle,
  },
};

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  note,
  confirmText,
  cancelText = "Cancel",
  variant = "danger",
  isProcessing = false,
  onCancel,
  onConfirm,
}) {
  const titleId = useId();
  const messageId = useId();
  const confirmRef = useRef(null);
  const lastFocusedRef = useRef(null);

  // Escape closes the dialog, which is the behaviour a native <dialog> would give
  // for free. Without it the only way out was the mouse.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape" && !isProcessing) {
        onCancel?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isProcessing, onCancel]);

  // Move focus into the dialog on open and put it back where it came from on
  // close, so keyboard users are not dropped at the top of the page.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    lastFocusedRef.current = document.activeElement;
    confirmRef.current?.focus();

    return () => {
      const previous = lastFocusedRef.current;

      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const { accent, iconBg, iconColor, btnBg, Icon } = VARIANTS[variant] ?? VARIANTS.danger;

  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={!isProcessing ? onCancel : undefined}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        {/* Colored top accent bar */}
        <div className={`h-1.5 w-full ${accent}`} />

        <div className="p-6">
          {/* Icon + Title */}
          <div className="flex items-start gap-4">
            <div
              className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${iconBg} ${iconColor}`}
            >
              <Icon size={26} />
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <h2
                id={titleId}
                className="text-xl font-semibold leading-tight text-slate-950"
              >
                {title}
              </h2>
              <p
                id={messageId}
                className="mt-2 text-sm font-normal leading-6 text-slate-500"
              >
                {message}
              </p>
            </div>
          </div>

          {/* Note callout */}
          {note && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <AlertTriangle
                size={15}
                className="mt-0.5 shrink-0 text-amber-600"
              />
              <p className="text-xs font-normal leading-5 text-amber-800">{note}</p>
            </div>
          )}

          {/* Divider */}
          <div className="mt-6 border-t border-slate-100" />

          {/* Buttons */}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="rounded-2xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelText}
            </button>

            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              disabled={isProcessing}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${btnBg}`}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Processing...
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
