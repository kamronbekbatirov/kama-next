"use client";

import { useEffect } from "react";

/**
 * Client-side access to the Telegram Mini App SDK.
 *
 * The SDK is injected by the Telegram client, so everything here has to work
 * three ways: inside Telegram on a recent client, inside Telegram on an old one
 * that predates a given method, and in a plain browser where `window.Telegram`
 * does not exist at all. Every helper degrades on its own rather than making
 * each call site remember to check.
 */

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  /** False when the person has never allowed the bot to DM them. */
  allows_write_to_pm?: boolean;
}

interface TgButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TgWebApp {
  ready?(): void;
  expand?(): void;
  close?(): void;
  platform?: string;
  version?: string;
  colorScheme?: string;
  initData?: string;
  initDataUnsafe?: { user?: TgUser; start_param?: string };
  isVersionAtLeast?(v: string): boolean;
  BackButton?: TgButton;
  HapticFeedback?: {
    impactOccurred?(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred?(type: "error" | "success" | "warning"): void;
    selectionChanged?(): void;
  };
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  showAlert?(message: string, cb?: () => void): void;
  requestWriteAccess?(cb?: (granted: boolean) => void): void;
  openTelegramLink?(url: string): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  disableVerticalSwipes?(): void;
  onEvent?(e: string, fn: () => void): void;
  offEvent?(e: string, fn: () => void): void;
}

export function webApp(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null;
}

/** True only inside a real Telegram client, not merely "the SDK object exists". */
export function inTelegram(): boolean {
  const tg = webApp();
  return !!tg?.platform && tg.platform !== "unknown";
}

export function tgUser(): TgUser | null {
  return webApp()?.initDataUnsafe?.user ?? null;
}

/** The `startapp` payload a direct link carried in, if any. */
export function startParam(): string | null {
  return webApp()?.initDataUnsafe?.start_param ?? null;
}

function atLeast(v: string): boolean {
  const tg = webApp();
  return !!tg && (tg.isVersionAtLeast?.(v) ?? false);
}

/**
 * Native confirmation dialog, falling back to the browser's.
 *
 * `window.confirm` renders as a jarring browser chrome sheet inside the
 * Telegram webview, and on some clients is suppressed outright — which silently
 * turns "are you sure?" into "no". The native popup is also the only one that
 * respects the user's theme.
 */
export function tgConfirm(message: string): Promise<boolean> {
  const tg = webApp();
  if (tg?.showConfirm && atLeast("6.2")) {
    return new Promise(resolve => {
      try { tg.showConfirm!(message, resolve); } catch { resolve(window.confirm(message)); }
    });
  }
  return Promise.resolve(window.confirm(message));
}

export function tgAlert(message: string): Promise<void> {
  const tg = webApp();
  if (tg?.showAlert && atLeast("6.2")) {
    return new Promise(resolve => {
      try { tg.showAlert!(message, () => resolve()); } catch { window.alert(message); resolve(); }
    });
  }
  window.alert(message);
  return Promise.resolve();
}

/** Physical feedback for a completed action. Silently absent off-device. */
export const haptic = {
  success() { webApp()?.HapticFeedback?.notificationOccurred?.("success"); },
  warning() { webApp()?.HapticFeedback?.notificationOccurred?.("warning"); },
  error() { webApp()?.HapticFeedback?.notificationOccurred?.("error"); },
  tap() { webApp()?.HapticFeedback?.impactOccurred?.("light"); },
  select() { webApp()?.HapticFeedback?.selectionChanged?.(); },
};

/**
 * Ask the bot for permission to DM this person, resolving to whether it has it.
 *
 * Reminders are delivered by the bot, and a bot cannot open a conversation the
 * user never started: without this the reminder is accepted by the UI and then
 * silently discarded by Telegram forever.
 */
export function ensureBotCanWrite(): Promise<boolean> {
  const tg = webApp();
  if (!inTelegram()) return Promise.resolve(true); // browser: nothing to ask
  const user = tgUser();
  if (user?.allows_write_to_pm) return Promise.resolve(true);
  if (!tg?.requestWriteAccess || !atLeast("6.9")) return Promise.resolve(true);
  return new Promise(resolve => {
    try { tg.requestWriteAccess!(granted => resolve(!!granted)); } catch { resolve(true); }
  });
}

/**
 * Bind the Telegram header's back button to `onBack` while `active`.
 *
 * Inside Telegram the header back button is where people reach for "out of
 * this", so a modal that only closes via an on-screen ✕ traps them: the
 * hardware/system back gesture closes the whole Mini App instead.
 */
export function useTelegramBack(active: boolean, onBack: () => void) {
  useEffect(() => {
    const btn = webApp()?.BackButton;
    if (!active || !btn || !atLeast("6.1")) return;
    const handler = () => onBack();
    try {
      btn.onClick(handler);
      btn.show();
    } catch { return; }
    return () => {
      try { btn.offClick(handler); btn.hide(); } catch { /* client went away */ }
    };
  }, [active, onBack]);
}

/** Warn before closing the Mini App while `dirty` — e.g. a half-typed form. */
export function useClosingConfirmation(dirty: boolean) {
  useEffect(() => {
    const tg = webApp();
    if (!tg || !atLeast("6.2")) return;
    if (dirty) tg.enableClosingConfirmation?.();
    else tg.disableClosingConfirmation?.();
    return () => tg.disableClosingConfirmation?.();
  }, [dirty]);
}
