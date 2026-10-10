"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "ripple.welcome.dismissed";

interface Props { visible: boolean; onConnect: () => void; }

export default function WelcomeBanner({ visible, onConnect }: Props) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1"); }
    catch { setDismissed(false); }
  }, []);

  if (!visible || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* storage unavailable */ }
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
    <div className="panel pointer-events-auto flex w-full max-w-[600px] animate-spring-in items-center gap-3 py-2.5 pl-4 pr-2">
      <span className="flex shrink-0 gap-1" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-[#FF8A3D]" />
        <span className="h-2 w-2 rounded-full bg-[#22B573]" />
        <span className="h-2 w-2 rounded-full bg-[#3B9EFF]" />
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px] leading-5 text-ink">
        Sample graph. <span className="text-muted">Connect SerpApi for live Google results.</span>
      </p>
      <button className="primary-button h-8 shrink-0 animate-nudge px-3 text-xs" onClick={onConnect}>Connect SerpApi</button>
      <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint transition hover:text-ink" onClick={dismiss} aria-label="Dismiss"><X className="h-4 w-4" /></button>
    </div>
    </div>
  );
}
