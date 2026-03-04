"use client";

/**
 * WIDGET_MAP — Dynamic Widget Registry
 *
 * Maps widget kind discriminators → React renderer components.
 * To add a new widget type:
 *   1. Create a renderer component in this directory (implement WidgetProps)
 *   2. Add a schema entry to widget-schemas.ts (Claude learns about it automatically)
 *   3. Call registerWidget("kind", Component) in WidgetRenderer.tsx
 *
 * WidgetKind is an open string — no types.ts changes required.
 */

import type React from "react";
import type { WidgetPayload } from "@/components/copilot/types";

export interface WidgetProps {
  kind: WidgetPayload["kind"];
  title?: string;
  subtitle?: string;
  data: Record<string, unknown>;
}

export type WidgetComponentType = React.ComponentType<WidgetProps>;

const WIDGET_MAP = new Map<string, WidgetComponentType>();

export function getWidgetComponent(kind: string): WidgetComponentType | null {
  return WIDGET_MAP.get(kind) ?? null;
}

export function registerWidget(kind: string, component: WidgetComponentType): void {
  WIDGET_MAP.set(kind, component);
}
