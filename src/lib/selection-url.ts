"use client";

import { useSyncExternalStore } from "react";
import { isTechnologyId } from "@/data/technologies";

const eventName = "codeverse:navigation";
function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(eventName, callback);
  return () => { window.removeEventListener("popstate", callback); window.removeEventListener(eventName, callback); };
}
const snapshot = () => new URLSearchParams(window.location.search).get("technology");

export function navigateToTechnology(id: string | null) {
  if (id && !isTechnologyId(id)) return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("technology", id);
  else url.searchParams.delete("technology");
  if (url.href === window.location.href) return;
  window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(eventName));
}

export function useTechnologySelection() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return { selectedId: raw && isTechnologyId(raw) ? raw : null, invalidSelection: raw !== null && !isTechnologyId(raw) };
}
