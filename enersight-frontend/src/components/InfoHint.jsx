import React, { useEffect, useId, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

import { GLOSSARY } from "../utils/glossary";

// The "what does this mean?" control that sits beside a label.
//
// Three things it deliberately does NOT do:
//
//  · It does not open on hover alone. Half the people using this are on a phone
//    where there is no hover, and a keyboard user never triggers one either. It
//    opens on click and on focus; hover is an extra for mice, never the only way.
//  · It is not a native `title` attribute. Those take about a second to appear,
//    cannot be styled, are unreadable on touch, and are skipped by some screen
//    readers.
//  · It does not put the explanation only in this popover. Anything a reader
//    genuinely needs is also written on the page; this is for the second layer
//    of detail, not the first.
//
// The button is visually small but carries a 44px hit area through padding,
// which is the minimum a finger can reliably hit.

export default function InfoHint({
  // A key from utils/glossary.js. Preferred over `text`, so the same term reads
  // identically everywhere it appears.
  term,
  text,
  label,
  className = "",
  align = "left",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const panelId = useId();

  const entry = term ? GLOSSARY[term] : null;
  const heading = label || entry?.term || "About this figure";
  const body = text || (entry ? `${entry.definition} ${entry.soWhat}` : "");

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function onPointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (!body) {
    return null;
  }

  return (
    <span
      ref={wrapperRef}
      className={`relative inline-flex ${className}`}
      // Closing on blur would fire before a click inside the panel registers, so
      // the panel is dismissed by Escape, an outside pointer, or the button.
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-label={`What is ${heading}?`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((current) => !current)}
        onFocus={() => setIsOpen(true)}
        // -m-2.5 pulls the 44px target back out of the layout, so the control
        // stays visually small without pushing the label around.
        className="-m-2.5 inline-grid h-11 w-11 place-items-center rounded-full p-2.5 text-slate-400 transition hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      >
        <HelpCircle size={14} aria-hidden="true" />
      </button>

      {isOpen && (
        <span
          id={panelId}
          role="tooltip"
          className={`absolute top-7 z-[60] block w-64 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <span className="block text-xs font-semibold text-slate-950">
            {heading}
          </span>

          <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
            {body}
          </span>
        </span>
      )}
    </span>
  );
}
