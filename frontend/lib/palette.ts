// Domain colours: a soft paper base with one vivid, friendly hue per domain.
const KNOWN: Record<string, string> = {
  energy: "#FF8A3D",
  agriculture: "#22B573",
  food: "#F5A524",
  technology: "#3B9EFF",
  economics: "#8B5CF6",
  finance: "#7C5CFF",
  climate: "#14B8A6",
  environment: "#10A37F",
  healthcare: "#FF5D73",
  health: "#FF5D73",
  transportation: "#F2B705",
  manufacturing: "#E86FB0",
  labor: "#FF7A59",
  geopolitics: "#5B6CFF",
  retail: "#00B3C7",
  culture: "#D65DF2",
};

const FALLBACK = ["#FF6B6B", "#4ECDC4", "#FFB347", "#6C8CFF", "#B07CFF", "#2EC4B6", "#FF8FAB", "#3DDC97", "#FFC93C", "#5FA8FF"];

export function domainColor(domain: string | null | undefined): string {
  const key = (domain ?? "").trim().toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  const first = key.split(/[\s·/,&-]+/)[0];
  if (first && KNOWN[first]) return KNOWN[first];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return FALLBACK[Math.abs(hash) % FALLBACK.length];
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export const INK = "#1E2227";
export const MUTED = "#6B7079";
export const PAPER = "#FAF8F5";
export const EDGE = "rgba(30,34,39,.14)";
export const EDGE_FADED = "rgba(30,34,39,.05)";
