"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const storageKey = "jobnova:liked-jobs";
const fallbackLikedIds = ["ux-designer"];

function readStoredLikes() {
  if (typeof window === "undefined") {
    return new Set<string>(fallbackLikedIds);
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (!storedValue) {
      return new Set<string>(fallbackLikedIds);
    }

    const parsedValue = JSON.parse(storedValue);
    return new Set<string>(Array.isArray(parsedValue) ? parsedValue : fallbackLikedIds);
  } catch {
    return new Set<string>(fallbackLikedIds);
  }
}

function writeStoredLikes(ids: Set<string>) {
  const nextIds = Array.from(ids);
  window.localStorage.setItem(storageKey, JSON.stringify(nextIds));
  window.dispatchEvent(new CustomEvent("jobnova:likes-change", { detail: nextIds }));
}

export function useTemporaryLikes() {
  const [likedJobIds, setLikedJobIds] = useState<Set<string>>(() => readStoredLikes());
  const hasHydratedBackendLikes = useRef(false);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey) {
        setLikedJobIds(readStoredLikes());
      }
    }

    function handleLocalChange(event: Event) {
      const detail = (event as CustomEvent<string[]>).detail;
      setLikedJobIds(new Set(Array.isArray(detail) ? detail : fallbackLikedIds));
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("jobnova:likes-change", handleLocalChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("jobnova:likes-change", handleLocalChange);
    };
  }, []);

  const toggleLiked = useCallback((jobId: string) => {
    setLikedJobIds((current) => {
      const next = new Set(current);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }

      writeStoredLikes(next);
      return next;
    });
  }, []);

  const hydrateBackendLikes = useCallback((jobIds: string[]) => {
    if (hasHydratedBackendLikes.current) {
      return;
    }

    hasHydratedBackendLikes.current = true;

    if (typeof window !== "undefined" && window.localStorage.getItem(storageKey)) {
      return;
    }

    setLikedJobIds((current) => {
      const next = new Set(current);
      jobIds.forEach((jobId) => next.add(jobId));
      writeStoredLikes(next);
      return next;
    });
  }, []);

  return { likedJobIds, toggleLiked, hydrateBackendLikes };
}
