"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A section that is open on a desk and folds to one line on a phone, so the most urgent work is never pushed
 * off-screen by reports. It renders open (so nothing is hidden before the page has loaded, and on a desk it
 * never moves); on a narrow screen it folds once, when the page first loads. The summary line says what is
 * inside, so a folded section is never mistaken for an empty one.
 */
export function PhoneCollapse({ summary, children, className, summaryClassName }: { summary: ReactNode; children: ReactNode; className?: string; summaryClassName?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && !window.matchMedia("(min-width: 900px)").matches) ref.current.open = false;
  }, []);
  return <details ref={ref} className={className} open>
    <summary className={summaryClassName}>{summary}</summary>
    {children}
  </details>;
}
