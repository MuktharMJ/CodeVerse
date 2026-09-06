"use client";

import { useEffect, useRef, useState } from "react";
import { searchTechnologies } from "@/lib/search";
import { categories } from "@/data/technologies";
import { TechnologyIcon } from "./technology-icon";

export function TechnologySearch({ onSelect }: { onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = searchTechnologies(query);
  const choose = (id: string) => { onSelect(id); setOpen(false); setQuery(""); input.current?.blur(); };

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !target.closest("input, textarea, [contenteditable], dialog[open]")) {
        event.preventDefault(); input.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (open) document.getElementById(`search-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return <div className="search-shell" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
    <input ref={input} className="search-input" role="combobox" aria-label="Search technologies" aria-autocomplete="list" aria-expanded={open} aria-controls="technology-search-results" aria-activedescendant={open && results[active] ? `search-option-${active}` : undefined} autoComplete="off" spellCheck={false} placeholder="Find your next discovery" value={query}
      onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); input.current?.blur(); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          setActive((value) => results.length ? (value + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
        }
        if (event.key === "Enter" && open && results[active]) { event.preventDefault(); choose(results[active].id); }
      }} />
    <kbd className="search-shortcut" aria-hidden="true">/</kbd>
    {open && <div className="search-dropdown">
      <div className="search-heading section-label">{query ? `${results.length} DISCOVERIES` : "EXPLORE ALL CONSTELLATIONS"}</div>
      <div id="technology-search-results" role="listbox" aria-label="Technologies" className="search-results">
        {results.map((technology, index) => <div key={technology.id} id={`search-option-${index}`} role="option" aria-selected={active === index} className={`search-result${active === index ? " is-active" : ""}`} data-category={technology.category} onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(technology.id)}>
          <TechnologyIcon symbol={technology.symbol} className="search-result-icon" /><div><div className="search-result-name">{technology.name}<span>{categories[technology.category].label}</span></div><p>{technology.description}</p></div>
        </div>)}
      </div>
      {!results.length && <div className="search-empty" role="status">No signals found.<span>Try a name, alias, category, or description.</span></div>}
      <div className="search-footer">Arrow keys to navigate <span>Enter to explore / Esc to close</span></div>
    </div>}
  </div>;
}
