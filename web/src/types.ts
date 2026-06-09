// Wire types for GET /graph. Hand-mirrored from src/model.rs in the daemon;
// keep the two in sync by hand (no codegen).

export type NodeKind = "hub" | "site" | "client" | "resource";
export type EdgeKind = "peer" | "serves" | "grant";

export interface Health {
  online: boolean;
  handshakeAgeSec: number | null;
  rttMs: number | null;
  bytesInPerSec: number | null;
  bytesOutPerSec: number | null;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  addresses: string[];
  health: Health;
}

export interface GraphEdge {
  id: string;
  kind: EdgeKind;
  from: string;
  to: string;
  health: Health | null;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
