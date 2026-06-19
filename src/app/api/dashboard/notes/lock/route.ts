import { getSession } from "@/lib/auth";
import {
  pinIsSet, setPin, verifyPin, isValidPin,
  setUnlock, clearUnlock, isUnlocked, disableLock,
  unlockRateLimited, noteFailedAttempt, resetAttempts,
} from "@/lib/note-lock";

async function auth() {
  const s = await getSession();
  if (!s?.authenticated) throw new Error("unauthorized");
}

export async function GET() {
  try {
    await auth();
    return Response.json({ pinSet: await pinIsSet(), unlocked: await isUnlocked() });
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await auth();
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "set") {
      // Set or change the PIN. Changing requires the current PIN.
      if (!isValidPin(body.pin)) return Response.json({ ok: false, error: "bad_pin" }, { status: 400 });
      if (await pinIsSet()) {
        if (!isValidPin(body.oldPin) || !(await verifyPin(body.oldPin))) {
          return Response.json({ ok: false, error: "wrong_pin" }, { status: 401 });
        }
      }
      await setPin(body.pin);
      await setUnlock();
      resetAttempts();
      return Response.json({ ok: true });
    }

    if (action === "unlock") {
      if (unlockRateLimited()) return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
      if (!isValidPin(body.pin) || !(await verifyPin(body.pin))) {
        noteFailedAttempt();
        return Response.json({ ok: false, error: "wrong_pin" }, { status: 401 });
      }
      await setUnlock();
      resetAttempts();
      return Response.json({ ok: true });
    }

    if (action === "lock") {
      await clearUnlock();
      return Response.json({ ok: true });
    }

    if (action === "disable") {
      if (await pinIsSet()) {
        if (!isValidPin(body.pin) || !(await verifyPin(body.pin))) {
          return Response.json({ ok: false, error: "wrong_pin" }, { status: 401 });
        }
      }
      await disableLock();
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  } catch {
    return Response.json({ error: "error" }, { status: 500 });
  }
}
