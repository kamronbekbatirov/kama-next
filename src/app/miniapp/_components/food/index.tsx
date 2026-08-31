"use client";

import { useCallback, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLang } from "@/components/providers";
import { FoodToday } from "./today";
import { FoodPlan } from "./plan";
import { FoodBook } from "./book";
import { FoodShopping } from "./shopping";

/**
 * Food: today's intake, the week's plan, the recipe book, and the shopping list.
 *
 * Four panes rather than one page, because they are used at four different
 * moments — after eating, on a Sunday, when writing down a recipe, and in a
 * shop — and only one of them is ever needed at a time.
 */
export function FoodTab() {
  const { t } = useLang();
  const f = t.dash.food;
  const [view, setView] = useState("today");
  const [reload, setReload] = useState(0);
  const bump = useCallback(() => setReload(n => n + 1), []);

  return (
    <div className="flex flex-col gap-4 pt-2 animate-fade-in">
      <Tabs value={view} onValueChange={setView}>
        <TabsList className="self-start">
          <TabsTrigger value="today">{f.tabs.today}</TabsTrigger>
          <TabsTrigger value="plan">{f.tabs.plan}</TabsTrigger>
          <TabsTrigger value="book">{f.tabs.book}</TabsTrigger>
          <TabsTrigger value="shop">{f.tabs.shop}</TabsTrigger>
        </TabsList>

        <TabsContent value="today"><FoodToday reloadKey={reload} onChanged={bump} /></TabsContent>
        <TabsContent value="plan"><FoodPlan reloadKey={reload} onChanged={bump} /></TabsContent>
        <TabsContent value="book"><FoodBook reloadKey={reload} onChanged={bump} /></TabsContent>
        <TabsContent value="shop"><FoodShopping reloadKey={reload} onChanged={bump} /></TabsContent>
      </Tabs>
    </div>
  );
}
