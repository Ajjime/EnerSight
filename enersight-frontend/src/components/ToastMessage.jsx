import React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

const ToastMessage = ({ message, type = "success", onClose }) => {
  if (!message) {
    return null;
  }

  const isError = type === "error";

  const toastContent = (
    <div className="pointer-events-none fixed right-6 top-6 z-[70000] w-[360px] max-w-[calc(100vw-3rem)] animate-fade-in">
      {/* Announced to screen readers. Every success and error in the app surfaces
          through here and none of it was announced, so a non-sighted user got no
          feedback at all from an action, and the message vanishes after 2.5s.
          role="alert" is assertive for errors; "status" is polite for successes. */}
      <div
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
        className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl ${
          isError
            ? "border-red-100 bg-red-50 text-red-800"
            : "border-emerald-100 bg-emerald-50 text-emerald-800"
        }`}
      >
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
            isError ? "bg-red-600 text-white" : "bg-emerald-700 text-white"
          }`}
        >
          {isError ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {isError ? "Something went wrong" : "Success"}
          </p>

          <p className="mt-1 text-sm font-normal leading-5 opacity-85">
            {message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close notification"
          className="shrink-0 rounded-xl p-1.5 opacity-70 transition hover:bg-white/70 hover:opacity-100"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );

  return createPortal(toastContent, document.body);
};

export default ToastMessage;