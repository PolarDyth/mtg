"use client";

/**
 * Header popover state: the host menu, the preview-size menu, and the
 * copy-room-code feedback flag. The state lives here (not inside
 * TableHeader) so the Escape cascade can close the popovers.
 */

import { useCallback, useEffect, useState } from "react";
import type { GameView } from "@mythic/shared";

export function useHeaderMenus(view: GameView) {
  const [copied, setCopied] = useState(false);
  const [hostMenuOpen, setHostMenuOpen] = useState(false);
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(view.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the code is displayed anyway
    }
  }

  useEffect(() => {
    if (!hostMenuOpen) return;
    const close = () => setHostMenuOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [hostMenuOpen]);

  useEffect(() => {
    if (!previewMenuOpen) return;
    const close = () => setPreviewMenuOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [previewMenuOpen]);

  // catch-all Escape tier
  const escape = useCallback((): boolean => {
    setHostMenuOpen(false);
    setPreviewMenuOpen(false);
    return false;
  }, []);

  return {
    copied,
    copyCode,
    hostMenuOpen,
    setHostMenuOpen,
    previewMenuOpen,
    setPreviewMenuOpen,
    escape,
  };
}
