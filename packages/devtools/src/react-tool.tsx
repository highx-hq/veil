import "./index.css";

/**
 * VeilDevTools.tsx
 * Recommendation pipeline inspector & simulator
 *
 * Theme: Professional dark — slate backgrounds, clean blue accents,
 * semantic status colors. Works for everyone; easy on the eyes all day.
 *
 * Fixes applied vs previous iteration:
 *  - Left panel: pipeline node list removed (canvas already shows it)
 *  - userSelect: "text" everywhere except the canvas drag surface
 *  - Canvas drag: captured via window-level mousemove/mouseup, not element
 *  - Full TypeScript: all props, state, refs, event handlers typed
 *  - Color system: universally legible dark palette (no exotic amber/cathode)
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  CSSProperties,
  ReactNode,
  ChangeEvent,
  KeyboardEvent,
  MouseEvent,
  WheelEvent,
} from "react";
import * as XLSX from "xlsx";
import VeilLogo from "./logo.png";
import { useDevtoolsClient } from "./runtime/DevtoolsClientContext.js";
import { usePolling } from "./runtime/usePolling.js";
import type {
  DevtoolsAdapters,
  DevtoolsChatStreamEvent,
  DevtoolsChatThread,
  DevtoolsKvTable,
  DevtoolsPluginMeta,
  DevtoolsSettings,
  DevtoolsSnapshotItem,
  DevtoolsStatus,
  DevtoolsUploadMeta,
} from "./runtime/devtoolsClient.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeType = "input" | "process" | "cache" | "plugin" | "output";
type NodeStatus = "idle" | "active" | "complete" | "error";

interface PipelineNode {
  id: string;
  type: NodeType;
  label: string;
  col: number;
  row: number;
  model?: string;
  tag?: string;
}

interface PipelineEdge {
  from: string;
  to: string;
}

interface Transform {
  x: number;
  y: number;
  s: number;
}

interface DataRow {
  id: string;
  name: string;
  score: string;
  category: string;
  stock: number;
}

interface UploadSchemaField {
  name: string;
  kind: "text" | "number" | "boolean" | "empty" | "mixed";
}

interface PendingUpload {
  file: File;
  rows: DataRow[];
  fileType: string;
  sheetName: string;
  totalRecords: number;
  totalColumns: number;
  schema: UploadSchemaField[];
}

interface DatasetEditorRow {
  id: string;
  values: Record<string, string>;
}

interface ChatMessage {
  id?: string;
  role: "user" | "ai" | "assistant" | "system" | "tool";
  text: string;
}

interface InspectorRow {
  label: string;
  val: string;
  color: string;
}

interface SimField {
  label: string;
  key: string;
  accent?: boolean;
  readOnly?: boolean;
}

interface SettingTab {
  id: string;
  label: string;
  icon: string;
}

interface FeatureMix {
  recency: number;
  popularity: number;
  rating: number;
  price: number;
}

interface ToggleMap {
  cache: boolean;
  autocompletion: boolean;
  groupByCategory: boolean;
  backgroundRefresh: boolean;
  diversity: boolean;
  priceRange: boolean;
  webPlugin: boolean;
  reviewsPlugin: boolean;
  socialPlugin: boolean;
}

interface FilterSettings {
  categories: string;
  priceMin: number;
  priceMax: number;
}

interface CacheSettings {
  refreshCron: string;
  maxItems: number;
  kvBinding: string;
  queueBinding: string;
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
// Professional dark palette — high contrast, universally legible.
// One blue accent, semantic greens/reds/yellows for status only.

const C = {
  // Backgrounds (darkest → lightest surface)
  bg0: "#0a0c0f", // app shell
  bg1: "#0e1117", // panels
  bg2: "#131720", // inputs, cards
  bg3: "#181d28", // hover states
  bg4: "#1e2433", // active / selected bg

  // Borders
  bdFaint: "rgba(255,255,255,0.05)",
  bdNormal: "rgba(255,255,255,0.09)",
  bdStrong: "rgba(255,255,255,0.16)",

  // Accent — a single mid-blue, readable on all surfaces
  accent: "#3b82f6",
  accentLt: "#60a5fa",
  accentBg: "rgba(59,130,246,0.10)",
  accentBd: "rgba(59,130,246,0.25)",

  // Status — semantic, not decorative
  success: "#22c55e",
  successBg: "rgba(34,197,94,0.10)",
  warn: "#f59e0b",
  warnBg: "rgba(245,158,11,0.10)",
  danger: "#ef4444",
  dangerBg: "rgba(239,68,68,0.10)",
  info: "#06b6d4",
  infoBg: "rgba(6,182,212,0.10)",

  // Node type colors — distinct but muted enough to not clash
  typeInput: "#06b6d4",
  typeProcess: "#3b82f6",
  typeCache: "#a855f7",
  typePlugin: "#f59e0b",
  typeOutput: "#22c55e",

  // Text
  text0: "#f1f5f9", // primary / headings
  text1: "#94a3b8", // body / labels
  text2: "#475569", // muted / captions
  text3: "#2d3748", // very muted / placeholders

  // Fonts
  mono: "'IBM Plex Mono', 'JetBrains Mono', 'Fira Code', monospace",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
} as const;

const TYPE_COLOR: Record<NodeType, string> = {
  input: C.typeInput,
  process: C.typeProcess,
  cache: C.typeCache,
  plugin: C.typePlugin,
  output: C.typeOutput,
};

const TYPE_BG: Record<NodeType, string> = {
  input: "rgba(6,182,212,0.10)",
  process: "rgba(59,130,246,0.10)",
  cache: "rgba(168,85,247,0.10)",
  plugin: "rgba(245,158,11,0.10)",
  output: "rgba(34,197,94,0.10)",
};

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function parseUploadContent(content: {
  filename: string;
  bytesBase64: string;
}): { columns: string[]; rows: DatasetEditorRow[] } {
  const ext = content.filename.split(".").pop()?.toLowerCase() ?? "";
  const workbook =
    ext === "csv"
      ? XLSX.read(new TextDecoder().decode(base64ToArrayBuffer(content.bytesBase64)), {
          type: "string",
        })
      : XLSX.read(base64ToArrayBuffer(content.bytesBase64), { type: "array" });

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) return { columns: [], rows: [] };

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const columns = Array.from(
    new Set(raw.flatMap((row) => Object.keys(row).map((key) => key.trim()))),
  ).filter(Boolean);
  const rows = raw.map((row, index) => ({
    id: `row_${index + 1}`,
    values: columns.reduce<Record<string, string>>((acc, column) => {
      acc[column] = row[column] == null ? "" : String(row[column]);
      return acc;
    }, {}),
  }));

  return { columns, rows };
}

function serializeUploadRows(
  filename: string,
  columns: string[],
  rows: Record<string, string>[],
): ArrayBuffer {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "xlsx";
  const normalizedRows = rows.map((row) =>
    columns.reduce<Record<string, string>>((acc, column) => {
      acc[column] = row[column] ?? "";
      return acc;
    }, {}),
  );
  const sheet = XLSX.utils.json_to_sheet(normalizedRows, { header: columns });

  if (ext === "csv") {
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return new TextEncoder().encode(csv).buffer as ArrayBuffer;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, {
    bookType: ext === "xls" ? "biff8" : "xlsx",
    type: "array",
  }) as ArrayBuffer;
}

function datasetRowsToItems(rows: DatasetEditorRow[]): Array<Record<string, unknown>> {
  return rows.map((row, index) => {
    const entries = Object.entries(row.values);
    const normalized = Object.fromEntries(
      entries.map(([key, value]) => [normalizeColumnKey(key), parseCellValue(value)]),
    );

    const id =
      pickFirstString(normalized, ["id", "itemid", "item_id", "sku", "productid"]) ??
      row.id ??
      `item_${index + 1}`;
    const name =
      pickFirstString(normalized, ["name", "title", "product", "productname"]) ??
      `Item ${index + 1}`;
    const category =
      pickFirstString(normalized, ["category", "type", "group"]) ?? "uncategorized";
    const tags = parseTags(
      pickFirstValue(normalized, ["tags", "tag_list", "labels", "keywords"]),
    );

    const meta: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(normalized)) {
      if (["id", "itemid", "item_id", "sku", "productid", "name", "title", "product", "productname", "category", "type", "group", "tags", "tag_list", "labels", "keywords"].includes(key)) {
        continue;
      }
      meta[key] = value;
    }

    return {
      id,
      name,
      category,
      ...(tags.length ? { tags } : {}),
      ...meta,
      meta,
    };
  });
}

function normalizeColumnKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

function parseCellValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== "") return num;
  return trimmed;
}

function pickFirstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function pickFirstValue(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in source) return source[key];
  }
  return undefined;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const DEFAULT_CANVAS_TRANSFORM: Transform = { x: 90, y: 30, s: 0.82 };
const DEFAULT_LAYOUT = { leftW: 268, rightW: 292 };
const DEFAULT_SELECTED_NODE_ID = "SoftRanker";
const UI_STATE_STORAGE_KEY = "veil-devtools-ui-state";

// ─── Pipeline Data ────────────────────────────────────────────────────────────

const NODES: PipelineNode[] = [
  { id: "Input", type: "input", label: "Input", col: 1, row: 0 },
  { id: "HardScorer", type: "process", label: "HardScorer", col: 1, row: 1 },
  {
    id: "SnapshotCache",
    type: "cache",
    label: "SnapshotCache",
    col: 1,
    row: 2,
  },
  {
    id: "GroupedReplica",
    type: "process",
    label: "GroupedReplica",
    col: 2,
    row: 3,
    tag: "groupByCategory",
  },
  {
    id: "PluginArchives",
    type: "process",
    label: "PluginArchives",
    col: 1,
    row: 4,
  },
  { id: "PluginA", type: "plugin", label: "Plugin A", col: 0, row: 5 },
  { id: "PluginB", type: "plugin", label: "Plugin B", col: 2, row: 5 },
  {
    id: "Summarizer",
    type: "process",
    label: "Summarizer",
    col: 1,
    row: 6,
    model: "llm.summary",
  },
  {
    id: "SoftRanker",
    type: "process",
    label: "SoftRanker",
    col: 1,
    row: 7,
    model: "llm.recommendation",
  },
  { id: "FinalCache", type: "cache", label: "FinalCache", col: 1, row: 8 },
  {
    id: "SnapshotRanked",
    type: "output",
    label: "snapshot:ranked",
    col: 0,
    row: 9,
  },
  {
    id: "SnapshotChat",
    type: "output",
    label: "snapshot:chat",
    col: 2,
    row: 9,
  },
];

const EDGES: PipelineEdge[] = [
  { from: "Input", to: "HardScorer" },
  { from: "HardScorer", to: "SnapshotCache" },
  { from: "SnapshotCache", to: "GroupedReplica" },
  { from: "GroupedReplica", to: "PluginArchives" },
  { from: "PluginArchives", to: "PluginA" },
  { from: "PluginArchives", to: "PluginB" },
  { from: "PluginA", to: "Summarizer" },
  { from: "PluginB", to: "Summarizer" },
  { from: "Summarizer", to: "SoftRanker" },
  { from: "SoftRanker", to: "FinalCache" },
  { from: "FinalCache", to: "SnapshotRanked" },
  { from: "FinalCache", to: "SnapshotChat" },
];

const NW = 168;
const NH = 72;
const COLW = 210;
const ROWH = 112;

// ─── AI Chat ──────────────────────────────────────────────────────────────────

// ─── Utility ──────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function formatTs(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

// ─── SVG Icon ─────────────────────────────────────────────────────────────────

interface IconProps {
  d: string | ReactNode;
  size?: number;
  stroke?: string;
  fill?: string;
  sw?: number;
  style?: CSSProperties;
}

function Icon({
  d,
  size = 12,
  stroke = "currentColor",
  fill = "none",
  sw = 1.7,
  style,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
    >
      {typeof d === "string" ? <path d={d} /> : d}
    </svg>
  );
}

const ICON: Record<string, string | ReactNode> = {
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6.3-9.3A9 9 0 1 1 5.7 18.3M12 3v1m0 16v1M3 12h1m16 0h1",
  play: <polygon points="5 3 19 12 5 21 5 3" />,
  send: (
    <>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>
  ),
  close: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  edit: (
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </>
  ),
  terminal: (
    <>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  fit: (
    <>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </>
  ),
  reset: (
    <>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15" />
    </>
  ),
  zoomin: (
    <>
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  zoomout: (
    <>
      <line x1="8" y1="11" x2="14" y2="11" />
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  input: (
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  ),
  process: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </>
  ),
  cache: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </>
  ),
  plugin: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  output: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </>
  ),
  brain:
    "M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24z M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24z",
  sliders:
    "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  filter: "M22 3H2l8 9.46V19l4 2V12.46L22 3",
  plug: "M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z",
  database: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  bars: "M18 20V10M12 20V4M6 20v-6",
};

// ─── Shared micro-components ──────────────────────────────────────────────────

interface BtnProps {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  title?: string;
}

function Btn({ children, onClick, active, disabled, style, title }: BtnProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "0 10px",
        height: 28,
        borderRadius: 6,
        border: `1px solid ${active || hov ? C.bdStrong : C.bdNormal}`,
        background: active || hov ? C.bg3 : "transparent",
        color: active || hov ? C.text0 : C.text1,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontFamily: C.mono,
        fontSize: 10,
        letterSpacing: "0.4px",
        transition: "all 0.14s",
        whiteSpace: "nowrap",
        userSelect: "none",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

interface IconBtnProps {
  icon: string | ReactNode;
  onClick?: () => void;
  title?: string;
  color?: string;
  size?: number;
  danger?: boolean;
}

function IconBtn({
  icon,
  onClick,
  title,
  color,
  size = 12,
  danger,
}: IconBtnProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 26,
        height: 26,
        borderRadius: 5,
        border: `1px solid ${hov ? C.bdStrong : C.bdFaint}`,
        background: hov ? C.bg3 : "transparent",
        color: hov
          ? danger
            ? C.danger
            : C.text0
          : color || (danger ? C.danger : C.text2),
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.14s",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <Icon d={icon} size={size} />
    </button>
  );
}

interface ToggleProps {
  on: boolean;
  onToggle: () => void;
}

function Toggle({ on, onToggle }: ToggleProps) {
  return (
    <div
      onClick={onToggle}
      style={{
        width: 34,
        height: 18,
        borderRadius: 9,
        background: on ? C.accent : C.bg3,
        border: `1px solid ${on ? C.accentBd : C.bdNormal}`,
        cursor: "pointer",
        position: "relative",
        transition: "all 0.18s",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "white",
          transition: "left 0.18s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        }}
      />
    </div>
  );
}

// ─── Resize Handle ────────────────────────────────────────────────────────────

interface ResizeHandleProps {
  vertical?: boolean;
  onDrag: (delta: number) => void;
}

function ResizeHandle({ vertical, onDrag }: ResizeHandleProps) {
  const [hov, setHov] = useState(false);
  const [active, setActive] = useState(false);

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      setActive(true);
      let last = vertical ? e.clientY : e.clientX;

      const onMove = (ev: globalThis.MouseEvent) => {
        const cur = vertical ? ev.clientY : ev.clientX;
        onDrag(cur - last);
        last = cur;
      };
      const onUp = () => {
        setActive(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [onDrag, vertical],
  );

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        [vertical ? "height" : "width"]: active ? 4 : hov ? 3 : 2,
        [vertical ? "width" : "height"]: "100%",
        background: active || hov ? C.accent : C.bdFaint,
        cursor: vertical ? "row-resize" : "col-resize",
        flexShrink: 0,
        transition: "all 0.14s",
        zIndex: 50,
        userSelect: "none",
      }}
    />
  );
}

// ─── Left Panel — Data Source only ───────────────────────────────────────────

interface LeftPanelProps {
  simDatasets: string[];
  onDatasetChange: (names: string[]) => void;
}

const ITEM_NAMES = [
  "Electronics Bundle",
  "Book Set",
  "Clothing Pack",
  "Gaming Mouse",
  "Noise-Cancelling Headphones",
  "Smart Watch Pro",
  "Laptop Sleeve",
  "Mechanical Keyboard",
  "Monitor Arm",
  "USB-C Hub",
  "4K Webcam",
  "Bluetooth Speaker",
  "Tablet Case",
  "GaN Charger 65W",
  "Wireless Charging Pad",
  "Standing Desk Mat",
  "LED Strip Kit",
  "Portable SSD",
  "Action Camera",
  "E-Reader",
];

function LeftPanel({ simDatasets, onDatasetChange }: LeftPanelProps) {
  const client = useDevtoolsClient();
  const [uploadStatus, setUploadStatus] = useState("");
  const [adapters, setAdapters] = useState<DevtoolsAdapters | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [confirmingUpload, setConfirmingUpload] = useState(false);
  const [activeUpload, setActiveUpload] = useState<DevtoolsUploadMeta | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: uploadsData } = usePolling(
    () => client.getUploads(),
    client.options.pollIntervalMs,
  );
  const uploads = uploadsData ?? [];

  useEffect(() => {
    client
      .getAdapters()
      .then((a) => setAdapters(a))
      .catch(() => setAdapters(null));
  }, [client]);

  const parseRowsFromWorkbook = (wb: XLSX.WorkBook): DataRow[] => {
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return [];

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
    const keyFor = (row: Record<string, unknown>, candidates: string[]) => {
      const want = new Set(candidates.map(normalize));
      for (const k of Object.keys(row)) if (want.has(normalize(k))) return k;
      return null;
    };

    const columns = Array.from(
      new Set(raw.flatMap((row) => Object.keys(row))),
    );

    const textValue = (value: unknown) => (value == null ? "" : String(value).trim());
    const nonEmptyCount = (key: string) =>
      raw.reduce((count, row) => (textValue(row[key]) ? count + 1 : count), 0);
    const uniqueRatio = (key: string) => {
      const vals = raw.map((row) => textValue(row[key])).filter(Boolean);
      if (vals.length === 0) return 0;
      return new Set(vals).size / vals.length;
    };
    const numericRatio = (key: string) => {
      const vals = raw.map((row) => textValue(row[key])).filter(Boolean);
      if (vals.length === 0) return 0;
      const numericCount = vals.filter((value) => !Number.isNaN(Number(value))).length;
      return numericCount / vals.length;
    };

    const candidateTextColumns = columns
      .filter((key) => numericRatio(key) < 0.7)
      .sort((a, b) => nonEmptyCount(b) - nonEmptyCount(a));

    const inferredIdKey =
      columns
        .filter((key) => nonEmptyCount(key) > 0)
        .sort((a, b) => uniqueRatio(b) - uniqueRatio(a))[0] ?? null;
    const inferredNameKey =
      candidateTextColumns.find((key) => uniqueRatio(key) > 0.2) ??
      candidateTextColumns[0] ??
      columns[0] ??
      null;
    const inferredCategoryKey =
      candidateTextColumns.find((key) => normalize(key).includes("category")) ?? null;
    const inferredScoreKey =
      columns
        .filter((key) => numericRatio(key) > 0.8)
        .find((key) => /score|rank|rating|price/i.test(key)) ?? null;
    const inferredStockKey =
      columns
        .filter((key) => numericRatio(key) > 0.8)
        .find((key) => /stock|inventory|qty|quantity|count/i.test(key)) ?? null;

    return raw.map((row, i) => {
      const idK = keyFor(row, ["id", "item_id", "itemid"]) ?? inferredIdKey;
      const nameK =
        keyFor(row, ["name", "title", "item", "item_name", "product", "label"]) ??
        inferredNameKey;
      const scoreK = keyFor(row, [
        "score",
        "hard_score",
        "hardscore",
        "rank_score",
      ]) ?? inferredScoreKey;
      const categoryK = keyFor(row, ["category", "cat", "type", "group"]) ?? inferredCategoryKey;
      const stockK = keyFor(row, ["stock", "inventory", "qty", "quantity"]) ?? inferredStockKey;

      const idRaw = idK ? row[idK] : undefined;
      const nameRaw = nameK ? row[nameK] : undefined;
      const scoreRaw = scoreK ? row[scoreK] : undefined;
      const categoryRaw = categoryK ? row[categoryK] : undefined;
      const stockRaw = stockK ? row[stockK] : undefined;

      const toStr = (v: unknown) => (v == null ? "" : String(v)).trim();
      const toNum = (v: unknown) => {
        const n = typeof v === "number" ? v : parseFloat(toStr(v));
        return Number.isFinite(n) ? n : 0;
      };

      const scoreNum = toNum(scoreRaw);
      const stockNum = toNum(stockRaw);
      const fallbackName =
        columns
          .map((key) => textValue(row[key]))
          .find((value) => value && value !== toStr(idRaw)) || `Row ${i + 1}`;

      return {
        id: toStr(idRaw) || `item_${String(i + 1).padStart(3, "0")}`,
        name: toStr(nameRaw) || fallbackName,
        score: scoreRaw === "" || scoreRaw == null ? "" : scoreNum.toFixed(2),
        category: toStr(categoryRaw) || "",
        stock: Math.max(0, Math.floor(stockNum)),
      };
    });
  };

  const summarizeWorkbook = (
    file: File,
    wb: XLSX.WorkBook,
    rows: DataRow[],
  ): PendingUpload => {
    const sheetName = wb.SheetNames[0] ?? "Sheet1";
    const sheet = wb.Sheets[sheetName];
    const raw = sheet
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
      : [];

    const columns = Array.from(
      new Set(raw.flatMap((row) => Object.keys(row).map((key) => key.trim()))),
    ).filter(Boolean);

    const inferKind = (values: unknown[]): UploadSchemaField["kind"] => {
      const kinds = new Set<string>();
      for (const value of values) {
        if (value == null || value === "") continue;
        if (typeof value === "number") {
          kinds.add("number");
          continue;
        }
        if (typeof value === "boolean") {
          kinds.add("boolean");
          continue;
        }
        const text = String(value).trim();
        if (!text) continue;
        if (!Number.isNaN(Number(text))) {
          kinds.add("number");
        } else if (text === "true" || text === "false") {
          kinds.add("boolean");
        } else {
          kinds.add("text");
        }
      }

      if (kinds.size === 0) return "empty";
      if (kinds.size === 1) return Array.from(kinds)[0] as UploadSchemaField["kind"];
      return "mixed";
    };

    const schema = columns.map((name) => ({
      name,
      kind: inferKind(raw.slice(0, 24).map((row) => row[name])),
    }));

    return {
      file,
      rows,
      fileType: file.name.split(".").pop()?.toUpperCase() || "FILE",
      sheetName,
      totalRecords: rows.length,
      totalColumns: columns.length,
      schema,
    };
  };

  const handlePickedFile = useCallback(
    async (file: File): Promise<void> => {
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const wb =
          ext === "csv"
            ? XLSX.read(await file.text(), { type: "string" })
            : XLSX.read(await file.arrayBuffer(), { type: "array" });

        const rows = parseRowsFromWorkbook(wb);
        setPendingUpload(summarizeWorkbook(file, wb, rows));
      } catch (err) {
        setUploadStatus(
          err instanceof Error
            ? `Upload failed: ${err.message}`
            : "Upload failed",
        );
        setTimeout(() => setUploadStatus(""), 3000);
      }
    },
    [],
  );

  const confirmUpload = useCallback(async (): Promise<void> => {
    if (!pendingUpload) return;

    setConfirmingUpload(true);
    setUploadStatus(
      adapters?.storage?.kind
        ? `Uploading to ${adapters.storage.kind}…`
        : "Uploading…",
    );

    try {
      const buf = await pendingUpload.file.arrayBuffer();
      const meta = await client.uploadFile({
        filename: pendingUpload.file.name,
        mime: pendingUpload.file.type || null,
        bytesBase64: arrayBufferToBase64(buf),
      });

      setUploadStatus(`✓ Uploaded (${meta.storageKind}) — ${meta.filename}`);
      onDatasetChange(Array.from(new Set([...simDatasets, meta.id])));
      setPendingUpload(null);
    } catch (err) {
      setUploadStatus(
        err instanceof Error
          ? `Upload failed: ${err.message}`
          : "Upload failed",
      );
    } finally {
      setConfirmingUpload(false);
      setTimeout(() => setUploadStatus(""), 3000);
    }
  }, [
    adapters?.storage?.kind,
    client,
    onDatasetChange,
    pendingUpload,
    simDatasets,
  ]);

  const handleFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    void handlePickedFile(file);
    e.target.value = "";
  };

  const ph: CSSProperties = {
    height: 34,
    padding: "0 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: `1px solid ${C.bdFaint}`,
    flexShrink: 0,
  };

  const panelTitle: CSSProperties = {
    fontSize: 9,
    letterSpacing: "1.6px",
    textTransform: "uppercase",
    color: C.text2,
    userSelect: "text",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div style={ph}>
        <span style={panelTitle}>Data Source</span>
        <IconBtn
          icon={ICON.plus}
          onClick={() => fileRef.current?.click()}
          title="Upload file"
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv,.xls"
        style={{ display: "none" }}
        onChange={handleFile}
      />

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          userSelect: "text",
        }}
      >
        {uploadStatus && (
          <div
            style={{
              fontSize: 9,
              color: C.success,
              textAlign: "center",
              padding: "4px 0",
              background: C.successBg,
              borderRadius: 5,
              border: `1px solid rgba(34,197,94,0.2)`,
            }}
          >
            {uploadStatus}
          </div>
        )}

        <DropZone
          onClick={() => fileRef.current?.click()}
          onFile={(f) => void handlePickedFile(f)}
        />

        <UploadsList
          uploads={uploads}
          selectedIds={simDatasets}
          onOpen={(upload) => setActiveUpload(upload)}
          onToggle={(upload) =>
            onDatasetChange(
              simDatasets.includes(upload.id)
                ? simDatasets.filter((id) => id !== upload.id)
                : [...simDatasets, upload.id],
            )
          }
          onDelete={(upload) => {
            const confirmed = window.confirm(`Delete dataset "${upload.filename}"?`);
            if (!confirmed) return;
            void client
              .deleteUpload(upload.id)
              .then(() => {
                onDatasetChange(simDatasets.filter((id) => id !== upload.id));
                if (activeUpload?.id === upload.id) setActiveUpload(null);
                setUploadStatus(`Deleted ${upload.filename}`);
                setTimeout(() => setUploadStatus(""), 3000);
              })
              .catch((err) => {
                setUploadStatus(
                  err instanceof Error
                    ? `Delete failed: ${err.message}`
                    : "Delete failed",
                );
                setTimeout(() => setUploadStatus(""), 3000);
              });
          }}
        />
      </div>
      {pendingUpload && (
        <UploadReviewModal
          pending={pendingUpload}
          isSubmitting={confirmingUpload}
          onClose={() => {
            if (confirmingUpload) return;
            setPendingUpload(null);
          }}
          onConfirm={() => void confirmUpload()}
        />
      )}
      {activeUpload && (
        <DatasetEditorModal
          upload={activeUpload}
          onClose={() => setActiveUpload(null)}
          onSaved={(meta) => {
            setActiveUpload(meta);
            setUploadStatus(`Updated ${meta.filename}`);
            setTimeout(() => setUploadStatus(""), 3000);
          }}
        />
      )}
    </div>
  );
}

interface DropZoneProps {
  onClick: () => void;
  onFile: (file: File) => void;
}

function DropZone({ onClick, onFile }: DropZoneProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        border: `1px dashed ${hov ? C.accentLt : C.bdStrong}`,
        borderRadius: 8,
        padding: "22px 10px",
        textAlign: "center",
        cursor: "pointer",
        background: hov ? C.accentBg : "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        transition: "all 0.18s",
        userSelect: "none",
      }}
    >
      <Icon d={ICON.upload} size={20} stroke={hov ? C.accentLt : C.text2} />
      <div style={{ fontSize: 11, color: hov ? C.text0 : C.text1 }}>
        Drop .xlsx / .csv
      </div>
      <div style={{ fontSize: 9, color: C.text2 }}>or click to browse</div>
    </div>
  );
}

function UploadsList({
  uploads,
  selectedIds,
  onOpen,
  onToggle,
  onDelete,
}: {
  uploads: DevtoolsUploadMeta[];
  selectedIds: string[];
  onOpen: (upload: DevtoolsUploadMeta) => void;
  onToggle: (upload: DevtoolsUploadMeta) => void;
  onDelete: (upload: DevtoolsUploadMeta) => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.bdFaint}`,
        borderRadius: 7,
        overflow: "hidden",
        background: C.bg1,
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          borderBottom: `1px solid ${C.bdFaint}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 9,
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: C.text2,
          }}
        >
          Uploaded Files
        </span>
        <span style={{ fontSize: 9, color: C.text2 }}>{uploads.length}</span>
      </div>

      <div style={{ maxHeight: 180, overflowY: "auto", scrollbarWidth: "thin" }}>
        {uploads.length === 0 ? (
          <div
            style={{
              padding: "12px",
              fontSize: 10,
              color: C.text2,
              textAlign: "center",
            }}
          >
            No persisted uploads yet
          </div>
        ) : (
          uploads.map((upload) => {
            const active = selectedIds.includes(upload.id);
            return (
              <div
                key={upload.id}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  borderBottom: `1px solid ${C.bdFaint}`,
                  background: active ? C.accentBg : "transparent",
                  color: C.text1,
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(upload);
                    }}
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: 3,
                      border: `1px solid ${active ? C.accent : C.bdStrong}`,
                      background: active ? C.accent : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      cursor: "pointer",
                    }}
                  >
                    {active && <Icon d={ICON.check} size={8} stroke="white" sw={3} />}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpen(upload)}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      fontSize: 10,
                      color: active ? C.text0 : C.text1,
                      flex: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    {upload.filename}
                  </button>
                  <button
                    type="button"
                    title="Delete dataset"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(upload);
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      border: `1px solid rgba(239,68,68,0.25)`,
                      background: "transparent",
                      color: C.danger,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon d={ICON.trash} size={10} />
                  </button>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    color: C.text2,
                    fontFamily: C.mono,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span>{Math.max(1, Math.round(upload.sizeBytes / 1024))} KB</span>
                  <span>{new Date(upload.createdAt).toLocaleDateString()}</span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

interface UploadReviewModalProps {
  pending: PendingUpload;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function UploadReviewModal({
  pending,
  isSubmitting,
  onClose,
  onConfirm,
}: UploadReviewModalProps) {
  const visibleSchema = pending.schema.slice(0, 5);

  const badgeStyle = (kind: UploadSchemaField["kind"]): CSSProperties => ({
    fontSize: 8,
    letterSpacing: "0.8px",
    textTransform: "uppercase",
    padding: "3px 6px",
    borderRadius: 999,
    color:
      kind === "number"
        ? C.info
        : kind === "boolean"
          ? C.warn
          : kind === "mixed"
            ? C.accentLt
            : C.text1,
    background:
      kind === "number"
        ? C.infoBg
        : kind === "boolean"
          ? C.warnBg
          : kind === "mixed"
            ? C.accentBg
            : C.bg3,
    border: `1px solid ${C.bdFaint}`,
    flexShrink: 0,
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,12,15,0.82)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(5px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        style={{
          width: 520,
          maxWidth: "94vw",
          background: C.bg1,
          border: `1px solid ${C.bdStrong}`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          userSelect: "text",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: `1px solid ${C.bdFaint}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: C.text0, fontWeight: 600 }}>
              Review Upload
            </div>
            <div style={{ fontSize: 9, color: C.text2, marginTop: 4 }}>
              Confirm the file details before import.
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: "transparent",
              color: C.text2,
              border: "none",
              fontSize: 18,
              cursor: isSubmitting ? "default" : "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: C.bg2,
              border: `1px solid ${C.bdFaint}`,
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <Stat label="File" value={pending.file.name} />
            <Stat label="Format" value={`${pending.fileType} • ${pending.sheetName}`} />
            <Stat label="Records" value={String(pending.totalRecords)} />
            <Stat label="Columns" value={String(pending.totalColumns)} />
          </div>

          <div
            style={{
              borderRadius: 8,
              border: `1px solid ${C.bdFaint}`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                background: C.bg2,
                borderBottom: `1px solid ${C.bdFaint}`,
                fontSize: 9,
                color: C.text2,
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              Schema Preview
            </div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {visibleSchema.length > 0 ? (
                visibleSchema.map((field) => (
                  <div
                    key={field.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: C.text1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {field.name}
                    </span>
                    <span style={badgeStyle(field.kind)}>{field.kind}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 10, color: C.text2 }}>No columns detected.</div>
              )}
              {pending.schema.length > visibleSchema.length && (
                <div style={{ fontSize: 9, color: C.text2 }}>
                  +{pending.schema.length - visibleSchema.length} more columns
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "14px 18px",
            borderTop: `1px solid ${C.bdFaint}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={modalButtonStyle(false, isSubmitting)}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            style={modalButtonStyle(true, isSubmitting)}
          >
            {isSubmitting ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span
        style={{
          fontSize: 8,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: C.text2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 10,
          color: C.text0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function modalButtonStyle(primary: boolean, disabled: boolean): CSSProperties {
  return {
    height: 34,
    padding: "0 14px",
    borderRadius: 7,
    border: `1px solid ${primary ? C.accentBd : C.bdFaint}`,
    background: primary ? C.accent : C.bg2,
    color: primary ? "#fff" : C.text1,
    fontSize: 10,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

interface DatasetEditorModalProps {
  upload: DevtoolsUploadMeta;
  onClose: () => void;
  onSaved: (meta: DevtoolsUploadMeta) => void;
}

function DatasetEditorModal({ upload, onClose, onSaved }: DatasetEditorModalProps) {
  const client = useDevtoolsClient();
  const [rows, setRows] = useState<DatasetEditorRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [mime, setMime] = useState<string | null>(upload.mime ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const content = await client.getUploadContent(upload.id);
        if (cancelled) return;

        const parsed = parseUploadContent(content);
        setRows(parsed.rows);
        setColumns(parsed.columns);
        setMime(content.mime ?? upload.mime ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [client, upload]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      columns.some((column) =>
        (row.values[column] ?? "").toLowerCase().includes(needle),
      ),
    );
  }, [columns, query, rows]);

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedRows.has(row.id));

  const toggleRow = (rowId: string): void => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleAllFiltered = (): void => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        filteredRows.forEach((row) => next.delete(row.id));
      } else {
        filteredRows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  };

  const renameColumn = (column: string, nextName: string): void => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === column) return;
    if (columns.includes(trimmed)) {
      setError(`Column "${trimmed}" already exists`);
      return;
    }
    setError("");
    setColumns((current) => current.map((name) => (name === column ? trimmed : name)));
    setRows((current) =>
      current.map((row) => {
        const { [column]: oldValue = "", ...rest } = row.values;
        return {
          ...row,
          values: { ...rest, [trimmed]: oldValue },
        };
      }),
    );
  };

  const deleteColumn = (column: string): void => {
    setColumns((current) => current.filter((name) => name !== column));
    setRows((current) =>
      current.map((row) => {
        const { [column]: _removed, ...rest } = row.values;
        return { ...row, values: rest };
      }),
    );
  };

  const deleteSelectedRows = (): void => {
    setRows((current) => current.filter((row) => !selectedRows.has(row.id)));
    setSelectedRows(new Set());
  };

  const updateCell = (rowId: string, column: string, value: string): void => {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? { ...row, values: { ...row.values, [column]: value } }
          : row,
      ),
    );
  };

  const save = async (): Promise<void> => {
    setIsSaving(true);
    setError("");
    try {
      const nextRows = rows.map((row) =>
        columns.reduce<Record<string, string>>((acc, column) => {
          acc[column] = row.values[column] ?? "";
          return acc;
        }, {}),
      );
      const bytes = serializeUploadRows(upload.filename, columns, nextRows);
      const meta = await client.updateUpload(upload.id, {
        filename: upload.filename,
        mime,
        bytesBase64: arrayBufferToBase64(bytes),
      });
      onSaved(meta);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save file");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,12,15,0.82)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(5px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        style={{
          width: "min(1100px, 96vw)",
          height: "min(760px, 92vh)",
          background: C.bg1,
          border: `1px solid ${C.bdStrong}`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          userSelect: "text",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: `1px solid ${C.bdFaint}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                color: C.text0,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {upload.filename}
            </div>
            <div style={{ fontSize: 9, color: C.text2, marginTop: 4 }}>
              Search rows, select multiple, delete rows, and rename or delete columns.
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              background: "transparent",
              color: C.text2,
              border: "none",
              fontSize: 18,
              cursor: isSaving ? "default" : "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: 14,
            borderBottom: `1px solid ${C.bdFaint}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rows…"
            style={{
              flex: "1 1 240px",
              minWidth: 180,
              background: C.bg2,
              border: `1px solid ${C.bdFaint}`,
              borderRadius: 7,
              padding: "7px 10px",
              color: C.text0,
              fontFamily: C.mono,
              fontSize: 10,
              outline: "none",
            }}
          />
          <MiniBtn onClick={toggleAllFiltered}>
            {allFilteredSelected ? "Clear visible" : "Select visible"}
          </MiniBtn>
          <MiniBtn onClick={() => setSelectedRows(new Set())}>Clear selection</MiniBtn>
          <MiniBtn onClick={deleteSelectedRows} danger>
            Delete rows
          </MiniBtn>
          <span style={{ fontSize: 9, color: C.text2, marginLeft: "auto" }}>
            {filteredRows.length} rows • {columns.length} columns
          </span>
        </div>

        {error && (
          <div
            style={{
              margin: "12px 14px 0",
              padding: "8px 10px",
              borderRadius: 7,
              border: `1px solid rgba(239,68,68,0.25)`,
              background: "rgba(127,29,29,0.22)",
              color: C.danger,
              fontSize: 10,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: "hidden", padding: 14 }}>
          <div
            style={{
              height: "100%",
              border: `1px solid ${C.bdFaint}`,
              borderRadius: 8,
              overflow: "auto",
              background: C.bg0,
            }}
          >
            {isLoading ? (
              <div style={{ padding: 18, fontSize: 10, color: C.text2 }}>Loading file…</div>
            ) : columns.length === 0 ? (
              <div style={{ padding: 18, fontSize: 10, color: C.text2 }}>
                This file has no columns.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        width: 38,
                        minWidth: 38,
                        padding: 8,
                        borderBottom: `1px solid ${C.bdFaint}`,
                        position: "sticky",
                        top: 0,
                        background: C.bg2,
                        zIndex: 1,
                      }}
                    >
                      <div
                        onClick={toggleAllFiltered}
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: 3,
                          border: `1px solid ${allFilteredSelected ? C.accent : C.bdStrong}`,
                          background: allFilteredSelected ? C.accent : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          margin: "0 auto",
                        }}
                      >
                        {allFilteredSelected && (
                          <Icon d={ICON.check} size={8} stroke="white" sw={3} />
                        )}
                      </div>
                    </th>
                    {columns.map((column) => (
                      <th
                        key={column}
                        style={{
                          minWidth: 180,
                          padding: 8,
                          borderBottom: `1px solid ${C.bdFaint}`,
                          borderLeft: `1px solid ${C.bdFaint}`,
                          position: "sticky",
                          top: 0,
                          background: C.bg2,
                          verticalAlign: "top",
                          zIndex: 1,
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <input
                            defaultValue={column}
                            onBlur={(e) => renameColumn(column, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                renameColumn(column, e.currentTarget.value);
                                e.currentTarget.blur();
                              }
                            }}
                            style={{
                              width: "100%",
                              background: C.bg1,
                              border: `1px solid ${C.bdFaint}`,
                              borderRadius: 6,
                              padding: "6px 8px",
                              color: C.text0,
                              fontSize: 10,
                              fontWeight: 600,
                              outline: "none",
                            }}
                          />
                          <MiniBtn onClick={() => deleteColumn(column)} danger>
                            Delete column
                          </MiniBtn>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const active = selectedRows.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        style={{ background: active ? C.accentBg : "transparent" }}
                      >
                        <td
                          style={{
                            padding: 8,
                            borderBottom: `1px solid ${C.bdFaint}`,
                            textAlign: "center",
                          }}
                        >
                          <div
                            onClick={() => toggleRow(row.id)}
                            style={{
                              width: 13,
                              height: 13,
                              borderRadius: 3,
                              border: `1px solid ${active ? C.accent : C.bdStrong}`,
                              background: active ? C.accent : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              margin: "0 auto",
                            }}
                          >
                            {active && <Icon d={ICON.check} size={8} stroke="white" sw={3} />}
                          </div>
                        </td>
                        {columns.map((column) => (
                          <td
                            key={`${row.id}:${column}`}
                            style={{
                              padding: 8,
                              borderBottom: `1px solid ${C.bdFaint}`,
                              borderLeft: `1px solid ${C.bdFaint}`,
                            }}
                          >
                            <input
                              value={row.values[column] ?? ""}
                              onChange={(e) => updateCell(row.id, column, e.target.value)}
                              style={{
                                width: "100%",
                                background: C.bg1,
                                border: `1px solid ${C.bdFaint}`,
                                borderRadius: 6,
                                padding: "6px 8px",
                                color: C.text1,
                                fontSize: 10,
                                outline: "none",
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={columns.length + 1}
                        style={{
                          padding: 18,
                          textAlign: "center",
                          fontSize: 10,
                          color: C.text2,
                        }}
                      >
                        No rows match the current search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div
          style={{
            padding: "14px 18px",
            borderTop: `1px solid ${C.bdFaint}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            disabled={isSaving}
            style={modalButtonStyle(false, isSaving)}
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={isLoading || isSaving}
            style={modalButtonStyle(true, isLoading || isSaving)}
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MiniBtnProps {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

function MiniBtn({ children, onClick, danger }: MiniBtnProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontSize: 9,
        padding: "3px 8px",
        borderRadius: 4,
        border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : C.bdNormal}`,
        background: hov ? C.bg4 : "transparent",
        color: danger ? C.danger : C.text1,
        cursor: "pointer",
        fontFamily: C.mono,
        transition: "all 0.14s",
        userSelect: "none",
      }}
    >
      {children}
    </button>
  );
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

interface CanvasProps {
  nodeStates: Record<string, NodeStatus>;
  selectedId: string;
  transform: Transform;
  onTransformChange: (next: Transform) => void;
  onSelectNode: (id: string) => void;
}

function Canvas({
  nodeStates,
  selectedId,
  transform,
  onTransformChange,
  onSelectNode,
}: CanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });
  const startXfm = useRef<Transform>({ x: 0, y: 0, s: 1 });
  const didMove = useRef(false);

  // Re-render when active (for animateMotion ticks)
  const [, forceRender] = useState(0);
  useEffect(() => {
    const hasActive = Object.values(nodeStates).some((s) => s === "active");
    if (!hasActive) return;
    let raf: number;
    const loop = () => {
      forceRender((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [nodeStates]);

  // Wheel zoom — non-passive so preventDefault works
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      onTransformChange({
        ...transform,
        s: clamp(transform.s * (e.deltaY < 0 ? 1.09 : 0.92), 0.18, 2.8),
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onTransformChange, transform]);

  // Mouse drag — window-level listeners so panning never "escapes"
  const onMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      // Don't start pan on node elements
      const target = e.target as HTMLElement;
      if (target.closest("[data-veil-node]")) return;
      isPanning.current = true;
      didMove.current = false;
      startPan.current = { x: e.clientX, y: e.clientY };
      startXfm.current = { ...transform };
      e.preventDefault();

      const onMove = (ev: globalThis.MouseEvent) => {
        const dx = ev.clientX - startPan.current.x;
        const dy = ev.clientY - startPan.current.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didMove.current = true;
        onTransformChange({
          x: startXfm.current.x + dx,
          y: startXfm.current.y + dy,
          s: startXfm.current.s,
        });
      };
      const onUp = () => {
        isPanning.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [onTransformChange, transform],
  );

  const zoom = (f: number) =>
    onTransformChange({ ...transform, s: clamp(transform.s * f, 0.18, 2.8) });

  const resetView = () => onTransformChange(DEFAULT_CANVAS_TRANSFORM);

  return (
    <div
      ref={wrapRef}
      onMouseDown={onMouseDown}
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: C.bg0,
        cursor: isPanning.current ? "grabbing" : "grab",
        minWidth: 200,
        userSelect: "none",
      }}
    >
      {/* Dot grid */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <defs>
          <pattern
            id="veil-grid"
            width="30"
            height="30"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="15" cy="15" r="0.75" fill="rgba(255,255,255,0.06)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#veil-grid)" />
      </svg>

      {/* Transformed canvas content */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.s})`,
          transformOrigin: "0 0",
          pointerEvents: "none",
        }}
      >
        {/* SVG layer: edges only */}
        <svg
          width={1700}
          height={1500}
          style={{
            overflow: "visible",
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
          }}
        >
          <defs>
            {(["idle", "active", "complete", "error"] as const).map((st) => (
              <marker
                key={st}
                id={`vm-${st}`}
                markerWidth={7}
                markerHeight={7}
                refX={6}
                refY={3.5}
                orient="auto"
              >
                <path
                  d="M0,0 L0,7 L7,3.5 z"
                  fill={
                    st === "complete"
                      ? C.success
                      : st === "active"
                        ? C.accent
                        : st === "error"
                          ? C.danger
                          : C.bdStrong
                  }
                />
              </marker>
            ))}
          </defs>
          <CanvasEdges nodeStates={nodeStates} />
        </svg>

        {/* HTML layer: nodes */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "auto",
          }}
        >
          {NODES.map((node) => (
            <CanvasNode
              key={node.id}
              node={node}
              status={nodeStates[node.id] ?? "idle"}
              selected={node.id === selectedId}
              onClick={() => onSelectNode(node.id)}
            />
          ))}
        </div>
      </div>

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          background: C.bg2,
          border: `1px solid ${C.bdFaint}`,
          borderRadius: 7,
          padding: "5px 12px",
          display: "flex",
          gap: 12,
          fontSize: 10,
          color: C.text2,
          fontFamily: C.mono,
          pointerEvents: "none",
        }}
      >
        <span>
          ZOOM{" "}
          <span style={{ color: C.text1 }}>{Math.round(transform.s * 100)}%</span>
        </span>
        <span style={{ color: C.bdStrong }}>·</span>
        <span>drag to pan · scroll to zoom</span>
      </div>

      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {(
          [
            { icon: ICON.zoomin, fn: () => zoom(1.14), title: "Zoom in" },
            { icon: ICON.zoomout, fn: () => zoom(0.88), title: "Zoom out" },
            { icon: ICON.reset, fn: resetView, title: "Rest view" },
          ] as { icon: string | ReactNode; fn: () => void; title: string }[]
        ).map((b) => (
          <CanvasCtrlBtn key={b.title} onClick={b.fn} title={b.title}>
            <Icon d={b.icon} size={12} />
          </CanvasCtrlBtn>
        ))}
      </div>
    </div>
  );
}

interface CanvasCtrlBtnProps {
  children: ReactNode;
  onClick: () => void;
  title?: string;
}

function CanvasCtrlBtn({ children, onClick, title }: CanvasCtrlBtnProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        border: `1px solid ${hov ? C.bdStrong : C.bdFaint}`,
        background: hov ? C.bg3 : C.bg2,
        color: hov ? C.text0 : C.text1,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.14s",
        userSelect: "none",
      }}
    >
      {children}
    </button>
  );
}

interface CanvasEdgesProps {
  nodeStates: Record<string, NodeStatus>;
}

function CanvasEdges({ nodeStates }: CanvasEdgesProps) {
  const nodeMap = useMemo<Record<string, PipelineNode>>(
    () => Object.fromEntries(NODES.map((n) => [n.id, n])),
    [],
  );

  return (
    <g>
      {EDGES.map(({ from, to }, i) => {
        const fn = nodeMap[from];
        const tn = nodeMap[to];
        if (!fn || !tn) return null;

        const st = nodeStates[from] ?? "idle";
        const x1 = fn.col * COLW + NW / 2;
        const y1 = fn.row * ROWH + NH;
        const x2 = tn.col * COLW + NW / 2;
        const y2 = tn.row * ROWH;
        const my = (y1 + y2) / 2;
        const d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;

        const stroke =
          st === "complete"
            ? C.success
            : st === "active"
              ? C.accent
              : st === "error"
                ? C.danger
                : "rgba(255,255,255,0.09)";

        return (
          <g key={i}>
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={1.4}
              markerEnd={`url(#vm-${st})`}
              style={{ transition: "stroke 0.35s" }}
            />
            {st === "active" && (
              <circle r={4} fill={C.accentLt} opacity={0.85}>
                <animateMotion dur="1.1s" repeatCount="indefinite" path={d} />
              </circle>
            )}
          </g>
        );
      })}
    </g>
  );
}

interface CanvasNodeProps {
  node: PipelineNode;
  status: NodeStatus;
  selected: boolean;
  onClick: () => void;
}

function CanvasNode({ node, status, selected, onClick }: CanvasNodeProps) {
  const [hov, setHov] = useState(false);
  const col = TYPE_COLOR[node.type];

  const borderColor =
    status === "complete"
      ? C.success
      : status === "active"
        ? C.accent
        : status === "error"
          ? C.danger
          : selected
            ? C.accent
            : hov
              ? C.bdStrong
              : C.bdFaint;

  const bgColor =
    status === "active"
      ? `rgba(59,130,246,0.07)`
      : status === "complete"
        ? C.successBg
        : status === "error"
          ? C.dangerBg
          : hov || selected
            ? C.bg3
            : C.bg2;

  const x = node.col * COLW;
  const y = node.row * ROWH;

  const statusDotColor =
    status === "complete"
      ? C.success
      : status === "active"
        ? C.accent
        : status === "error"
          ? C.danger
          : C.bg4;

  return (
    <div
      data-veil-node="1"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: NW,
        height: NH,
        border: `1px solid ${borderColor}`,
        background: bgColor,
        borderRadius: 10,
        cursor: "pointer",
        transition: "border-color 0.22s, background 0.22s, box-shadow 0.22s",
        boxShadow: selected
          ? `0 0 0 2px ${C.accentBg}`
          : status === "active"
            ? `0 0 0 2px rgba(59,130,246,0.15)`
            : "none",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        userSelect: "none",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: TYPE_BG[node.type],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon d={ICON[node.type]} size={12} stroke={col} />
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: C.text0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {node.label}
        </span>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: statusDotColor,
            transition: "background 0.28s",
            flexShrink: 0,
          }}
        />
      </div>

      {/* Type label */}
      <div style={{ fontSize: 9, color: C.text2, letterSpacing: "0.5px" }}>
        {node.type.toUpperCase()}
      </div>

      {/* Model / tag badge */}
      {(node.model || node.tag) && (
        <div style={{ marginTop: 2 }}>
          <span
            style={{
              fontSize: 8,
              padding: "1px 6px",
              borderRadius: 3,
              background: node.model
                ? `rgba(59,130,246,0.12)`
                : `rgba(245,158,11,0.12)`,
              border: `1px solid ${node.model ? C.accentBd : "rgba(245,158,11,0.25)"}`,
              color: node.model ? C.accentLt : C.warn,
            }}
          >
            {node.model ?? node.tag}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "Explain SoftRanker",
  "Optimize features",
  "Run diagnostics",
  "What is SnapshotCache?",
];

function ChatPanel() {
  const client = useDevtoolsClient();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "ai",
      text: "Ask about the current snapshot, compare items, or request actions like fetching details and placing demo orders.",
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const [threads, setThreads] = useState<DevtoolsChatThread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("veil_devtools_thread");
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshThreads = useCallback(async () => {
    try {
      const next = await client.getChatThreads(undefined, 30);
      setThreads(next);
    } catch {
      // Ignore thread list refresh failures in the panel UI.
    }
  }, [client]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    if (!threadId) return;
    let alive = true;
    client
      .getChatMessages(threadId)
      .then((history) => {
        if (!alive) return;
        if (!history.length) return;
        setMessages(history.filter((entry) => entry.role !== "system").map(normalizeDevtoolsChatMessage));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client, threadId]);

  const send = useCallback(
    async (text?: string) => {
      const t = (text ?? input).trim();
      if (!t) return;
      setInput("");
      setMessages((m) => [...m, { role: "user", text: t }]);
      setTyping(true);
      const pendingId = `pending_${Date.now()}`;
      setMessages((m) => [...m, { id: pendingId, role: "ai", text: "" }]);
      let nextThreadId = threadId;

      try {
        await client.respondChatStream(
          {
            threadId: nextThreadId ?? undefined,
            title: "Devtools chat",
            message: t,
          },
          {
            onThread: (resolvedThreadId) => {
              if (!resolvedThreadId) return;
              nextThreadId = resolvedThreadId;
              setThreadId(resolvedThreadId);
              if (typeof window !== "undefined") {
                window.localStorage.setItem("veil_devtools_thread", resolvedThreadId);
              }
            },
            onChunk: (chunk) => {
              setMessages((current) =>
                current.map((entry) =>
                  entry.id === pendingId ? { ...entry, text: entry.text + chunk } : entry,
                ),
              );
            },
            onEvent: (event) => {
              if (event.type !== "tool-event") return;
              const toolMessageId = `tool_${event.id}`;

              setMessages((current) => {
                const toolIndex = current.findIndex((entry) => entry.id === toolMessageId);
                const existing = toolIndex >= 0 ? current[toolIndex] : null;
                const nextText = describeToolEvent(event, existing?.text ?? "");
                if (toolIndex >= 0) {
                  return current.map((entry, index) =>
                    index === toolIndex ? { ...entry, role: "tool", text: nextText } : entry,
                  );
                }
                const next = [...current];
                const pendingIndex = next.findIndex((entry) => entry.id === pendingId);
                const toolEntry: ChatMessage = { id: toolMessageId, role: "tool", text: nextText };
                if (pendingIndex >= 0) {
                  next.splice(pendingIndex, 0, toolEntry);
                  return next;
                }
                return [...next, toolEntry];
              });
            },
          },
        );

        if (nextThreadId) {
          const history = await client.getChatMessages(nextThreadId);
          setMessages(history.filter((entry) => entry.role !== "system").map(normalizeDevtoolsChatMessage));
        }
        await refreshThreads();
      } catch (error) {
        setMessages((current) =>
          current.map((entry) =>
            entry.id === pendingId
              ? {
                  ...entry,
                  text: error instanceof Error ? error.message : "Chat request failed.",
                }
              : entry,
          ),
        );
      } finally {
        setTyping(false);
      }
    },
    [client, input, refreshThreads, threadId],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const openThread = useCallback(
    async (nextThreadId: string) => {
      setThreadId(nextThreadId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("veil_devtools_thread", nextThreadId);
      }
      const history = await client.getChatMessages(nextThreadId);
      setMessages(history.length ? history.filter((entry) => entry.role !== "system").map(normalizeDevtoolsChatMessage) : []);
      setShowThreads(false);
    },
    [client],
  );

  const startNewThread = useCallback(() => {
    setThreadId(null);
    setMessages([
      {
        role: "ai",
        text: "New conversation. Ask about the current snapshot, compare items, or request a demo action.",
      },
    ]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("veil_devtools_thread");
    }
    setShowThreads(false);
  }, []);

  const ph: CSSProperties = {
    height: 34,
    padding: "0 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: `1px solid ${C.bdFaint}`,
    flexShrink: 0,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div style={ph}>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "1.6px",
            textTransform: "uppercase",
            color: C.text2,
            userSelect: "text",
          }}
        >
          Veil AI Assistant
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setShowThreads((v) => !v)}
            style={{
              height: 24,
              padding: "0 8px",
              borderRadius: 6,
              border: `1px solid ${C.bdNormal}`,
              background: showThreads ? C.accentBg : "transparent",
              color: showThreads ? C.accentLt : C.text2,
              cursor: "pointer",
              fontSize: 9,
              userSelect: "none",
            }}
          >
            Conversations
          </button>
          <span style={{ fontSize: 9, color: C.text2, userSelect: "text" }}>
            {threadId ? `thread ${threadId.slice(0, 8)}` : "new thread"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {showThreads && (
          <div
            style={{
              width: 210,
              borderRight: `1px solid ${C.bdFaint}`,
              overflowY: "auto",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <button
              onClick={startNewThread}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${C.accentBd}`,
                background: C.accentBg,
                color: C.accentLt,
                cursor: "pointer",
                fontSize: 10,
                textAlign: "left",
              }}
            >
              + New conversation
            </button>
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => void openThread(thread.id)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${thread.id === threadId ? C.accentBd : C.bdFaint}`,
                  background: thread.id === threadId ? C.accentBg : C.bg2,
                  color: thread.id === threadId ? C.text0 : C.text1,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4 }}>
                  {thread.title || "Untitled thread"}
                </div>
                <div style={{ fontSize: 9, color: C.text2 }}>
                  {formatTs(thread.updatedAt)}
                </div>
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 10px 4px",
            scrollbarWidth: "thin",
            userSelect: "text",
          }}
        >
          {messages.map((m, i) => (
            <ChatMsg key={m.id ?? i} msg={m} />
          ))}
          {typing && <TypingDots />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Quick prompts */}
      <div
        style={{
          padding: "5px 10px 4px",
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        {QUICK_PROMPTS.map((q) => (
          <QuickPromptBtn key={q} label={q} onClick={() => send(q)} />
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          padding: "5px 10px 10px",
          display: "flex",
          gap: 6,
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about your pipeline…"
          rows={2}
          style={{
            flex: 1,
            background: C.bg2,
            border: `1px solid ${C.bdFaint}`,
            borderRadius: 8,
            padding: "7px 10px",
            color: C.text0,
            fontFamily: C.mono,
            fontSize: 11,
            resize: "none",
            outline: "none",
            lineHeight: 1.45,
            userSelect: "text",
          }}
        />
        <button
          onClick={() => send()}
          style={{
            width: 34,
            height: 34,
            background: C.accent,
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 0.14s",
            userSelect: "none",
          }}
        >
          <Icon d={ICON.send} size={13} stroke="white" sw={2.5} />
        </button>
      </div>
    </div>
  );
}

interface ChatMsgProps {
  msg: ChatMessage;
}

function normalizeDevtoolsChatMessage(message: {
  id?: string;
  role: string;
  text?: string;
  parts?: unknown;
}): ChatMessage {
  const text = formatChatMessageText(message);
  return {
    id: message.id,
    role: message.role === "assistant" ? "ai" : (message.role as ChatMessage["role"]),
    text,
  };
}

function formatChatMessageText(message: {
  role: string;
  text?: string;
  parts?: unknown;
  toolName?: string;
}): string {
  if (typeof message.text === "string") return message.text;
  if (typeof message.parts === "string") return message.parts;
  if (message.role === "tool" && message.parts && typeof message.parts === "object") {
    const parts = message.parts as Record<string, unknown>;
    if (parts.type === "tool-call") {
      return `Calling ${message.toolName ?? "tool"}\n${prettyValue(parts.input)}`;
    }
    if (parts.type === "tool-result") {
      return `Result from ${message.toolName ?? "tool"}\n${prettyValue(parts.output)}`;
    }
  }
  return JSON.stringify(message.parts ?? "");
}

function describeToolEvent(event: Extract<DevtoolsChatStreamEvent, { type: "tool-event" }>, previous: string): string {
  if (event.phase === "input-start") {
    return `Calling ${event.toolName ?? "tool"}...`;
  }
  if (event.phase === "input-delta") {
    return `Calling ${event.toolName ?? "tool"}\n${event.inputText ?? previous}`;
  }
  if (event.phase === "call") {
    return `Calling ${event.toolName ?? "tool"}\n${prettyValue(event.input ?? event.inputText ?? {})}`;
  }
  if (event.phase === "result") {
    return `Result from ${event.toolName ?? "tool"}\n${prettyValue(event.output ?? {})}`;
  }
  if (event.phase === "error") {
    return `Tool error from ${event.toolName ?? "tool"}\n${String(event.error ?? "Unknown error")}`;
  }
  return previous;
}

function prettyValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ChatMsg({ msg }: ChatMsgProps) {
  const isUser = msg.role === "user";
  const isTool = msg.role === "tool";
  const [expanded, setExpanded] = useState(false);
  const toolLines = isTool ? msg.text.split("\n") : [];
  const toolSummary = isTool ? toolLines[0] ?? "Tool Trace" : "";
  const toolDetails = isTool ? toolLines.slice(1).join("\n").trim() : "";

  const renderText = (text: string): ReactNode[] => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**"))
        return (
          <strong key={i} style={{ color: C.text0, fontWeight: 600 }}>
            {p.slice(2, -2)}
          </strong>
        );
      if (p.startsWith("`") && p.endsWith("`"))
        return (
          <code
            key={i}
            style={{
              background: C.bg0,
              padding: "1px 4px",
              borderRadius: 3,
              fontSize: 10,
              color: C.info,
              fontFamily: C.mono,
            }}
          >
            {p.slice(1, -1)}
          </code>
        );
      if (p === "\n") return <br key={i} />;
      return <span key={i}>{p}</span>;
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 8,
      }}
    >
      {!isUser && (
        <div
          style={{
            fontSize: 9,
            color: C.text2,
            marginBottom: 3,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {!isTool ? (
            <>
              <img
                src={VeilLogo}
                alt="Veil"
                style={{ width: 14, height: 14, borderRadius: "50%" }}
              />
              Veil AI
            </>
          ) : (
            <>Tool Trace</>
          )}
        </div>
      )}
      <div
        style={{
          maxWidth: "93%",
          padding: "8px 11px",
          borderRadius: isUser ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
          background: isUser ? C.accent : isTool ? C.infoBg : C.bg3,
          border: isUser ? "none" : `1px solid ${isTool ? "rgba(6,182,212,0.22)" : C.bdFaint}`,
          fontSize: 11,
          lineHeight: 1.55,
          color: isUser ? "white" : isTool ? C.text0 : C.text1,
          fontFamily: C.mono,
        }}
        onClick={isTool ? () => setExpanded((v) => !v) : undefined}
      >
        {isTool ? (
          <div style={{ cursor: "pointer" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span>{renderText(toolSummary)}</span>
              <span style={{ fontSize: 10, color: C.info }}>
                {expanded ? "Hide" : "Show"}
              </span>
            </div>
            {expanded && toolDetails ? (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: `1px solid rgba(6,182,212,0.18)`,
                  whiteSpace: "pre-wrap",
                }}
              >
                {renderText(toolDetails)}
              </div>
            ) : null}
          </div>
        ) : (
          renderText(msg.text)
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        marginBottom: 8,
      }}
    >
      <div style={{ fontSize: 9, color: C.text2, marginBottom: 3 }}>
        Veil AI
      </div>
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "9px 13px",
          background: C.bg3,
          border: `1px solid ${C.bdFaint}`,
          borderRadius: "8px 8px 8px 2px",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: C.text2,
              animation: `veil-bounce 1.2s ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface QuickPromptBtnProps {
  label: string;
  onClick: () => void;
}

function QuickPromptBtn({ label, onClick }: QuickPromptBtnProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontSize: 9,
        padding: "3px 8px",
        borderRadius: 4,
        border: `1px solid ${hov ? C.bdStrong : C.bdFaint}`,
        background: hov ? C.bg3 : "transparent",
        color: hov ? C.text1 : C.text2,
        cursor: "pointer",
        fontFamily: C.mono,
        transition: "all 0.14s",
        userSelect: "none",
      }}
    >
      {label}
    </button>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      style={{ animation: "veil-spin 0.75s linear infinite" }}
    >
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  );
}

const NODE_DESCRIPTIONS: Record<string, string> = {
  Input: "Selected uploaded datasets are parsed into Veil items before the cycle starts.",
  HardScorer: "Deterministic ranker combining configured features, filters, and policies.",
  SnapshotCache: "Writes intermediate hard-ranked state into KV for downstream steps.",
  GroupedReplica: "Optional grouped hard snapshot used when group-by-category is enabled.",
  PluginArchives: "Plugin signal collection stage that enriches items before scoring.",
  PluginA: "Plugin execution branch for auxiliary signal providers.",
  PluginB: "Plugin execution branch for auxiliary signal providers.",
  Summarizer: "Reserved plugin summary stage in the devtools graph.",
  SoftRanker: "LLM re-ranker that scores the top hard-ranked candidates.",
  FinalCache: "Persists final ranked and chat snapshots into KV.",
  SnapshotRanked: "Final recommendation table written to KV as snapshot:ranked.",
  SnapshotChat: "Chat-optimized snapshot written to KV as snapshot:chat.",
};

function NodeDetailsPanel(args: {
  selectedId: string;
  nodeStates: Record<string, NodeStatus>;
  statusData: DevtoolsStatus | null;
  onClose?: () => void;
}) {
  const node = NODES.find((entry) => entry.id === args.selectedId);
  const status = args.nodeStates[args.selectedId] ?? "idle";
  const rows: InspectorRow[] = [
    { label: "Status", val: status, color: status === "complete" ? C.success : status === "active" ? C.accent : status === "error" ? C.danger : C.text2 },
    { label: "Type", val: node?.type ?? "—", color: node ? TYPE_COLOR[node.type] : C.text2 },
    { label: "Model", val: node?.model ?? args.statusData?.model ?? "—", color: C.warn },
    { label: "Last Run", val: args.statusData?.lastRan ? formatTs(Date.parse(args.statusData.lastRan)) : "—", color: C.text1 },
    { label: "Duration", val: args.statusData?.durationMs ? `${args.statusData.durationMs}ms` : "—", color: C.info },
    { label: "Items", val: typeof args.statusData?.itemCount === "number" ? `${args.statusData.itemCount}` : "—", color: C.text0 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ height: 34, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.bdFaint}` }}>
        <span style={{ fontSize: 9, letterSpacing: "1.6px", textTransform: "uppercase", color: C.text2 }}>Node Details</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, color: C.accentLt, background: C.accentBg, padding: "2px 8px", borderRadius: 4, border: `1px solid ${C.accentBd}` }}>
            {args.selectedId}
          </span>
          {args.onClose && (
            <button
              onClick={args.onClose}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: `1px solid ${C.bdNormal}`,
                background: "transparent",
                color: C.text2,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon d={ICON.close} size={10} />
            </button>
          )}
        </div>
      </div>
      <div style={{ padding: 12, borderBottom: `1px solid ${C.bdFaint}`, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text0 }}>{node?.label ?? args.selectedId}</div>
        <div style={{ fontSize: 10, color: C.text1, lineHeight: 1.6 }}>
          {NODE_DESCRIPTIONS[args.selectedId] ?? "No detail text available for this node yet."}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {rows.map((row, index) => (
          <div
            key={row.label}
            style={{
              padding: "8px 12px",
              borderBottom: `1px solid ${C.bdFaint}`,
              borderRight: index % 2 === 0 ? `1px solid ${C.bdFaint}` : "none",
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 10, color: C.text2 }}>{row.label}</span>
            <span style={{ fontSize: 10, color: row.color, fontFamily: C.mono, textAlign: "right" }}>{row.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeDetailsModal(args: {
  open: boolean;
  selectedId: string;
  nodeStates: Record<string, NodeStatus>;
  statusData: DevtoolsStatus | null;
  onClose: () => void;
}) {
  if (!args.open) return null;

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) args.onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,12,15,0.72)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: 720,
          maxWidth: "92vw",
          maxHeight: "82vh",
          background: C.bg1,
          border: `1px solid ${C.bdStrong}`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
        }}
      >
        <NodeDetailsPanel
          selectedId={args.selectedId}
          nodeStates={args.nodeStates}
          statusData={args.statusData}
          onClose={args.onClose}
        />
      </div>
    </div>
  );
}

function DataTablesPane(args: {
  tables: DevtoolsKvTable[];
}) {
  const [selectedTableKey, setSelectedTableKey] = useState<string>("");

  useEffect(() => {
    if (!args.tables.length) {
      setSelectedTableKey("");
      return;
    }
    setSelectedTableKey((current) =>
      current && args.tables.some((table) => table.key === current)
        ? current
        : args.tables[0]!.key,
    );
  }, [args.tables]);

  const selectedTable = args.tables.find((table) => table.key === selectedTableKey) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 240, borderRight: `1px solid ${C.bdFaint}`, overflowY: "auto" }}>
          {args.tables.map((table) => {
            const active = table.key === selectedTableKey;
            return (
              <button
                key={table.key}
                onClick={() => setSelectedTableKey(table.key)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  border: "none",
                  borderBottom: `1px solid ${C.bdFaint}`,
                  background: active ? C.accentBg : "transparent",
                  color: active ? C.accentLt : C.text1,
                  fontFamily: C.mono,
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                {table.key}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: 12 }}>
          {selectedTable ? <TableValueRenderer table={selectedTable} /> : <div style={{ color: C.text2, fontSize: 11 }}>No KV tables available yet.</div>}
        </div>
      </div>
    </div>
  );
}

function TableValueRenderer({ table }: { table: DevtoolsKvTable }) {
  if (Array.isArray(table.value)) {
    const rows = table.value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

    return (
      <div style={{ border: `1px solid ${C.bdFaint}`, borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, color: C.text2, borderBottom: `1px solid ${C.bdFaint}` }}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} style={{ padding: 16, fontSize: 11, color: C.text2 }}>Empty array</td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${table.key}_${index}`} style={{ borderBottom: `1px solid ${C.bdFaint}` }}>
                  {columns.map((column) => (
                    <td key={column} style={{ padding: "9px 12px", fontSize: 10, verticalAlign: "top" }}>
                      {formatCellValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (table.value && typeof table.value === "object") {
    return (
      <div style={{ border: `1px solid ${C.bdFaint}`, borderRadius: 10, overflow: "hidden" }}>
        {Object.entries(table.value as Record<string, unknown>).map(([key, value]) => (
          <div key={key} style={{ display: "grid", gridTemplateColumns: "220px 1fr", borderBottom: `1px solid ${C.bdFaint}` }}>
            <div style={{ padding: "10px 12px", color: C.text2, fontSize: 10, borderRight: `1px solid ${C.bdFaint}` }}>{key}</div>
            <div style={{ padding: "10px 12px", color: C.text0, fontSize: 10 }}>{formatCellValue(value)}</div>
          </div>
        ))}
      </div>
    );
  }

  return <div style={{ color: C.text2, fontSize: 11 }}>{formatCellValue(table.value)}</div>;
}

function formatCellValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

const SETTING_TABS: SettingTab[] = [
  { id: "llm", label: "LLM Models", icon: ICON.brain as string },
  { id: "system", label: "System Prompt", icon: ICON.terminal as string },
  { id: "features", label: "Features", icon: ICON.bars as string },
  { id: "filters", label: "Filters", icon: ICON.filter as string },
  { id: "plugins", label: "Plugins", icon: ICON.plug as string },
  { id: "cache", label: "Cache", icon: ICON.cache as string },
];

interface SettingsModalProps {
  onClose: () => void;
  plugins: DevtoolsPluginMeta[];
}

function SettingsModal({ onClose, plugins }: SettingsModalProps) {
  const client = useDevtoolsClient();
  const [tab, setTab] = useState("llm");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [features, setFeatures] = useState<FeatureMix>({
    recency: 20,
    popularity: 35,
    rating: 30,
    price: 15,
  });
  const [models, setModels] = useState({
    recommendation: "openai/gpt-4o",
    chat: "openai/gpt-4o-mini",
    summary: "anthropic/claude-haiku-4-5",
  });
  const [prompts, setPrompts] = useState({
    recommendation:
      "You are a recommendation engine for a general-purpose e-commerce store. Prioritize items that are trending, highly reviewed, and match recent purchase patterns. Avoid near-duplicate items. Prefer category diversity unless the user shows strong category affinity.",
    chat: "You are a helpful shopping assistant. Help users find products they'll love.",
  });
  const [filters, setFilters] = useState<FilterSettings>({
    categories: "electronics, books, clothing",
    priceMin: 0,
    priceMax: 500,
  });
  const [cacheSettings, setCacheSettings] = useState<CacheSettings>({
    refreshCron: "0 */6 * * *",
    maxItems: 200,
    kvBinding: "VEIL_KV",
    queueBinding: "VEIL_QUEUE",
  });
  const [toggles, setToggles] = useState<ToggleMap>({
    cache: true,
    autocompletion: true,
    groupByCategory: true,
    backgroundRefresh: true,
    diversity: true,
    priceRange: true,
    webPlugin: true,
    reviewsPlugin: true,
    socialPlugin: false,
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    client
      .getSettings()
      .then((s) => {
        if (!alive) return;
        setModels(s.models);
        setPrompts(s.prompts);
        setFilters(s.filters);
        setCacheSettings(s.cache);
        setFeatures(s.features);
        setToggles(s.toggles);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load settings");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [client]);

  const totalFeatureMix = Object.values(features).reduce((a, b) => a + b, 0);
  const toggle = (k: keyof ToggleMap) =>
    setToggles((t) => ({ ...t, [k]: !t[k] }));

  const save = async () => {
    const payload: DevtoolsSettings = {
      models,
      prompts,
      filters,
      cache: cacheSettings,
      features,
      toggles,
    };
    setSaving(true);
    setError(null);
    setSaveNotice(null);
    try {
      const saved = await client.saveSettings(payload);
      setModels(saved.models);
      setPrompts(saved.prompts);
      setFilters(saved.filters);
      setCacheSettings(saved.cache);
      setFeatures(saved.features);
      setToggles(saved.toggles);
      setSaveNotice("Settings saved to host.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,12,15,0.82)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(5px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 680,
          maxWidth: "95vw",
          maxHeight: "86vh",
          background: C.bg1,
          border: `1px solid ${C.bdStrong}`,
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          userSelect: "text",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "15px 20px",
            borderBottom: `1px solid ${C.bdFaint}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: C.sans,
              fontSize: 15,
              fontWeight: 600,
              color: C.text0,
              letterSpacing: "-0.2px",
            }}
          >
            Configuration
          </span>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: `1px solid ${C.bdNormal}`,
              background: "transparent",
              color: C.text2,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              userSelect: "none",
            }}
          >
            <Icon d={ICON.close} size={11} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Tab nav */}
          <div
            style={{
              width: 160,
              borderRight: `1px solid ${C.bdFaint}`,
              padding: "8px 7px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              flexShrink: 0,
            }}
          >
            {SETTING_TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: "7px 10px",
                    borderRadius: 6,
                    border: `1px solid ${active ? C.accentBd : "transparent"}`,
                    background: active ? C.accentBg : "transparent",
                    color: active ? C.accentLt : C.text2,
                    cursor: "pointer",
                    fontFamily: C.mono,
                    fontSize: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    textAlign: "left",
                    transition: "all 0.14s",
                    userSelect: "none",
                  }}
                >
                  <Icon
                    d={t.icon}
                    size={11}
                    stroke={active ? C.accentLt : C.text2}
                  />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 20px",
              scrollbarWidth: "thin",
            }}
          >
            {(loading || error || saveNotice) && (
              <div
                style={{
                  marginBottom: 12,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${
                    error
                      ? "rgba(239,68,68,0.35)"
                      : saveNotice
                        ? "rgba(34,197,94,0.35)"
                        : C.bdFaint
                  }`,
                  background: error ? C.dangerBg : saveNotice ? C.successBg : C.bg2,
                  color: error ? C.danger : saveNotice ? C.success : C.text2,
                  fontSize: 10,
                  fontFamily: C.mono,
                }}
              >
                {loading
                  ? "Loading settings from host…"
                  : error
                    ? `Settings unavailable: ${error}`
                    : saveNotice}
              </div>
            )}
            {tab === "llm" && (
              <SettingSection title="LLM Configuration">
                {(
                  [
                    {
                      key: "recommendation",
                      label: "Recommendation Model",
                      sub: "Soft ranking pass",
                    },
                    {
                      key: "chat",
                      label: "Chat Model",
                      sub: "User-facing chat",
                    },
                    {
                      key: "summary",
                      label: "Summary Model",
                      sub: "Plugin archive summarization",
                    },
                  ] as const
                ).map((f) => (
                  <CfgRow key={f.label} label={f.label} sub={f.sub}>
                    <select
                      value={models[f.key]}
                      onChange={(e) =>
                        setModels((m) => ({ ...m, [f.key]: e.target.value }))
                      }
                      style={selectStyle}
                    >
                      <option>openai/gpt-4o</option>
                      <option>openai/gpt-4o-mini</option>
                      <option>anthropic/claude-opus-4-6</option>
                      <option>anthropic/claude-sonnet-4-6</option>
                      <option>anthropic/claude-haiku-4-5</option>
                    </select>
                  </CfgRow>
                ))}
              </SettingSection>
            )}

            {tab === "system" && (
              <SettingSection title="System Prompts">
                <CfgRow label="Recommendation Prompt">
                  <textarea
                    rows={5}
                    value={prompts.recommendation}
                    onChange={(e) =>
                      setPrompts((p) => ({
                        ...p,
                        recommendation: e.target.value,
                      }))
                    }
                    style={taStyle}
                  />
                </CfgRow>
                <CfgRow label="Chat Prompt" style={{ marginTop: 12 }}>
                  <textarea
                    rows={3}
                    value={prompts.chat}
                    onChange={(e) =>
                      setPrompts((p) => ({ ...p, chat: e.target.value }))
                    }
                    style={taStyle}
                  />
                </CfgRow>
              </SettingSection>
            )}

            {tab === "features" && (
              <SettingSection title="Feature Mix">
                {(Object.entries(features) as [keyof FeatureMix, number][]).map(
                  ([k, v]) => (
                    <div key={k} style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 5,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            color: C.text1,
                            textTransform: "capitalize",
                          }}
                        >
                          {k}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color: C.accentLt,
                            fontWeight: 600,
                          }}
                        >
                          {v}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={v}
                        onChange={(e) =>
                          setFeatures((current) => ({
                            ...current,
                            [k]: parseInt(e.target.value),
                          }))
                        }
                        style={{ width: "100%", accentColor: C.accent }}
                      />
                    </div>
                  ),
                )}
                <div
                  style={{
                    padding: "7px 10px",
                    background: C.bg2,
                    border: `1px solid ${totalFeatureMix !== 100 ? "rgba(239,68,68,0.35)" : C.bdFaint}`,
                    borderRadius: 6,
                    fontSize: 9,
                    color: totalFeatureMix !== 100 ? C.danger : C.text2,
                  }}
                >
                  Total:{" "}
                  <span
                    style={{
                      color: totalFeatureMix !== 100 ? C.danger : C.success,
                      fontWeight: 600,
                    }}
                  >
                    {totalFeatureMix}%
                  </span>
                  {totalFeatureMix !== 100 && " — must sum to 100%"}
                </div>
              </SettingSection>
            )}

            {tab === "filters" && (
              <SettingSection title="Filters & Policies">
                <CfgRow label="Categories">
                  <input
                    value={filters.categories}
                    onChange={(e) =>
                      setFilters((current) => ({
                        ...current,
                        categories: e.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </CfgRow>
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                  }}
                >
                  {[
                    {
                      key: "diversity" as const,
                      label: "Diversity (max 3 per category)",
                    },
                    {
                      key: "priceRange" as const,
                      label: "Price Range Filter (0–500)",
                    },
                  ].map((f) => (
                    <div key={f.key} style={toggleRowStyle}>
                      <span style={{ fontSize: 10, color: C.text1 }}>
                        {f.label}
                      </span>
                      <Toggle
                        on={toggles[f.key]}
                        onToggle={() => toggle(f.key)}
                      />
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  {[
                    { label: "Price Min", val: "0" },
                    { label: "Price Max", val: "500" },
                  ].map((f) => (
                    <CfgRow key={f.label} label={f.label}>
                      <input
                        value={f.label === "Price Min" ? filters.priceMin : filters.priceMax}
                        onChange={(e) =>
                          setFilters((current) => ({
                            ...current,
                            [f.label === "Price Min" ? "priceMin" : "priceMax"]:
                              Number(e.target.value),
                          }))
                        }
                        style={inputStyle}
                        type="number"
                      />
                    </CfgRow>
                  ))}
                </div>
              </SettingSection>
            )}

            {tab === "plugins" && (
              <SettingSection title="Plugin Configuration">
                {plugins.length === 0 && (
                  <div
                    style={{
                      marginBottom: 14,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.bdFaint}`,
                      background: C.bg2,
                      color: C.text2,
                      fontSize: 10,
                      fontFamily: C.mono,
                    }}
                  >
                    No plugin archives detected from `/api/devtools/plugins` yet.
                  </div>
                )}
                {[
                  {
                    key: "webPlugin" as const,
                    label: "webPlugin",
                    sub: "Events: view, click, purchase, dwell · Sampling: 100%",
                  },
                  {
                    key: "reviewsPlugin" as const,
                    label: "reviewsPlugin",
                    sub: "Sources: google, yelp · Schedule: every 12h",
                  },
                  {
                    key: "socialPlugin" as const,
                    label: "socialPlugin",
                    sub: "Sources: reddit, hackernews · Schedule: every 8h",
                  },
                ].map((p) => (
                  <div
                    key={p.key}
                    style={{
                      marginBottom: 14,
                      paddingBottom: 14,
                      borderBottom: `1px solid ${C.bdFaint}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: C.text0,
                          fontWeight: 500,
                          fontFamily: C.mono,
                        }}
                      >
                        {p.label}
                      </span>
                      <Toggle
                        on={toggles[p.key]}
                        onToggle={() => toggle(p.key)}
                      />
                    </div>
                    <div
                      style={{ fontSize: 9, color: C.text2, lineHeight: 1.5 }}
                    >
                      {p.sub}
                    </div>
                    {plugins.find((plugin) => plugin.id === p.label) && (
                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          gap: 8,
                          fontSize: 9,
                          color: C.text2,
                          fontFamily: C.mono,
                        }}
                      >
                        <span>
                          archives: {plugins.find((plugin) => plugin.id === p.label)?.archiveCount ?? 0}
                        </span>
                        <span>
                          updated: {formatTs(plugins.find((plugin) => plugin.id === p.label)?.summaryUpdatedAt)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </SettingSection>
            )}

            {tab === "cache" && (
              <SettingSection title="Cache & Storage">
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                    marginBottom: 14,
                  }}
                >
                  {[
                    { key: "cache" as const, label: "Recommendation cache" },
                    { key: "autocompletion" as const, label: "Autocompletion" },
                    {
                      key: "groupByCategory" as const,
                      label: "Group by category",
                    },
                    {
                      key: "backgroundRefresh" as const,
                      label: "Background refresh",
                    },
                  ].map((f) => (
                    <div key={f.key} style={toggleRowStyle}>
                      <span style={{ fontSize: 10, color: C.text1 }}>
                        {f.label}
                      </span>
                      <Toggle
                        on={toggles[f.key]}
                        onToggle={() => toggle(f.key)}
                      />
                    </div>
                  ))}
                </div>
                {[
                  {
                    label: "Refresh Cron",
                    value: cacheSettings.refreshCron,
                    key: "refreshCron",
                    type: "text",
                  },
                  {
                    label: "Max Items",
                    value: String(cacheSettings.maxItems),
                    key: "maxItems",
                    type: "number",
                  },
                  {
                    label: "KV Binding",
                    value: cacheSettings.kvBinding,
                    key: "kvBinding",
                    type: "text",
                  },
                  {
                    label: "Queue Binding",
                    value: cacheSettings.queueBinding,
                    key: "queueBinding",
                    type: "text",
                  },
                ].map((f) => (
                  <CfgRow
                    key={f.label}
                    label={f.label}
                    style={{ marginBottom: 10 }}
                  >
                    <input
                      value={f.value}
                      type={f.type}
                      onChange={(e) =>
                        setCacheSettings((current) => ({
                          ...current,
                          [f.key]:
                            f.key === "maxItems"
                              ? Number(e.target.value)
                              : e.target.value,
                        }))
                      }
                      style={inputStyle}
                    />
                  </CfgRow>
                ))}
              </SettingSection>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${C.bdFaint}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              borderRadius: 7,
              border: `1px solid ${C.bdNormal}`,
              background: "transparent",
              color: C.text1,
              cursor: "pointer",
              fontFamily: C.mono,
              fontSize: 10,
              userSelect: "none",
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || loading || totalFeatureMix !== 100}
            style={{
              padding: "7px 16px",
              borderRadius: 7,
              border: "none",
              background: C.accent,
              color: "white",
              cursor: "pointer",
              fontFamily: C.mono,
              fontSize: 10,
              fontWeight: 500,
              userSelect: "none",
              opacity: saving || loading || totalFeatureMix !== 100 ? 0.65 : 1,
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Settings helpers

const inputStyle: CSSProperties = {
  width: "100%",
  background: C.bg2,
  border: `1px solid ${C.bdFaint}`,
  borderRadius: 5,
  padding: "6px 9px",
  color: C.text0,
  fontFamily: C.mono,
  fontSize: 10,
  outline: "none",
  marginTop: 5,
  userSelect: "text",
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  marginTop: 5,
};

const taStyle: CSSProperties = {
  ...inputStyle,
  resize: "none",
  lineHeight: 1.55,
};

const toggleRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 0",
  borderBottom: `1px solid ${C.bdFaint}`,
};

interface SettingSectionProps {
  title: string;
  children: ReactNode;
}

function SettingSection({ title, children }: SettingSectionProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "1.6px",
          textTransform: "uppercase",
          color: C.text2,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

interface CfgRowProps {
  label: string;
  sub?: string;
  children: ReactNode;
  style?: CSSProperties;
}

function CfgRow({ label, sub, children, style }: CfgRowProps) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <div style={{ fontSize: 10, color: C.text1 }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 9, color: C.text3, marginTop: 1 }}>{sub}</div>
      )}
      {children}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function VeilDevTools({}: { title: string; version: string }) {
  const client = useDevtoolsClient();
  const [nodeStates, setNodeStates] = useState<Record<string, NodeStatus>>({});
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_SELECTED_NODE_ID);
  const [showNodeDetails, setShowNodeDetails] = useState<boolean>(false);
  const [workspaceTab, setWorkspaceTab] = useState<"canvas" | "tables">("canvas");
  const [canvasTransform, setCanvasTransform] = useState<Transform>(DEFAULT_CANVAS_TRANSFORM);
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simProgress, setSimProgress] = useState<number>(0);
  const [simDatasets, setSimDatasets] = useState<string[]>([]);
  const [runMessage, setRunMessage] = useState<string>("");
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [leftW, setLeftW] = useState<number>(DEFAULT_LAYOUT.leftW);
  const [rightW, setRightW] = useState<number>(DEFAULT_LAYOUT.rightW);
  const { data: statusData } = usePolling(
    () => client.getStatus(),
    client.options.pollIntervalMs,
  );
  const { data: snapshotData } = usePolling(
    () => client.getSnapshot(),
    client.options.pollIntervalMs,
  );
  const { data: tablesData } = usePolling(
    () => client.getTables(),
    client.options.pollIntervalMs,
  );
  const { data: pluginData } = usePolling(
    () => client.getPlugins(),
    client.options.pollIntervalMs,
  );

  const snapshot = snapshotData ?? [];
  const tables = tablesData ?? [];
  const plugins = pluginData ?? [];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(UI_STATE_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        canvasTransform?: Transform;
        selectedId?: string;
        workspaceTab?: "canvas" | "tables";
        leftW?: number;
        rightW?: number;
      };
      setCanvasTransform(saved.canvasTransform ?? DEFAULT_CANVAS_TRANSFORM);
      setSelectedId(saved.selectedId ?? DEFAULT_SELECTED_NODE_ID);
      setWorkspaceTab(saved.workspaceTab ?? "canvas");
      setLeftW(saved.leftW ?? DEFAULT_LAYOUT.leftW);
      setRightW(saved.rightW ?? DEFAULT_LAYOUT.rightW);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        UI_STATE_STORAGE_KEY,
        JSON.stringify({
          canvasTransform,
          selectedId,
          workspaceTab,
          leftW,
          rightW,
        }),
      );
    } catch {}
  }, [canvasTransform, leftW, rightW, selectedId, workspaceTab]);

  useEffect(() => {
    const runState = statusData?.runState;
    if (!runState) return;
    setNodeStates(runState.nodeStates as Record<string, NodeStatus>);
    setSimRunning(runState.running);
    setSimProgress(runState.progress);
    setRunMessage(runState.message);
    if (runState.selectedNodeId) setSelectedId(runState.selectedNodeId);
  }, [statusData?.runState]);

  const setAllNodeStates = useCallback((next: NodeStatus) => {
    const state: Record<string, NodeStatus> = {};
    NODES.forEach((node) => {
      state[node.id] = next;
    });
    setNodeStates(state);
  }, []);

  const runSimulation = useCallback(async (): Promise<void> => {
    if (simRunning) return;
    if (!simDatasets.length) {
      setRunMessage("Select at least one uploaded dataset to run the workflow");
      return;
    }
    setSimRunning(true);
    setSimProgress(6);
    setRunMessage("Loading input");
    setNodeStates({
      ...Object.fromEntries(NODES.map((n) => [n.id, "idle"] as const)),
      Input: "active",
    });
    setSelectedId("Input");

    try {
      const uploadContents = await Promise.all(
        simDatasets.map((id) => client.getUploadContent(id)),
      );
      const items = uploadContents.flatMap((content) => {
        const parsed = parseUploadContent(content);
        return datasetRowsToItems(parsed.rows);
      });

      const result = await client.runCycle("run", {
        items,
        selectedUploadIds: simDatasets,
      });
      setAllNodeStates("complete");
      setSimProgress(100);
      setRunMessage(
        `Cycle complete · ${result.itemCount ?? statusData?.itemCount ?? snapshot.length} items`,
      );
      setSelectedId("SnapshotRanked");
    } catch (err) {
      setAllNodeStates("error");
      setSimProgress(0);
      setRunMessage(
        err instanceof Error ? `Cycle failed · ${err.message}` : "Cycle failed",
      );
    } finally {
      setSimRunning(false);
    }
  }, [client, setAllNodeStates, simDatasets, simRunning, snapshot.length, statusData?.itemCount]);

  return (
    <>
      {/* Global styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; overflow: hidden; background: ${C.bg0}; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.bdStrong}; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.text2}; }
        textarea, input { caret-color: ${C.accentLt}; }
        textarea:focus, input:focus, select:focus { border-color: ${C.accentBd} !important; }
        @keyframes veil-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%            { transform: translateY(-6px); }
        }
        @keyframes veil-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          width: "100%",
          background: C.bg0,
          color: C.text0,
          fontFamily: C.mono,
          fontSize: 12,
          overflow: "hidden",
          // Global: text selectable everywhere except canvas (canvas sets its own)
          userSelect: "text",
        }}
      >
        {/* ── HEADER ──────────────────────────────────────────────── */}
        <header
          style={{
            height: 44,
            background: C.bg1,
            borderBottom: `1px solid ${C.bdNormal}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            flexShrink: 0,
            zIndex: 100,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={VeilLogo}
              alt="veil"
              style={{ width: 28, height: 28, borderRadius: 7 }}
            />

            <span
              style={{
                fontFamily: C.sans,
                fontSize: 13,
                fontWeight: 600,
                color: C.text0,
                letterSpacing: "2px",
                userSelect: "text",
              }}
            >
              @veil/<span className="text-blue-400 text-xs">devtools</span>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {(["canvas", "tables"] as const).map((tab) => (
                <Btn
                  key={tab}
                  onClick={() => setWorkspaceTab(tab)}
                  active={workspaceTab === tab}
                >
                  {tab === "canvas" ? "Canvas" : "Data Table"}
                </Btn>
              ))}
            </div>
            <Btn
              onClick={() => void runSimulation()}
              active={simRunning}
              disabled={simRunning || simDatasets.length === 0}
              title={simDatasets.length === 0 ? "Select at least one dataset to run" : undefined}
            >
              <Icon d={ICON.play} size={11} fill="currentColor" />
              {simRunning ? "Running" : "Run Workflow"}
            </Btn>
            <Btn onClick={() => setShowSettings(true)} active={showSettings}>
              <Icon d={ICON.settings} size={11} />
              Settings
            </Btn>
          </div>
        </header>

        {/* ── MAIN ────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Left panel */}
          <div
            style={{
              width: leftW,
              minWidth: 190,
              maxWidth: 520,
              background: C.bg1,
              borderRight: `1px solid ${C.bdFaint}`,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <LeftPanel
              simDatasets={simDatasets}
              onDatasetChange={setSimDatasets}
            />
          </div>

          <ResizeHandle
            onDrag={(d) => setLeftW((w) => clamp(w + d, 190, 520))}
          />

          {/* Workspace */}
          <div
            style={{
              flex: 1,
              minWidth: 200,
              background: C.bg0,
              overflow: "hidden",
              display: "flex",
            }}
          >
            {workspaceTab === "canvas" ? (
              <Canvas
                nodeStates={nodeStates}
                selectedId={selectedId}
                transform={canvasTransform}
                onTransformChange={setCanvasTransform}
                onSelectNode={(id) => {
                  setSelectedId(id);
                  setShowNodeDetails(true);
                }}
              />
            ) : (
              <DataTablesPane tables={tables} />
            )}
          </div>

          <ResizeHandle
            onDrag={(d) => setRightW((w) => clamp(w - d, 220, 520))}
          />

          {/* Right panel */}
          <div
            style={{
              width: rightW,
              minWidth: 220,
              maxWidth: 520,
              background: C.bg1,
              borderLeft: `1px solid ${C.bdFaint}`,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <ChatPanel />
          </div>
        </div>

      </div>

      <NodeDetailsModal
        open={showNodeDetails}
        selectedId={selectedId}
        nodeStates={nodeStates}
        statusData={statusData ?? null}
        onClose={() => setShowNodeDetails(false)}
      />

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          plugins={plugins}
        />
      )}
    </>
  );
}
