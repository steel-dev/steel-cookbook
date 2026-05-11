// ABOUTME: ASCII-inspired spinner — cycles braille dot frames at ~100ms.
// ABOUTME: Used next to "thinking…" and in the scraped-page pane while loading.

import { useEffect, useState } from "react";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ className = "" }: { className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => (x + 1) % FRAMES.length), 90);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span
      className={`inline-block font-mono text-primary select-none ${className}`}
      aria-label="loading"
    >
      {FRAMES[i]}
    </span>
  );
}
