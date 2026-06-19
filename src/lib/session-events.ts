import { EventEmitter } from "events";

// In-process pub/sub for session revocations. The dashboard holds an SSE
// connection (/api/auth/sessions/stream); when a session is revoked anywhere in
// this process — website button or Telegram tool — we emit here and the matching
// stream pushes a "revoked" event so the device drops to login sub-second.
//
// This works because the app runs as a single standalone Node process. If it is
// ever scaled to multiple instances, this needs a shared bus (e.g. Redis/NOTIFY)
// so an emit on one instance reaches streams held by another.

export type RevokeEvent = { ids: string[] };

// `globalThis` guard so HMR / multiple module evaluations reuse one emitter.
const g = globalThis as unknown as { __sessionBus?: EventEmitter };
const bus = g.__sessionBus ?? new EventEmitter();
bus.setMaxListeners(0); // one listener per open dashboard tab
g.__sessionBus = bus;

export function onRevoke(listener: (e: RevokeEvent) => void): () => void {
  bus.on("revoke", listener);
  return () => { bus.off("revoke", listener); };
}

export function emitRevoke(e: RevokeEvent) {
  if (e.ids.length) bus.emit("revoke", e);
}
