"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLang } from "@/components/providers";
import { TreePane } from "./tree";
import { MethodsPane } from "./methods";
import { ProtocolPane } from "./protocol";
import { GoalsPane } from "./goals";

export function LearnTab() {
  const [view, setView] = useState("tree");
  const { t } = useLang();
  const l = t.dash.learn;

  return (
    <div className="flex flex-col gap-4 pt-2 animate-fade-in">
      <Tabs value={view} onValueChange={setView}>
        <TabsList className="self-start">
          <TabsTrigger value="tree">{l.tabs.tree}</TabsTrigger>
          <TabsTrigger value="methods">{l.tabs.methods}</TabsTrigger>
          <TabsTrigger value="protocol">{l.tabs.protocol}</TabsTrigger>
          <TabsTrigger value="goals">{l.tabs.goals}</TabsTrigger>
        </TabsList>

        <TabsContent value="tree">
          <TreePane />
        </TabsContent>
        <TabsContent value="methods">
          <MethodsPane />
        </TabsContent>
        <TabsContent value="protocol">
          <ProtocolPane />
        </TabsContent>
        <TabsContent value="goals">
          <GoalsPane />
        </TabsContent>
      </Tabs>
    </div>
  );
}
