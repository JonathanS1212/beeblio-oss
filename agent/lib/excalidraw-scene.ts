/**
 * Compact create/read/edit layer over .excalidraw scene JSON. The agent-facing
 * tools (read_excalidraw, update_excalidraw) speak a small element DSL —
 * shapes with labels, free text, arrows addressed by from/to element ids —
 * and this module expands it into full Excalidraw elements, so models never
 * hand-write the verbose per-element property soup. Pure TypeScript, no
 * Excalidraw package import: the element shape here mirrors
 * @excalidraw/excalidraw 0.18's element schema (see
 * node_modules/@excalidraw/excalidraw/dist/types/excalidraw/element/types.d.ts)
 * and unknown fields on foreign elements are passed through untouched.
 */

export type ExcalidrawShapeType = "rectangle" | "ellipse" | "diamond";
export type ExcalidrawElementType = ExcalidrawShapeType | "text" | "arrow" | "line";

/** Hard cap so a runaway loop cannot produce a scene the editor chokes on. */
export const MAX_SCENE_ELEMENTS = 500;

const BINDABLE_TYPES = new Set(["rectangle", "ellipse", "diamond", "text"]);
const CONNECTOR_TYPES = new Set(["arrow", "line"]);
const DEFAULT_STROKE_COLOR = "#1e1e1e";
const DEFAULT_FONT_SIZE = 20;
const LINE_HEIGHT = 1.25;
// Generous average advance for Virgil/handwritten fonts so labels never clip.
const CHAR_WIDTH_FACTOR = 0.62;
// Standoff between an arrow endpoint and the shape edge it attaches to.
const ARROW_GAP = 1;

/** Compact element description the agent supplies. */
export interface CompactElementInput {
  /** Stable id other elements reference (from/to, later edits). Auto-assigned when omitted. */
  id?: string;
  type: ExcalidrawElementType;
  /** Label inside a shape, on an arrow/line, or (for type "text") the text itself. */
  label?: string;
  x?: number;
  y?: number;
  /** Omitted sizes are estimated from the label so text always fits. */
  width?: number;
  height?: number;
  /** Arrow/line endpoints as element ids; the geometry is computed for you. */
  from?: string;
  to?: string;
  /** Absolute waypoints for unbound arrows/lines, or intermediate routing for from/to arrows. */
  points?: Array<[number, number]>;
  /** Stroke color; also becomes the bound label's font color. */
  color?: string;
  /** Shape background color ("transparent" allowed). */
  fill?: string;
  dashed?: boolean;
  /** Both arrowheads (default: end only). */
  bidirectional?: boolean;
  fontSize?: number;
}

export interface ElementUpdate {
  id: string;
  /** New shape/arrow label, or new text for free text elements. */
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  fill?: string;
  dashed?: boolean;
  fontSize?: number;
}

export type ExcalidrawOperation =
  | { op: "add_elements"; elements: CompactElementInput[] }
  | { op: "update_elements"; updates: ElementUpdate[] }
  | { op: "delete_elements"; ids: string[] };

/**
 * A scene element as stored in the file. Ops only rely on the typed fields;
 * anything else (image fileId, customData, …) rides along untouched.
 */
export interface SceneElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

export interface ExcalidrawScene {
  elements: SceneElement[];
  appState: Record<string, unknown>;
  files: unknown;
}

export interface DigestEntry {
  id: string;
  type: string;
  label?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  from?: string;
  to?: string;
}

export interface SceneDigest {
  elementCount: number;
  elements: DigestEntry[];
  warnings: string[];
}

type Pt = { x: number; y: number };

// ---------------------------------------------------------------------------
// Parsing and serialization
// ---------------------------------------------------------------------------

export function createEmptyScene(): ExcalidrawScene {
  return {
    elements: [],
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: {},
  };
}

/**
 * Parses .excalidraw JSON (or .excalidraw.json). Mirrors the app editor's
 * parse semantics: empty input is an empty scene, anything else that is not
 * a scene-bearing object is an error. Soft-deleted elements are dropped
 * because exports never contain them and the editor treats them as absent.
 */
export function parseExcalidrawScene(
  content: string,
): { scene: ExcalidrawScene } | { error: string } {
  if (!content.trim()) return { scene: createEmptyScene() };

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { error: "This file is not valid JSON, so it can't be read as an Excalidraw scene." };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { elements?: unknown }).elements)
  ) {
    return { error: "This file doesn't look like an Excalidraw scene (no elements array)." };
  }

  const raw = parsed as { elements: unknown[]; appState?: unknown; files?: unknown };
  const elements: SceneElement[] = [];
  for (const candidate of raw.elements) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const element = candidate as Record<string, unknown>;
    if (element.isDeleted === true) continue;
    if (typeof element.id !== "string" || typeof element.type !== "string") continue;
    elements.push(element as SceneElement);
  }
  return {
    scene: {
      elements,
      appState:
        typeof raw.appState === "object" && raw.appState !== null
          ? (raw.appState as Record<string, unknown>)
          : {},
      files: raw.files ?? {},
    },
  };
}

/** Serializes in the same wrapper shape and 2-space layout as serializeAsJSON. */
export function serializeExcalidrawScene(scene: ExcalidrawScene): string {
  return JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: scene.elements,
      appState: Object.keys(scene.appState).length
        ? scene.appState
        : { viewBackgroundColor: "#ffffff", gridSize: null },
      files: scene.files ?? {},
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Primitives: ids, seeds, measurement
// ---------------------------------------------------------------------------

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic seed per id: identical inputs produce identical files. */
function seedFor(id: string): number {
  return fnv1a(`seed:${id}`) || 1;
}

function nonceFor(id: string): number {
  return fnv1a(`nonce:${id}`) || 1;
}

function uniqueId(existing: Set<string>, base: string): string {
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function measureLabel(label: string, fontSize: number) {
  const lines = label.split("\n");
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return {
    lines,
    textWidth: Math.ceil(longest * fontSize * CHAR_WIDTH_FACTOR),
    textHeight: Math.ceil(lines.length * fontSize * LINE_HEIGHT),
  };
}

/** Container size per shape type so the wrapped label fits with margin. */
function shapeSize(
  type: ExcalidrawShapeType,
  textWidth: number,
  textHeight: number,
): { width: number; height: number } {
  if (type === "ellipse") {
    return {
      width: Math.max(140, Math.ceil(textWidth * 1.45) + 28),
      height: Math.max(90, Math.ceil(textHeight * 1.7) + 20),
    };
  }
  if (type === "diamond") {
    return {
      width: Math.max(160, Math.ceil(textWidth * 1.85) + 28),
      height: Math.max(110, Math.ceil(textHeight * 2.3) + 20),
    };
  }
  return {
    width: Math.max(120, textWidth + 48),
    height: Math.max(70, textHeight + 32),
  };
}

function elementCenter(element: SceneElement): Pt {
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}

/**
 * Point where the segment from a shape's center toward `target` crosses the
 * shape's bounding box (plus a small gap) — the arrow attachment edge point.
 */
function trimToBoxEdge(from: Pt, target: Pt, element: SceneElement): Pt {
  let to = target;
  if (to.x === from.x && to.y === from.y) {
    // Degenerate identical centers: stub upward out of the box.
    to = { x: from.x, y: from.y - (element.height / 2 + ARROW_GAP) };
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const minX = element.x - ARROW_GAP;
  const maxX = element.x + element.width + ARROW_GAP;
  const minY = element.y - ARROW_GAP;
  const maxY = element.y + element.height + ARROW_GAP;
  let t = 1;
  if (dx !== 0) t = Math.min(t, (dx > 0 ? maxX - from.x : minX - from.x) / dx);
  if (dy !== 0) t = Math.min(t, (dy > 0 ? maxY - from.y : minY - from.y) / dy);
  t = Math.max(0, t);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

function asPt(point: [number, number]): Pt {
  return { x: point[0], y: point[1] };
}

// ---------------------------------------------------------------------------
// Scene index helpers
// ---------------------------------------------------------------------------

class SceneIndex {
  private readonly byId = new Map<string, SceneElement>();

  constructor(elements: SceneElement[]) {
    for (const element of elements) this.byId.set(element.id, element);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): SceneElement {
    const element = this.byId.get(id);
    if (!element) {
      const known = [...this.byId.keys()].slice(0, 8).join(", ");
      throw new Error(
        `Unknown element id "${id}".` + (known ? ` Known ids include: ${known}.` : " The scene is empty."),
      );
    }
    return element;
  }

  add(element: SceneElement): void {
    this.byId.set(element.id, element);
  }

  allIds(): Set<string> {
    return new Set(this.byId.keys());
  }
}

/** Vertical slot cascade for unpositioned elements: a tidy top-to-bottom column. */
class CascadeCursor {
  private nextY: number;

  constructor(elements: SceneElement[]) {
    let bottom = 0;
    for (const element of elements) bottom = Math.max(bottom, element.y + element.height);
    this.nextY = elements.length === 0 ? 80 : Math.max(80, bottom + 80);
  }

  slot(height: number): Pt {
    const point = { x: 80, y: this.nextY };
    this.nextY += height + 60;
    return point;
  }
}

function findBoundLabel(scene: ExcalidrawScene, containerId: string): SceneElement | undefined {
  return scene.elements.find(
    (element) => element.type === "text" && element.containerId === containerId,
  );
}

function appendBoundElement(element: SceneElement, entry: { id: string; type: string }): void {
  if (!Array.isArray(element.boundElements)) element.boundElements = [];
  (element.boundElements as Array<{ id: string; type: string }>).push(entry);
}

function capacityCheck(scene: ExcalidrawScene, incoming: number): void {
  if (scene.elements.length + incoming > MAX_SCENE_ELEMENTS) {
    throw new Error(
      `This scene would exceed ${MAX_SCENE_ELEMENTS} elements ` +
        `(currently ${scene.elements.length}, adding ${incoming}).`,
    );
  }
}

function claimId(index: SceneIndex, requested: string | undefined, fallback: string): string {
  if (requested === undefined) return uniqueId(index.allIds(), fallback);
  if (index.has(requested)) {
    throw new Error(`Element id "${requested}" already exists in this scene; choose a different id.`);
  }
  return requested;
}

function bumpVersion(element: SceneElement, now: number): void {
  element.version = Number(element.version ?? 1) + 1;
  element.versionNonce = nonceFor(`${element.id}:${element.version}`);
  element.updated = now;
}

// ---------------------------------------------------------------------------
// Element construction
// ---------------------------------------------------------------------------

function baseElement(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { color?: string; fill?: string; dashed?: boolean; now: number },
): SceneElement {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: options.color ?? DEFAULT_STROKE_COLOR,
    backgroundColor: options.fill ?? "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: options.dashed ? "dashed" : "solid",
    roughness: 1,
    opacity: 100,
    roundness: null,
    groupIds: [],
    frameId: null,
    index: null,
    boundElements: null,
    updated: options.now,
    link: null,
    locked: false,
    seed: seedFor(id),
    version: 1,
    versionNonce: nonceFor(id),
    isDeleted: false,
  };
}

function textFields(
  element: SceneElement,
  text: string,
  fontSize: number,
  align: "left" | "center",
  verticalAlign: "top" | "middle",
  containerId: string | null,
  autoResize: boolean,
): void {
  element.text = text;
  element.originalText = text;
  element.fontSize = fontSize;
  element.fontFamily = 1;
  element.textAlign = align;
  element.verticalAlign = verticalAlign;
  element.containerId = containerId;
  element.autoResize = autoResize;
  element.lineHeight = LINE_HEIGHT;
}

/** A text element bound to a container (shape label or arrow label). */
function boundLabelElement(
  id: string,
  containerId: string,
  x: number,
  y: number,
  label: string,
  fontSize: number,
  options: { color?: string; now: number },
): SceneElement {
  const measured = measureLabel(label, fontSize);
  const element = baseElement(
    id,
    "text",
    x,
    y,
    Math.max(measured.textWidth, 10),
    measured.textHeight,
    { color: options.color, now: options.now },
  );
  textFields(element, label, fontSize, "center", "middle", containerId, false);
  return element;
}

/** Creates (or replaces) the bound label of a container, centered inside it. */
function setContainerLabel(
  scene: ExcalidrawScene,
  index: SceneIndex,
  container: SceneElement,
  label: string,
  fontSize: number,
  options: { color?: string; now: number },
): void {
  const existing = findBoundLabel(scene, container.id);
  if (existing) {
    const measured = measureLabel(label, fontSize);
    existing.text = label;
    existing.originalText = label;
    existing.fontSize = fontSize;
    existing.width = Math.max(measured.textWidth, 10);
    existing.height = measured.textHeight;
    existing.strokeColor = options.color ?? existing.strokeColor;
    if (CONNECTOR_TYPES.has(container.type)) recentreConnectorLabel(existing, container);
    else recentreLabel(existing, container);
    bumpVersion(existing, options.now);
    return;
  }
  const labelId = uniqueId(index.allIds(), `${container.id}-label`);
  const measured = measureLabel(label, fontSize);
  const element = boundLabelElement(
    labelId,
    container.id,
    container.x + (container.width - measured.textWidth) / 2,
    container.y + (container.height - measured.textHeight) / 2,
    label,
    fontSize,
    options,
  );
  appendBoundElement(container, { id: labelId, type: "text" });
  scene.elements.push(element);
  index.add(element);
}

function recentreLabel(label: SceneElement, container: SceneElement): void {
  label.x = container.x + (container.width - label.width) / 2;
  label.y = container.y + (container.height - label.height) / 2;
}

/** Places a connector's bound label at the midpoint of its current span. */
function recentreConnectorLabel(label: SceneElement, connector: SceneElement): void {
  const points = connector.points as Array<[number, number]>;
  const first = points[0] ?? [0, 0];
  const last = points[points.length - 1] ?? [0, 0];
  const midX = connector.x + (first[0] + last[0]) / 2;
  const midY = connector.y + (first[1] + last[1]) / 2;
  label.x = midX - label.width / 2;
  label.y = midY - label.height / 2;
}

// ---------------------------------------------------------------------------
// Adding compact elements
// ---------------------------------------------------------------------------

export interface AddElementsResult {
  added: Array<{ id: string; type: string }>;
}

/**
 * Expands compact element descriptions into full scene elements. Shapes and
 * text are placed first so arrows may reference elements listed after them.
 */
export function addCompactElements(
  scene: ExcalidrawScene,
  inputs: CompactElementInput[],
  now: number,
): AddElementsResult {
  if (inputs.length === 0) return { added: [] };
  // Each compact element expands to at most element + bound label.
  capacityCheck(scene, inputs.length * 2);
  const index = new SceneIndex(scene.elements);
  const cascade = new CascadeCursor(scene.elements);
  const added: Array<{ id: string; type: string }> = [];
  const pendingConnectors: CompactElementInput[] = [];

  for (const input of inputs) {
    if (input.type === "arrow" || input.type === "line") {
      pendingConnectors.push(input);
      continue;
    }

    const fontSize = input.fontSize ?? DEFAULT_FONT_SIZE;
    const label = input.label ?? "";
    if (input.type === "text") {
      if (!label.trim()) {
        throw new Error(`Text element "${input.id ?? "(auto id)"}" needs a non-empty label.`);
      }
      const id = claimId(index, input.id, "text");
      const measured = measureLabel(label, fontSize);
      const position =
        input.x !== undefined && input.y !== undefined ? { x: input.x, y: input.y } : cascade.slot(measured.textHeight);
      const element = baseElement(
        id,
        "text",
        position.x,
        position.y,
        Math.max(measured.textWidth, 10),
        measured.textHeight,
        { color: input.color, now },
      );
      textFields(element, label, fontSize, "left", "top", null, true);
      scene.elements.push(element);
      index.add(element);
      added.push({ id, type: "text" });
      continue;
    }

    const id = claimId(index, input.id, input.type);
    const measured = label ? measureLabel(label, fontSize) : { textWidth: 0, textHeight: 0 };
    const auto = shapeSize(input.type, measured.textWidth, measured.textHeight);
    const width = input.width ?? auto.width;
    const height = input.height ?? auto.height;
    const position =
      input.x !== undefined && input.y !== undefined ? { x: input.x, y: input.y } : cascade.slot(height);
    const shape = baseElement(id, input.type, position.x, position.y, width, height, {
      color: input.color,
      fill: input.fill,
      dashed: input.dashed,
      now,
    });
    if (input.type === "rectangle") shape.roundness = { type: 2 };
    scene.elements.push(shape);
    index.add(shape);
    if (label.trim()) setContainerLabel(scene, index, shape, label, fontSize, { color: input.color, now });
    added.push({ id, type: input.type });
  }

  for (const input of pendingConnectors) {
    const { element, extras } = buildConnector(input, index, now);
    scene.elements.push(element, ...extras);
    index.add(element);
    for (const extra of extras) index.add(extra);
    added.push({ id: element.id, type: element.type });
  }

  return { added };
}

function buildConnector(
  input: CompactElementInput,
  index: SceneIndex,
  now: number,
): { element: SceneElement; extras: SceneElement[] } {
  const isArrow = input.type === "arrow";
  const describe = input.id ?? "(auto id)";
  const resolveEndpoint = (id: string | undefined, what: string): SceneElement | undefined => {
    if (id === undefined) return undefined;
    const element = index.get(id);
    if (!BINDABLE_TYPES.has(element.type)) {
      throw new Error(
        `${what} element "${id}" has type "${element.type}", which cannot be connected; ` +
          `connect arrows to rectangle, ellipse, diamond, or text elements.`,
      );
    }
    return element;
  };

  const fromElement = resolveEndpoint(input.from, "from");
  const toElement = resolveEndpoint(input.to, "to");
  const waypoints = (input.points ?? []).map(asPt);

  let start: Pt;
  let end: Pt;
  if (fromElement && toElement) {
    const fromCenter = elementCenter(fromElement);
    const toCenter = elementCenter(toElement);
    if (fromElement.id === toElement.id) {
      // Self-loop: leave through the top edge and re-enter through the right.
      start = trimToBoxEdge(fromCenter, { x: fromCenter.x, y: fromCenter.y - 1 }, fromElement);
      end = { x: toCenter.x + toElement.width / 2 + ARROW_GAP, y: toCenter.y - toElement.height / 4 };
    } else {
      start = trimToBoxEdge(fromCenter, toCenter, fromElement);
      end = trimToBoxEdge(toCenter, fromCenter, toElement);
    }
  } else if (fromElement) {
    if (waypoints.length === 0) {
      throw new Error(
        `Connector "${describe}" has from="${input.from}" but no to and no points; ` +
          `add a to element or absolute points.`,
      );
    }
    start = trimToBoxEdge(elementCenter(fromElement), waypoints[0], fromElement);
    end = waypoints[waypoints.length - 1];
  } else if (toElement) {
    if (waypoints.length === 0) {
      throw new Error(
        `Connector "${describe}" has to="${input.to}" but no from and no points; ` +
          `add a from element or absolute points.`,
      );
    }
    start = waypoints[0];
    end = trimToBoxEdge(elementCenter(toElement), waypoints[waypoints.length - 1], toElement);
  } else {
    if (waypoints.length < 2) {
      throw new Error(
        `Connector "${describe}" needs from/to element ids or at least two absolute points.`,
      );
    }
    start = waypoints[0];
    end = waypoints[waypoints.length - 1];
  }

  const middles = waypoints.slice(1, Math.max(1, waypoints.length - 1));
  const id = claimId(index, input.id, isArrow ? "arrow" : "line");
  const points: Array<[number, number]> = [
    [0, 0],
    ...middles.map((point) => [point.x - start.x, point.y - start.y] as [number, number]),
    [end.x - start.x, end.y - start.y],
  ];

  const connector = baseElement(id, input.type, start.x, start.y, 0, 0, {
    color: input.color,
    now,
  });
  if (input.dashed) connector.strokeStyle = "dashed";
  connector.points = points;
  connector.lastCommittedPoint = null;
  connector.startBinding = fromElement
    ? { elementId: fromElement.id, focus: 0, gap: ARROW_GAP }
    : null;
  connector.endBinding = toElement ? { elementId: toElement.id, focus: 0, gap: ARROW_GAP } : null;
  connector.startArrowhead = isArrow && input.bidirectional ? "arrow" : null;
  connector.endArrowhead = isArrow ? "arrow" : null;
  if (isArrow) connector.elbowed = false;
  connector.roundness = { type: 2 };
  if (fromElement) appendBoundElement(fromElement, { id, type: input.type });
  if (toElement) appendBoundElement(toElement, { id, type: input.type });

  const extras: SceneElement[] = [];
  const label = input.label?.trim();
  if (label) {
    const labelId = uniqueId(index.allIds(), `${id}-label`);
    const fontSize = input.fontSize ?? Math.max(DEFAULT_FONT_SIZE - 4, 12);
    const measured = measureLabel(label, fontSize);
    const labelElement = boundLabelElement(
      labelId,
      id,
      start.x + (end.x - start.x) / 2 - measured.textWidth / 2,
      start.y + (end.y - start.y) / 2 - measured.textHeight / 2,
      label,
      fontSize,
      { color: input.color, now },
    );
    appendBoundElement(connector, { id: labelId, type: "text" });
    extras.push(labelElement);
  }

  return { element: connector, extras };
}

// ---------------------------------------------------------------------------
// Updating and deleting
// ---------------------------------------------------------------------------

export interface UpdateElementsResult {
  updated: string[];
}

/** Redraws arrows whose bound endpoints moved or resized. */
function recomputeConnectedArrows(scene: ExcalidrawScene, dirty: Set<string>, now: number): void {
  if (dirty.size === 0) return;
  for (const element of scene.elements) {
    if (!CONNECTOR_TYPES.has(element.type)) continue;
    const startBinding = element.startBinding as { elementId?: string } | null;
    const endBinding = element.endBinding as { elementId?: string } | null;
    const startId = startBinding?.elementId;
    const endId = endBinding?.elementId;
    if (!startId || !endId) continue;
    if (!dirty.has(startId) && !dirty.has(endId)) continue;
    const fromElement = scene.elements.find((candidate) => candidate.id === startId);
    const toElement = scene.elements.find((candidate) => candidate.id === endId);
    if (!fromElement || !toElement) continue;

    const fromCenter = elementCenter(fromElement);
    const toCenter = elementCenter(toElement);
    const points = element.points as Array<[number, number]>;
    const middles = points
      .slice(1, Math.max(1, points.length - 1))
      .map((point) => ({ x: element.x + point[0], y: element.y + point[1] }));
    const start =
      fromElement.id === toElement.id
        ? trimToBoxEdge(fromCenter, { x: fromCenter.x, y: fromCenter.y - 1 }, fromElement)
        : trimToBoxEdge(fromCenter, toCenter, fromElement);
    const end =
      fromElement.id === toElement.id
        ? { x: toCenter.x + toElement.width / 2 + ARROW_GAP, y: toCenter.y - toElement.height / 4 }
        : trimToBoxEdge(toCenter, fromCenter, toElement);
    element.x = start.x;
    element.y = start.y;
    element.points = [
      [0, 0],
      ...middles.map((point) => [point.x - start.x, point.y - start.y] as [number, number]),
      [end.x - start.x, end.y - start.y],
    ];
    bumpVersion(element, now);

    const label = findBoundLabel(scene, element.id);
    if (label) recentreConnectorLabel(label, element);
  }
}

export function updateElements(
  scene: ExcalidrawScene,
  updates: ElementUpdate[],
  now: number,
): UpdateElementsResult {
  if (updates.length === 0) return { updated: [] };
  const index = new SceneIndex(scene.elements);
  const dirty = new Set<string>();
  const updated: string[] = [];

  for (const update of updates) {
    const element = index.get(update.id);
    const isConnector = CONNECTOR_TYPES.has(element.type);
    const isBindable = BINDABLE_TYPES.has(element.type);
    if (!isConnector && !isBindable) {
      throw new Error(
        `Element "${update.id}" has type "${element.type}", which update_elements cannot edit.`,
      );
    }
    if (isConnector && (update.x !== undefined || update.y !== undefined || update.width !== undefined || update.height !== undefined)) {
      throw new Error(
        `Element "${update.id}" is a ${element.type}; move or resize the shapes it connects instead.`,
      );
    }

    if (update.label !== undefined) {
      if (element.type === "text") {
        const fontSize = update.fontSize ?? Number(element.fontSize ?? DEFAULT_FONT_SIZE);
        const measured = measureLabel(update.label, fontSize);
        element.text = update.label;
        element.originalText = update.label;
        if (update.fontSize !== undefined) element.fontSize = update.fontSize;
        element.width = Math.max(measured.textWidth, 10);
        element.height = measured.textHeight;
        dirty.add(element.id);
      } else {
        const fontSize = update.fontSize ??
          Number(findBoundLabel(scene, element.id)?.fontSize ?? DEFAULT_FONT_SIZE);
        setContainerLabel(scene, index, element, update.label, fontSize, {
          color: update.color,
          now,
        });
      }
    } else if (update.fontSize !== undefined) {
      const label = findBoundLabel(scene, element.id);
      if (label) {
        label.fontSize = update.fontSize;
        const text = String(label.text ?? "");
        const measured = measureLabel(text, update.fontSize);
        label.width = Math.max(measured.textWidth, 10);
        label.height = measured.textHeight;
        if (element.type !== "text" && !isConnector) recentreLabel(label, element);
        if (isConnector) recentreConnectorLabel(label, element);
      }
    }

    let geometryChanged = false;
    if (update.x !== undefined || update.y !== undefined) {
      const dx = update.x !== undefined ? update.x - element.x : 0;
      const dy = update.y !== undefined ? update.y - element.y : 0;
      element.x += dx;
      element.y += dy;
      const label = findBoundLabel(scene, element.id);
      if (label) {
        label.x += dx;
        label.y += dy;
      }
      geometryChanged = true;
    }

    if (!isConnector && (update.width !== undefined || update.height !== undefined)) {
      if (update.width !== undefined) element.width = update.width;
      if (update.height !== undefined) element.height = update.height;
      const label = findBoundLabel(scene, element.id);
      if (label) recentreLabel(label, element);
      geometryChanged = true;
    }

    if (update.color !== undefined) {
      element.strokeColor = update.color;
      const label = findBoundLabel(scene, element.id);
      if (label) label.strokeColor = update.color;
    }
    if (update.fill !== undefined) element.backgroundColor = update.fill;
    if (update.dashed !== undefined) element.strokeStyle = update.dashed ? "dashed" : "solid";

    bumpVersion(element, now);
    if (geometryChanged && isBindable) dirty.add(element.id);
    updated.push(element.id);
  }

  recomputeConnectedArrows(scene, dirty, now);
  return { updated };
}

export interface DeleteElementsResult {
  deleted: string[];
}

export function deleteElements(
  scene: ExcalidrawScene,
  ids: string[],
  now: number,
): DeleteElementsResult {
  if (ids.length === 0) return { deleted: [] };
  const index = new SceneIndex(scene.elements);
  for (const id of ids) index.get(id); // Fail fast on unknown ids.
  const removed = new Set(ids);

  // A deleted container takes its bound label with it; arrows that pointed at
  // removed shapes are unbound (not deleted), matching restore semantics.
  for (const element of scene.elements) {
    if (
      typeof element.containerId === "string" &&
      removed.has(element.containerId) &&
      element.type === "text"
    ) {
      removed.add(element.id);
    }
  }

  const remaining: SceneElement[] = [];
  for (const element of scene.elements) {
    if (removed.has(element.id)) continue;
    if (Array.isArray(element.boundElements)) {
      const boundElements = (element.boundElements as Array<{ id: string; type: string }>).filter(
        (entry) => !removed.has(entry.id),
      );
      element.boundElements = boundElements.length > 0 ? boundElements : null;
    }
    if (CONNECTOR_TYPES.has(element.type)) {
      const startBinding = element.startBinding as { elementId?: string } | null;
      const endBinding = element.endBinding as { elementId?: string } | null;
      let unbound = false;
      if (startBinding && removed.has(startBinding.elementId ?? "")) {
        element.startBinding = null;
        unbound = true;
      }
      if (endBinding && removed.has(endBinding.elementId ?? "")) {
        element.endBinding = null;
        unbound = true;
      }
      if (unbound) bumpVersion(element, now);
    }
    remaining.push(element);
  }
  scene.elements = remaining;
  return { deleted: [...removed] };
}

// ---------------------------------------------------------------------------
// Digest and operation application
// ---------------------------------------------------------------------------

/** Compact, model-friendly scene summary: no seeds, no styling noise. */
export function digestScene(scene: ExcalidrawScene): SceneDigest {
  const warnings: string[] = [];
  const elements: DigestEntry[] = [];
  const known = new Set(scene.elements.map((element) => element.id));

  for (const element of scene.elements) {
    const isBoundLabel = element.type === "text" && typeof element.containerId === "string";
    if (isBoundLabel) continue; // surfaced as the container's label below

    if (element.type === "text") {
      const entry: DigestEntry = {
        id: element.id,
        type: "text",
        label: String(element.text ?? ""),
        x: element.x,
        y: element.y,
        fontSize: Number(element.fontSize ?? DEFAULT_FONT_SIZE),
      };
      elements.push(entry);
      continue;
    }

    if (CONNECTOR_TYPES.has(element.type)) {
      const startBinding = element.startBinding as { elementId?: string } | null;
      const endBinding = element.endBinding as { elementId?: string } | null;
      const entry: DigestEntry = { id: element.id, type: element.type, x: element.x, y: element.y };
      if (startBinding?.elementId) {
        entry.from = startBinding.elementId;
        if (!known.has(startBinding.elementId)) {
          warnings.push(`"${element.id}" start binding points at missing element "${startBinding.elementId}".`);
        }
      }
      if (endBinding?.elementId) {
        entry.to = endBinding.elementId;
        if (!known.has(endBinding.elementId)) {
          warnings.push(`"${element.id}" end binding points at missing element "${endBinding.elementId}".`);
        }
      }
      const label = findBoundLabel(scene, element.id);
      if (label) entry.label = String(label.text ?? "");
      elements.push(entry);
      continue;
    }

    const entry: DigestEntry = {
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    };
    const label = findBoundLabel(scene, element.id);
    if (label) entry.label = String(label.text ?? "");
    if (!BINDABLE_TYPES.has(element.type)) {
      warnings.push(`Element "${element.id}" has unsupported type "${element.type}"; it is preserved but not editable.`);
    }
    elements.push(entry);
  }

  return { elementCount: elements.length, elements, warnings };
}

export interface AppliedOperations {
  added: Array<{ id: string; type: string }>;
  updated: string[];
  deleted: string[];
}

/** Applies operations in order against a copy; throws before any mutation on error. */
export function applyExcalidrawOperations(
  scene: ExcalidrawScene,
  operations: ExcalidrawOperation[],
  now: number,
): { scene: ExcalidrawScene; applied: AppliedOperations } {
  const working: ExcalidrawScene = {
    elements: scene.elements.map((element) => ({ ...element })),
    appState: scene.appState,
    files: scene.files,
  };
  const applied: AppliedOperations = { added: [], updated: [], deleted: [] };
  for (const operation of operations) {
    if (operation.op === "add_elements") {
      const result = addCompactElements(working, operation.elements, now);
      applied.added.push(...result.added);
    } else if (operation.op === "update_elements") {
      const result = updateElements(working, operation.updates, now);
      applied.updated.push(...result.updated);
    } else {
      const result = deleteElements(working, operation.ids, now);
      applied.deleted.push(...result.deleted);
    }
  }
  return { scene: working, applied };
}
