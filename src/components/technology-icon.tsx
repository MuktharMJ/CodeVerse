import type { CSSProperties } from "react";

export function TechnologyIcon({ symbol, className, style }: { symbol: string; className?: string; style?: CSSProperties }) {
  const props = { className, style, "aria-hidden": true as const };
  if (symbol === "react") return <svg {...props} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="20" cy="20" rx="18" ry="7" /><ellipse cx="20" cy="20" rx="18" ry="7" transform="rotate(60 20 20)" /><ellipse cx="20" cy="20" rx="18" ry="7" transform="rotate(120 20 20)" /><circle cx="20" cy="20" r="3" fill="currentColor" stroke="none" /></svg>;
  if (symbol === "database") return <svg {...props} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6"><ellipse cx="20" cy="10" rx="12" ry="5" /><path d="M8 10v20c0 7 24 7 24 0V10M8 20c0 7 24 7 24 0" /></svg>;
  if (symbol === "pytorch") return <svg {...props} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m20 4-10 10a14 14 0 1 0 20 0" /><circle cx="29" cy="8" r="2.3" fill="currentColor" stroke="none" /></svg>;
  if (symbol === "bolt") return <svg {...props} viewBox="0 0 40 40" fill="currentColor"><path d="M23 3 8 23h11l-2 14 15-22H21z" /></svg>;
  if (symbol === "leaf") return <svg {...props} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 3c-18 15-12 25 0 31C32 27 38 18 20 3Z" /><path d="M20 10v28" /></svg>;
  if (symbol === "stack") return <svg {...props} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 13 16-8 16 8-16 8Zm0 7 16 8 16-8M4 27l16 8 16-8" /></svg>;
  if (symbol === "face") return <svg {...props} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="20" cy="19" r="13" /><path d="M14 16h1m10 0h1M14 22q6 8 12 0M4 26l6 6m26-6-6 6" /></svg>;
  return <span {...props}>{symbol}</span>;
}
