import type { EdgeKind, NodeKind } from "@archbook/schema";
import {
  Cog,
  Database,
  Globe,
  HardDrive,
  Layers,
  Monitor,
  Server,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface NodeKindStyle {
  label: string;
  icon: LucideIcon;
  /** CSS variable holding the kind's accent color. */
  color: string;
}

export const NODE_KIND_STYLES: Record<NodeKind, NodeKindStyle> = {
  app: { label: "App", icon: Monitor, color: "var(--kind-app)" },
  service: { label: "Service", icon: Server, color: "var(--kind-service)" },
  worker: { label: "Worker", icon: Cog, color: "var(--kind-worker)" },
  database: { label: "Database", icon: Database, color: "var(--kind-database)" },
  cache: { label: "Cache", icon: Zap, color: "var(--kind-cache)" },
  queue: { label: "Queue", icon: Layers, color: "var(--kind-queue)" },
  storage: { label: "Storage", icon: HardDrive, color: "var(--kind-storage)" },
  external: { label: "External", icon: Globe, color: "var(--kind-external)" },
  actor: { label: "Actor", icon: User, color: "var(--kind-actor)" },
};

export interface EdgeKindStyle {
  label: string;
  /** SVG stroke-dasharray; undefined draws a solid line. */
  dash?: string;
}

export const EDGE_KIND_STYLES: Record<EdgeKind, EdgeKindStyle> = {
  http: { label: "HTTP" },
  grpc: { label: "gRPC" },
  event: { label: "Event", dash: "7 5" },
  queue: { label: "Queue", dash: "7 5" },
  db: { label: "Database" },
  cache: { label: "Cache", dash: "2 5" },
  storage: { label: "Storage" },
  websocket: { label: "WebSocket", dash: "10 4 2 4" },
  other: { label: "Other", dash: "1 4" },
};
