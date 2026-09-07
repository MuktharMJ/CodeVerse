"use client";

import { useSyncExternalStore } from "react";
import { useCatalog } from "@/components/catalog-provider";

const eventName = "codeverse:navigation";
function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(eventName, callback);
  return () => { window.removeEventListener("popstate", callback); window.removeEventListener(eventName, callback); };
}
const snapshot = () => new URLSearchParams(window.location.search).get("technology");

export function navigateToTechnology(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("technology", id);
  else url.searchParams.delete("technology");
  if (url.href === window.location.href) return;
  window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(eventName));
}

export function useTechnologySelection() {
  const { resolveId } = useCatalog();
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return { selectedId: raw ? resolveId(raw) : null, invalidSelection: raw !== null && !resolveId(raw) };
}
