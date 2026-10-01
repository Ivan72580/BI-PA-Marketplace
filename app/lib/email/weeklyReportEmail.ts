import type { ReportCore } from "../db/reports";

type Translator = (key: string, values?: Record<string, string | number>) => string;

// Plantilla de mail — deliberadamente más simple que OpsReportDocument/
// ExecutiveReportDocument (sin gráfico de evolución, sin tabla de breakdown
// completa, sin ranking de facilities): los clientes de mail no ejecutan
// Tailwind ni suelen renderizar bien gráficos, y esto es la versión
// "económica y rápida" que Ivan pidió — un resumen con los números y el
// foco de la semana, con un link a /reports para el detalle completo (y de
// ahí, "Guardar como PDF" si lo quiere). Todo con estilos inline y tablas
// (el único layout que todos los clientes de mail soportan de verdad).

function formatNum(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const COLORS = {
  ink: "#0b3b2e",
  inkMuted: "#5c6b65",
  inkFaint: "#94a39d",
  surfaceSunken: "#f3faf7",
  border: "#dceae5",
  brand: "#16755c",
  danger: "#cc3c29",
};

type KpiTile = { label: string; value: string; changeLabel: string | null; invert?: boolean };

function kpiChangeLabel(changePct: number | null, changePts: number | null, invert = false): string | null {
  const raw = changePct !== null ? changePct * 100 : changePts !== null ? changePts * 100 : null;
  if (raw === null) return null;
  const sign = raw >= 0 ? "+" : "";
  const good = invert ? raw <= 0 : raw >= 0;
  const color = good ? COLORS.brand : COLORS.danger;
  const unit = changePct !== null ? "%" : " pts";
  return `<span style="color:${color};font-weight:bold;">${sign}${raw.toFixed(1)}${unit}</span>`;
}

function kpiCell(tile: KpiTile): string {
  return `
    <td style="padding:10px 12px;background:${COLORS.surfaceSunken};border-radius:8px;" valign="top">
      <div style="font-size:11px;color:${COLORS.inkMuted};text-transform:uppercase;letter-spacing:0.03em;margin-bottom:4px;">${tile.label}</div>
      <div style="font-size:18px;font-weight:bold;color:${COLORS.ink};">${tile.value}</div>
      ${tile.changeLabel ? `<div style="font-size:11px;margin-top:2px;">${tile.changeLabel}</div>` : ""}
    </td>`;
}

// Arma filas de a 2 celdas con un spacer de 8px entre columnas — `table`
// clásica porque CSS grid/flex no es confiable en clientes de mail (Outlook
// desktop en particular).
function kpiTable(tiles: KpiTile[]): string {
  const rows: string[] = [];
  for (let i = 0; i < tiles.length; i += 2) {
    const pair = tiles.slice(i, i + 2);
    rows.push(`
      <tr>
        ${pair.map((tile) => kpiCell(tile)).join('<td style="width:8px;"></td>')}
        ${pair.length === 1 ? '<td style="width:8px;"></td><td></td>' : ""}
      </tr>
      <tr><td colspan="3" style="height:8px;"></td></tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
}

function bulletList(items: string[], emptyText: string): string {
  if (items.length === 0) {
    return `<div style="font-size:13px;color:${COLORS.inkFaint};">${emptyText}</div>`;
  }
  return `<ul style="margin:0;padding-left:18px;">${items
    .map((item) => `<li style="font-size:13px;color:${COLORS.ink};margin-bottom:6px;line-height:1.4;">${item}</li>`)
    .join("")}</ul>`;
}

export function buildWeeklyReportEmailHtml({
  kind,
  core,
  t,
  scopeLabel,
  reportUrl,
}: {
  kind: "ops" | "executive";
  core: ReportCore;
  t: Translator;
  scopeLabel: string;
  reportUrl: string;
}): string {
  const { current, kpis, periods } = core;
  const title = t(kind === "executive" ? "execTitle" : "opsTitle");

  const tiles: KpiTile[] =
    kind === "executive"
      ? [
          { label: t("kpi.confirmedGames"), value: formatNum(kpis.confirmedGames.value), changeLabel: kpiChangeLabel(kpis.confirmedGames.changePct, null) },
          { label: t("kpi.totalRevenue"), value: formatUSD(kpis.totalRevenue.value), changeLabel: kpiChangeLabel(kpis.totalRevenue.changePct, null) },
          { label: t("kpi.confirmationRate"), value: formatPct(kpis.confirmationRate.value), changeLabel: kpiChangeLabel(null, kpis.confirmationRate.changePts) },
          { label: t("kpi.avgFillRate"), value: formatPct(kpis.avgFillRate.value), changeLabel: kpiChangeLabel(null, kpis.avgFillRate.changePts) },
        ]
      : [
          { label: t("kpi.confirmedGames"), value: formatNum(kpis.confirmedGames.value), changeLabel: kpiChangeLabel(kpis.confirmedGames.changePct, null) },
          { label: t("kpi.confirmationRate"), value: formatPct(kpis.confirmationRate.value), changeLabel: kpiChangeLabel(null, kpis.confirmationRate.changePts) },
          { label: t("kpi.cancellationRate"), value: formatPct(kpis.cancellationRate.value), changeLabel: kpiChangeLabel(null, kpis.cancellationRate.changePts, true) },
          { label: t("kpi.avgFillRate"), value: formatPct(kpis.avgFillRate.value), changeLabel: kpiChangeLabel(null, kpis.avgFillRate.changePts) },
          { label: t("kpi.totalRevenue"), value: formatUSD(kpis.totalRevenue.value), changeLabel: kpiChangeLabel(kpis.totalRevenue.changePct, null) },
        ];

  const actionItems = core.actions.map((a) => t(a.textKey, a.values));
  // El Ops report tiene "Puntos críticos" (insights ya traducidos, vienen de
  // getOverviewData) además de las sugerencias — el Executive no, mismo
  // criterio que ExecutiveReportDocument (ahí tampoco se repite esa
  // sección, "Markets más destacados" ya cumple ese rol).
  const criticalPointsSection =
    kind === "ops"
      ? `
      <div style="font-size:11px;color:${COLORS.inkMuted};text-transform:uppercase;letter-spacing:0.03em;margin:18px 0 8px;">${t("criticalPoints.title")}</div>
      ${bulletList(current.insights, t("criticalPoints.empty"))}`
      : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${COLORS.surfaceSunken};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.surfaceSunken};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;">
            <tr>
              <td style="background:${COLORS.ink};color:#ffffff;padding:20px 24px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;opacity:0.7;">Plei Marketplace Intelligence</div>
                <div style="font-size:20px;font-weight:bold;margin-top:4px;">${title}</div>
                <div style="font-size:13px;opacity:0.85;margin-top:4px;">${periods.current.label} · ${scopeLabel}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 0;">
                ${kpiTable(tiles)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px;">
                ${criticalPointsSection}
                <div style="font-size:11px;color:${COLORS.inkMuted};text-transform:uppercase;letter-spacing:0.03em;margin:18px 0 8px;">${t("actions.title")}</div>
                ${bulletList(actionItems, t("actions.empty"))}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 24px 24px;">
                <a href="${reportUrl}" style="display:inline-block;background:${COLORS.brand};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:bold;">${t("downloadPdf")}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;border-top:1px solid ${COLORS.border};font-size:11px;color:${COLORS.inkFaint};">
                Plei Marketplace Intelligence — ${title}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
