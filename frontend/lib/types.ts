export type AIMode = "server" | "user" | "unavailable";

export interface AIStatus {
  provider: "gemini";
  mode: AIMode;
  ready: boolean;
  model: string;
}

export interface AccountInfo {
  plan_name?: string | null;
  searches_per_month?: number | null;
  total_searches_left?: number | null;
  this_month_usage?: number | null;
}

export interface ConnectionStatus {
  connected: boolean;
  session_expired: boolean;
  expires_at?: number | null;
  account?: AccountInfo | null;
  ai: AIStatus;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  snippet: string;
  publisher?: string | null;
  date?: string | null;
  query: string;
  provenance?: "curated_seed" | "live_discovery";
}

export type EdgeStatus = "evidence" | "hypothesis";

export interface GraphNode {
  id: string;
  label: string;
  domain: string;
  kind: "origin" | "entity";
  hop: number;
  provenance?: "curated_seed" | "live_discovery";
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  mechanism: string;
  status: EdgeStatus;
  source_ids: string[];
  confidence: number;
  provenance?: "curated_seed" | "live_discovery";
}

export interface SeedGraphBundle {
  version: string;
  title: string;
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  sources: Source[];
}

export interface DiscoveryStep {
  source: string;
  target: string;
  source_label: string;
  target_label: string;
  relation: string;
  explanation: string;
  status: EdgeStatus;
  source_ids: string[];
}

export interface Discovery {
  id: string;
  rank: number;
  title: string;
  summary: string;
  category: "evidence_supported" | "plausible_hypothesis";
  path: string[];
  steps: DiscoveryStep[];
  domains: string[];
  surprise: number;
  evidence_strength: number;
  score: number;
  speculative_implications: string[];
}

export interface DiscoveryResponse {
  event: { text: string; summary: string; origin_label: string; domain: string };
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  discoveries: Discovery[];
  sources: Source[];
  stats: { searches_used: number; sources: number; relationships: number; hops_explored: number };
  warnings: string[];
  partial: boolean;
  message?: string | null;
}

export interface ProgressEvent {
  stage: string;
  message: string;
  hop?: number;
  query?: string;
  queries?: string[];
  results?: number;
  failed?: boolean;
}

export type DiscoveryStats = DiscoveryResponse["stats"];
