"use client";

import { LogOut, Palette, Languages, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { useLang } from "@/components/providers";
import { SectionHeader } from "./dashboard-ui";

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const d = t.dash.settingsModal;
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} side="bottom">
      <SheetContent className="pb-8">
        <SheetHeader>
          <SheetTitle>{d.title}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5">
          <section>
            <SectionHeader
              eyebrow={d.appearance}
              trailing={<Palette className="h-3.5 w-3.5 text-[var(--muted)]" />}
            />
            <Card className="p-2">
              <div className="flex items-center justify-between gap-3 py-2 px-3">
                <div className="flex items-center gap-2.5">
                  <Palette className="h-4 w-4 text-[var(--muted)]" />
                  <span className="text-sm font-medium">{d.theme}</span>
                </div>
                <ThemeToggle />
              </div>
              <div className="border-t border-[var(--card-border)] my-1" />
              <div className="flex items-center justify-between gap-3 py-2 px-3">
                <div className="flex items-center gap-2.5">
                  <Languages className="h-4 w-4 text-[var(--muted)]" />
                  <span className="text-sm font-medium">{d.language}</span>
                </div>
                <LangToggle />
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader
              eyebrow={d.account}
              trailing={<User className="h-3.5 w-3.5 text-[var(--muted)]" />}
            />
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.replace("/miniapp/login");
              }}
              className="w-full h-11 rounded-2xl border border-red-500/40 text-red-500 text-sm font-semibold hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              {d.signOut}
            </button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
