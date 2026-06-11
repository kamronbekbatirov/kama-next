"use client";

import {
  Sunrise, Sun, Moon, MoonStar, Star, Sparkles, Zap, Flame,
  Briefcase, Laptop, Code, BookOpen, GraduationCap, Brain, Lightbulb, Target,
  PenLine, Dumbbell, Footprints, Bike, Activity, Bed, Heart, CalendarDays,
  Utensils, UtensilsCrossed, Coffee, Droplet, ShoppingCart, Wallet, MessageCircle, Phone,
  HeartHandshake, TreeDeciduous, Music, Palette, CircleCheck,
  type LucideIcon,
} from "lucide-react";
import { resolveIconKey } from "@/lib/schedule-icons";

// key -> lucide component. Keys come from SCHEDULE_ICON_KEYS / legacy-emoji
// mapping in @/lib/schedule-icons.
const ICONS: Record<string, LucideIcon> = {
  sunrise: Sunrise, sun: Sun, moon: Moon, night: MoonStar, star: Star,
  sparkles: Sparkles, zap: Zap, flame: Flame,
  briefcase: Briefcase, laptop: Laptop, code: Code, book: BookOpen,
  graduation: GraduationCap, brain: Brain, lightbulb: Lightbulb, target: Target,
  pen: PenLine, dumbbell: Dumbbell, walk: Footprints, bike: Bike, yoga: Activity,
  bed: Bed, heart: Heart, calendar: CalendarDays,
  breakfast: Utensils, meal: UtensilsCrossed, coffee: Coffee, water: Droplet,
  cart: ShoppingCart, money: Wallet, chat: MessageCircle, phone: Phone,
  pray: HeartHandshake, tree: TreeDeciduous, music: Music, palette: Palette,
  check: CircleCheck,
};

export function ScheduleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[resolveIconKey(name)] ?? CalendarDays;
  return <Icon className={className} aria-hidden />;
}
