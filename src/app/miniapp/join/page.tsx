"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function JoinInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"working" | "bad">("working");
  const [name, setName] = useState("");

  useEffect(() => {
    const token = params.get("t");
    if (!token) { setState("bad"); return; }
    fetch("/api/auth/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setState("bad"); return; }
        setName(d.name ?? "");
        // Replace so the token never sits in history.
        router.replace("/miniapp/tracker");
      })
      .catch(() => setState("bad"));
  }, [params, router]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-6">
      <div className="text-center max-w-xs">
        {state === "working" ? (
          <>
            <div className="text-sm font-semibold">Заходим…</div>
            <div className="text-xs text-[var(--muted)] mt-1">
              {name ? `Привет, ${name}` : "Проверяем приглашение"}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold">Ссылка не сработала</div>
            <div className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
              Приглашение одноразовое и живёт 72 часа. Попроси новое — или открой
              мини-апп прямо в Telegram, там вход по аккаунту.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinInner />
    </Suspense>
  );
}
