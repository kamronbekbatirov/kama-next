"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLang } from "@/components/providers";
import { useHashView } from "../_shared";
import { GroupPane } from "./group";
import { MinePane } from "./mine";
import { GoalForm } from "./goal-form";

/** The tracker, used by both shells: the guest's own page and the owner's
 *  sub-tab inside Tasks. */
export function TrackerTab({ hashKey = null, meId = null }: {
  /**
   * Which hash segment owns this pane, or null to keep the state local.
   *
   * The URL hash has exactly two segments (`#tab/sub`), so when the tracker is
   * nested inside the owner's Tasks tab both would fight over the same one —
   * Tasks writing `#tasks/tracker` and the tracker immediately overwriting it
   * with `#tasks/group`. Nested usage therefore passes null.
   */
  hashKey?: string | null;
  meId?: string | null;
}) {
  const hashed = useHashView(hashKey ?? "tracker", ["group", "mine"], "group");
  const local = useState<string>("group");
  const [view, setView] = hashKey ? hashed : local;
  const { t } = useLang();
  const x = t.dash.tracker;
  const [forming, setForming] = useState(false);
  const [reload, setReload] = useState(0);
  const bump = () => setReload(n => n + 1);

  return (
    <div className="flex flex-col gap-4 pt-2 animate-fade-in">
      <Tabs value={view} onValueChange={setView}>
        <TabsList className="self-start">
          <TabsTrigger value="group">{x.tabs.group}</TabsTrigger>
          <TabsTrigger value="mine">{x.tabs.mine}</TabsTrigger>
        </TabsList>

        <TabsContent value="group">
          <GroupPane key={reload} meId={meId} />
        </TabsContent>
        <TabsContent value="mine">
          <MinePane onNew={() => setForming(true)} reloadKey={reload} onChanged={bump} />
        </TabsContent>
      </Tabs>

      {forming && (
        <GoalForm
          onClose={() => setForming(false)}
          onSaved={() => { setForming(false); bump(); setView("mine"); }}
        />
      )}
    </div>
  );
}
