"use client";

import { useCallback, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLang } from "@/components/providers";
import { SportToday } from "./today";
import { SportProgram } from "./program";
import { SportBody } from "./body";

/** Sport: today's session, the programme behind it, and the body it changes. */
export function SportTab() {
  const { t } = useLang();
  const s = t.dash.sport;
  const [view, setView] = useState("today");
  const [reload, setReload] = useState(0);
  const bump = useCallback(() => setReload(n => n + 1), []);

  return (
    <div className="flex flex-col gap-4 pt-2 animate-fade-in">
      <Tabs value={view} onValueChange={setView}>
        <TabsList className="self-start">
          <TabsTrigger value="today">{s.tabs.today}</TabsTrigger>
          <TabsTrigger value="program">{s.tabs.program}</TabsTrigger>
          <TabsTrigger value="body">{s.tabs.body}</TabsTrigger>
        </TabsList>
        <TabsContent value="today"><SportToday reloadKey={reload} onChanged={bump} /></TabsContent>
        <TabsContent value="program"><SportProgram reloadKey={reload} onChanged={bump} /></TabsContent>
        <TabsContent value="body"><SportBody reloadKey={reload} onChanged={bump} /></TabsContent>
      </Tabs>
    </div>
  );
}
