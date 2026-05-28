import type { EvaluateResult } from "../types.js";

interface PlotOptions {
  title?: string;
  width?: number;
  height?: number;
}

export function plotCalibration(result: EvaluateResult, opts: PlotOptions = {}): string {
  const width = opts.width ?? 600;
  const height = opts.height ?? 600;
  const title = opts.title ?? "Reliability Diagram";

  const margin = { top: 50, right: 30, bottom: 70, left: 70 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const bins = result.calibrationCurve.filter((b) => b.count > 0);
  const maxCount = bins.reduce((m, b) => Math.max(m, b.count), 1);

  function scaleX(v: number) {
    return margin.left + v * plotW;
  }
  function scaleY(v: number) {
    return margin.top + (1 - v) * plotH;
  }

  const gridLines = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((v) => {
    const x1 = scaleX(0);
    const x2 = scaleX(1);
    const y = scaleY(v);
    const label = v.toFixed(1);
    return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>
    <text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b7280">${label}</text>`;
  });

  const xGridLines = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((v) => {
    const x = scaleX(v);
    const y1 = scaleY(0);
    const y2 = scaleY(1);
    const label = v.toFixed(1);
    return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#e5e7eb" stroke-width="1"/>
    <text x="${x}" y="${y1 + 18}" text-anchor="middle" font-size="11" fill="#6b7280">${label}</text>`;
  });

  // Diagonal reference line.
  const diagX1 = scaleX(0);
  const diagY1 = scaleY(0);
  const diagX2 = scaleX(1);
  const diagY2 = scaleY(1);

  // Points for each bin.
  const pointRadius = (count: number) =>
    Math.max(4, Math.min(12, 4 + (count / maxCount) * 8));

  const polylinePoints = bins
    .map((b) => `${scaleX(b.meanConfidence)},${scaleY(b.accuracy)}`)
    .join(" ");

  const circles = bins.map((b) => {
    const cx = scaleX(b.meanConfidence);
    const cy = scaleY(b.accuracy);
    const r = pointRadius(b.count);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#3b82f6" fill-opacity="0.7" stroke="#1d4ed8" stroke-width="1.5">
      <title>Bin ${b.bin}: mean confidence=${b.meanConfidence.toFixed(3)}, accuracy=${b.accuracy.toFixed(3)}, n=${b.count}</title>
    </circle>`;
  });

  const ece = result.metrics.ece;
  const brier =
    result.metrics.brier !== null ? result.metrics.brier.toFixed(4) : "N/A";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="font-family: system-ui, sans-serif; background: #fff;">
  <!-- Title -->
  <text x="${width / 2}" y="28" text-anchor="middle" font-size="16" font-weight="600" fill="#111827">${escapeXml(title)}</text>

  <!-- Grid -->
  ${gridLines.join("")}
  ${xGridLines.join("")}

  <!-- Axes -->
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#374151" stroke-width="1.5"/>
  <line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#374151" stroke-width="1.5"/>

  <!-- Axis labels -->
  <text x="${margin.left + plotW / 2}" y="${height - 8}" text-anchor="middle" font-size="13" fill="#374151">Mean Confidence</text>
  <text x="16" y="${margin.top + plotH / 2}" text-anchor="middle" font-size="13" fill="#374151" transform="rotate(-90, 16, ${margin.top + plotH / 2})">Accuracy</text>

  <!-- Perfect calibration diagonal -->
  <line x1="${diagX1}" y1="${diagY1}" x2="${diagX2}" y2="${diagY2}" stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="6,4"/>

  <!-- Connected line between bin points -->
  ${bins.length > 1 ? `<polyline points="${polylinePoints}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round"/>` : ""}

  <!-- Bin circles -->
  ${circles.join("\n  ")}

  <!-- Stats annotation -->
  <text x="${margin.left + plotW - 5}" y="${margin.top + 20}" text-anchor="end" font-size="11" fill="#6b7280">ECE: ${ece.toFixed(4)}</text>
  <text x="${margin.left + plotW - 5}" y="${margin.top + 36}" text-anchor="end" font-size="11" fill="#6b7280">Brier: ${brier}</text>
  <text x="${margin.left + plotW - 5}" y="${margin.top + 52}" text-anchor="end" font-size="11" fill="#6b7280">n: ${result.metrics.n}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
