import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '~/hooks/use-in-view';

type Palette = Readonly<{
  ink: string;
  muted: string;
  rule: string;
  trace: string;
  traceInk: string;
}>;

type TextLine = Readonly<{ y: number; x: number; dots: number }>;

type Sheet = Readonly<{
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  lines: readonly TextLine[];
}>;

type Scene = Readonly<{
  width: number;
  height: number;
  sheets: readonly Sheet[];
  scanTop: number;
  scanBottom: number;
  laneTop: number;
  answer: Readonly<{ x: number; y: number; w: number; h: number }>;
  answerLines: readonly TextLine[];
}>;

type Citation = Readonly<{ sheet: number; line: number }>;

const PITCH = 5;
const DOT = 1.6;
const LINE_GAP = 9;
const PAD = 20;
const LABEL = 22;
const ANSWER_HEIGHT = 92;
const LANE_SPACE = 52;
const LENS_RADIUS = 72;

const SCAN_MS = 1800;
const TRACE_START_MS = 1500;
const TRACE_MS = 900;
const TRACE_STAGGER_MS = 160;
const ANSWER_START_MS = 2300;
const ANSWER_MS = 900;
const HOLD_END_MS = 6600;
const FADE_MS = 600;
const CYCLE_MS = 7300;

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (value: number) => 1 - Math.pow(1 - value, 4);
const easeInOut = (value: number) =>
  value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;

function sheetLines(
  x: number,
  y: number,
  w: number,
  h: number,
  random: () => number,
) {
  const lines: TextLine[] = [];
  const left = x + 18;
  const capacity = Math.floor((w - 28) / PITCH);
  let paragraphLeft = 3 + Math.floor(random() * 4);
  for (let lineY = y + 16; lineY < y + h - 12; lineY += LINE_GAP) {
    if (paragraphLeft === 0) {
      paragraphLeft = 3 + Math.floor(random() * 4);
      continue;
    }
    paragraphLeft -= 1;
    const share =
      paragraphLeft === 0 ? 0.35 + random() * 0.3 : 0.78 + random() * 0.22;
    lines.push({
      y: lineY,
      x: left,
      dots: Math.max(4, Math.floor(capacity * share)),
    });
  }
  return lines;
}

function buildScene(
  width: number,
  height: number,
  documents: readonly string[],
): Scene {
  const count = width < 520 ? 3 : 4;
  const gap = 14;
  const sheetWidth = (width - PAD * 2 - gap * (count - 1)) / count;
  const answerY = height - PAD - ANSWER_HEIGHT;
  const sheetTop = PAD + LABEL;
  const sheetHeight = answerY - LANE_SPACE - sheetTop;
  const random = seeded(7);
  const sheets = Array.from({ length: count }, (_, index) => {
    const x = PAD + index * (sheetWidth + gap);
    return {
      x,
      y: sheetTop,
      w: sheetWidth,
      h: sheetHeight,
      name: documents[index % documents.length] ?? '',
      lines: sheetLines(x, sheetTop, sheetWidth, sheetHeight, random),
    };
  });
  const answer = { x: PAD, y: answerY, w: width - PAD * 2, h: ANSWER_HEIGHT };
  const answerCapacity = Math.floor((answer.w - 140) / PITCH);
  const answerLines = [0.6, 0.92, 0.48].map((share, index) => ({
    x: answer.x + 16,
    y: answer.y + 34 + index * 14,
    dots: Math.floor(answerCapacity * share),
  }));
  return {
    width,
    height,
    sheets,
    scanTop: sheetTop,
    scanBottom: sheetTop + sheetHeight,
    laneTop: sheetTop + sheetHeight + 12,
    answer,
    answerLines,
  };
}

function citationsFor(scene: Scene, cycle: number): readonly Citation[] {
  const random = seeded(101 + cycle * 31);
  const count = scene.sheets.length;
  const first = cycle % count;
  const second = (first + 1 + Math.floor(random() * (count - 1))) % count;
  return [first, second]
    .sort((a, b) => a - b)
    .map((sheet) => {
      const lines = scene.sheets[sheet]?.lines ?? [];
      const usable = Math.max(1, Math.floor(lines.length * 0.75) - 1);
      return { sheet, line: Math.floor(random() * usable) };
    });
}

function readPalette(element: Element): Palette {
  const style = getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    ink: read('--foreground'),
    muted: read('--muted-foreground'),
    rule: read('--border'),
    trace: read('--brand'),
    traceInk: read('--brand-foreground'),
  };
}

function dotRun(
  context: CanvasRenderingContext2D,
  line: TextLine,
  dots = line.dots,
) {
  for (let index = 0; index < dots; index += 1) {
    context.fillRect(line.x + index * PITCH, line.y, DOT, DOT);
  }
}

function markerOrigin(scene: Scene, index: number) {
  const line = scene.answerLines[index];
  if (!line) return { x: 0, y: 0 };
  return { x: line.x + line.dots * PITCH + 10, y: line.y - 5 };
}

function tracePoints(scene: Scene, citation: Citation, index: number) {
  const sheet = scene.sheets[citation.sheet];
  const line = sheet?.lines[citation.line];
  if (!sheet || !line) return [];
  const startX = sheet.x + 8;
  const laneY = scene.laneTop + (1 - index) * 14;
  const marker = markerOrigin(scene, index);
  const markerX = marker.x + 6.5;
  return [
    { x: startX, y: line.y + 6 },
    { x: startX, y: laneY },
    { x: markerX, y: laneY },
    { x: markerX, y: marker.y },
  ];
}

function strokePartial(
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  progress: number,
) {
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index];
    return previous
      ? Math.hypot(point.x - previous.x, point.y - previous.y)
      : 0;
  });
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress;
  const first = points[0];
  if (!first) return;
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let index = 1; index < points.length && remaining > 0; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = lengths[index - 1] ?? 0;
    if (!from || !to) break;
    const share = Math.min(1, remaining / (length || 1));
    context.lineTo(
      from.x + (to.x - from.x) * share,
      from.y + (to.y - from.y) * share,
    );
    remaining -= length;
  }
  context.stroke();
}

function fitLabel(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
) {
  if (context.measureText(text).width <= width) return text;
  let end = text.length;
  while (
    end > 1 &&
    context.measureText(`${text.slice(0, end)}…`).width > width
  ) {
    end -= 1;
  }
  return `${text.slice(0, end)}…`;
}

function drawBadge(
  context: CanvasRenderingContext2D,
  palette: Palette,
  x: number,
  y: number,
  label: string,
) {
  context.fillStyle = palette.trace;
  context.fillRect(x, y, 13, 13);
  context.fillStyle = palette.traceInk;
  context.font = '600 9px "Geist Mono Variable", ui-monospace, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, x + 6.5, y + 7);
  context.textAlign = 'start';
  context.textBaseline = 'alphabetic';
}

function drawFrame(
  context: CanvasRenderingContext2D,
  scene: Scene,
  palette: Palette,
  labels: Readonly<{ answer: string; grounded: string }>,
  elapsed: number,
  cycle: number,
  pointer: Readonly<{ x: number; y: number }> | null,
) {
  context.clearRect(0, 0, scene.width, scene.height);
  const citations = citationsFor(scene, cycle);
  const scanProgress = easeInOut(clamp01(elapsed / SCAN_MS));
  const scanY =
    scene.scanTop + (scene.scanBottom - scene.scanTop) * scanProgress;
  const fade =
    elapsed > HOLD_END_MS ? 1 - clamp01((elapsed - HOLD_END_MS) / FADE_MS) : 1;

  context.lineWidth = 1;
  context.font = '500 10px "Geist Mono Variable", ui-monospace, monospace';
  for (const sheet of scene.sheets) {
    context.strokeStyle = palette.rule;
    context.strokeRect(sheet.x + 0.5, sheet.y + 0.5, sheet.w - 1, sheet.h - 1);
    context.fillStyle = palette.muted;
    context.fillText(
      fitLabel(context, sheet.name, sheet.w - 4),
      sheet.x,
      sheet.y - 8,
    );

    for (const line of sheet.lines) {
      context.fillStyle = palette.ink;
      context.globalAlpha = 0.2;
      dotRun(context, line);
    }
  }

  if (pointer) {
    context.fillStyle = palette.ink;
    for (const sheet of scene.sheets) {
      for (const line of sheet.lines) {
        if (Math.abs(line.y - pointer.y) > LENS_RADIUS) continue;
        for (let index = 0; index < line.dots; index += 1) {
          const x = line.x + index * PITCH;
          const distance = Math.hypot(x - pointer.x, line.y - pointer.y);
          if (distance > LENS_RADIUS) continue;
          context.globalAlpha = 0.75 * Math.pow(1 - distance / LENS_RADIUS, 2);
          context.fillRect(x, line.y, DOT, DOT);
        }
      }
    }
  }

  citations.forEach((citation, index) => {
    const sheet = scene.sheets[citation.sheet];
    const firstLine = sheet?.lines[citation.line];
    if (!sheet || !firstLine) return;
    const lit = clamp01((scanY - firstLine.y) / 24) * fade;
    if (lit <= 0) return;
    context.globalAlpha = lit;
    context.fillStyle = palette.trace;
    for (const line of sheet.lines.slice(citation.line, citation.line + 2)) {
      context.globalAlpha = lit * 0.16;
      context.fillRect(line.x - 3, line.y - 3, line.dots * PITCH + 4, 7.6);
      context.globalAlpha = lit;
      dotRun(context, line);
    }
    drawBadge(
      context,
      palette,
      sheet.x + 1.5,
      firstLine.y - 2,
      String(index + 1),
    );
  });

  if (elapsed < SCAN_MS) {
    const left = scene.sheets[0]?.x ?? PAD;
    const right = scene.width - PAD;
    const band = context.createLinearGradient(0, scanY - 28, 0, scanY);
    band.addColorStop(0, 'transparent');
    band.addColorStop(1, palette.trace);
    context.globalAlpha = 0.12;
    context.fillStyle = band;
    context.fillRect(left, scanY - 28, right - left, 28);
    context.globalAlpha = 0.9;
    context.fillStyle = palette.trace;
    context.fillRect(left, scanY, right - left, 1);
  }

  context.strokeStyle = palette.trace;
  context.lineWidth = 1;
  citations.forEach((citation, index) => {
    const progress = easeOut(
      clamp01((elapsed - TRACE_START_MS - index * TRACE_STAGGER_MS) / TRACE_MS),
    );
    if (progress <= 0) return;
    context.globalAlpha = fade;
    strokePartial(context, tracePoints(scene, citation, index), progress);
  });

  const { answer } = scene;
  context.globalAlpha = 1;
  context.strokeStyle = palette.rule;
  context.strokeRect(
    answer.x + 0.5,
    answer.y + 0.5,
    answer.w - 1,
    answer.h - 1,
  );
  context.fillStyle = palette.ink;
  context.font = '600 10px "Geist Mono Variable", ui-monospace, monospace';
  context.fillText(labels.answer.toUpperCase(), answer.x + 16, answer.y + 20);
  const answerProgress =
    clamp01((elapsed - ANSWER_START_MS) / ANSWER_MS) * fade;
  if (answerProgress > 0 && scene.width >= 520) {
    context.fillStyle = palette.muted;
    context.font = '500 10px "Geist Mono Variable", ui-monospace, monospace';
    context.globalAlpha = answerProgress;
    const grounded = labels.grounded;
    context.fillText(
      grounded,
      answer.x + answer.w - 16 - context.measureText(grounded).width,
      answer.y + 20,
    );
  }

  const totalDots = scene.answerLines.reduce((sum, line) => sum + line.dots, 0);
  let shown = Math.floor(totalDots * answerProgress);
  context.fillStyle = palette.ink;
  context.globalAlpha = 0.8 * (answerProgress > 0 ? 1 : 0);
  for (const line of scene.answerLines) {
    const visible = Math.min(line.dots, shown);
    if (visible > 0) dotRun(context, line, visible);
    shown -= visible;
  }
  citations.forEach((_, index) => {
    const landed = clamp01(
      (elapsed - TRACE_START_MS - index * TRACE_STAGGER_MS - TRACE_MS * 0.8) /
        200,
    );
    if (landed <= 0) return;
    context.globalAlpha = landed * fade;
    const marker = markerOrigin(scene, index);
    drawBadge(context, palette, marker.x, marker.y, String(index + 1));
  });
  context.globalAlpha = 1;
}

export function DocumentField({
  documents,
  answerLabel,
  groundedLabel,
  className,
}: Readonly<{
  documents: readonly string[];
  answerLabel: string;
  groundedLabel: string;
  className?: string;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const labels = { answer: answerLabel, grounded: groundedLabel };
    let palette = readPalette(canvas);
    let scene = buildScene(1, 1, documents);
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    let visible = true;
    const startedAt = performance.now();

    const render = (now: number) => {
      const elapsed = reducedMotion
        ? HOLD_END_MS - 1
        : (now - startedAt) % CYCLE_MS;
      const cycle = reducedMotion
        ? 0
        : Math.floor((now - startedAt) / CYCLE_MS);
      drawFrame(context, scene, palette, labels, elapsed, cycle, pointer);
    };

    const loop = (now: number) => {
      render(now);
      frame = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };

    const start = () => {
      if (reducedMotion) {
        render(performance.now());
        return;
      }
      if (!frame) frame = requestAnimationFrame(loop);
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(bounds.width * ratio);
      canvas.height = Math.round(bounds.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      scene = buildScene(bounds.width, bounds.height, documents);
      render(performance.now());
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      if (reducedMotion) render(performance.now());
    };
    const onPointerLeave = () => {
      pointer = null;
      if (reducedMotion) render(performance.now());
    };
    const onVisibility = () => start();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const viewObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
    });
    viewObserver.observe(canvas);
    const themeObserver = new MutationObserver(() => {
      palette = readPalette(canvas);
      render(performance.now());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    void document.fonts?.ready.then(() => render(performance.now()));

    resize();
    start();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      viewObserver.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [documents, answerLabel, groundedLabel, reducedMotion]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
