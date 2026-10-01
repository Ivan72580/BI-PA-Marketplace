import { NextRequest, NextResponse } from "next/server";
import { createTranslator } from "use-intl/core";
import { prisma } from "@/app/lib/db/prisma";
import { requireAdmin } from "@/app/lib/db/users";
import { getOpsReportData, getExecutiveReportData, type ReportCore } from "@/app/lib/db/queries";
import { shiftAnchor, todayISO } from "@/app/lib/period";
import { getResendClient, getReportSenderAddress } from "@/app/lib/email/resend";
import { buildWeeklyReportEmailHtml } from "@/app/lib/email/weeklyReportEmail";
import { isLocale, type Locale } from "@/i18n/config";

// Cron semanal de Internal Ops Report / Executive Summary — dispara los
// lunes (ver vercel.json) para la semana que acaba de cerrar (lunes a
// domingo anterior). Opción "económica y rápida" que eligió Ivan: mail HTML
// con el resumen, sin PDF adjunto (evita reabrir el problema de Chromium en
// Vercel Hobby que ya habíamos descartado para la descarga manual) — quien
// quiera el PDF lo saca desde el link a /reports con "Guardar como PDF".
//
// Dos formas de disparar este endpoint, cada una con su propia
// autorización — nunca se mezclan:
//  1. Vercel Cron (sin ?test): header "Authorization: Bearer $CRON_SECRET",
//     que Vercel agrega solo a sus propias invocaciones. Manda a la
//     audiencia real.
//  2. Prueba manual (?test=alguien@dominio.com): autorizada por la sesión
//     de Admin logueada (requireAdmin), no por el secret — así se puede
//     probar desde el navegador sin esperar al lunes, apuntando a
//     cualquier dirección (no hace falta que tenga cuenta en la app).
//     Manda SOLO a esa dirección, nunca a la audiencia real.
export const dynamic = "force-dynamic";

// "Usuarios que se logueen semanalmente" (pedido de Ivan) se interpreta acá
// como "con actividad en los últimos 14 días", no exactamente 7: una cuenta
// que entra cada 8-10 días no debería prenderse y apagarse sola de una
// corrida a la siguiente. Ajustable sin tocar nada más de este archivo.
const ACTIVE_WINDOW_DAYS = 14;

type Recipient = { id: string; email: string; locale: string; canViewLeadership: boolean };

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function loadMessages(locale: Locale) {
  return (await import(`@/messages/${locale}.json`)).default;
}

async function sendReportEmails(
  kind: "ops" | "executive",
  recipients: Recipient[],
  anchorISO: string,
  baseUrl: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (recipients.length === 0) return { sent: 0, failed: 0, errors: [] };

  const resend = getResendClient();
  const from = getReportSenderAddress();
  let sent = 0;
  let failed = 0;
  // Motivos de fallo (dedupeados): rechazo de Resend — ej. dominio de
  // origen no verificado, destinatario no permitido en el sandbox
  // onboarding@resend.dev — o una excepción de red/credenciales. Antes esto
  // se descartaba en silencio y sólo quedaba el conteo; ahora se loguea
  // siempre (Vercel Runtime Logs / terminal local) y, además, viaja en la
  // respuesta JSON solo cuando es una corrida de prueba (?test=) — nunca en
  // el cron real, por las dudas de que algún día se exponga esa respuesta.
  const errorMessages = new Set<string>();

  // Agrupa por idioma antes de pedir los datos: el texto (insights,
  // sugerencias) sale ya traducido de getOverviewData, y este mail no tiene
  // segmentación por facility/market (siempre toda la red) — dos
  // destinatarios con el mismo idioma ven exactamente los mismos números,
  // así que no tiene sentido recalcularlos por persona.
  const byLocale = new Map<Locale, Recipient[]>();
  for (const r of recipients) {
    const locale: Locale = isLocale(r.locale) ? r.locale : "es";
    byLocale.set(locale, [...(byLocale.get(locale) ?? []), r]);
  }

  for (const [locale, group] of byLocale) {
    const core: ReportCore =
      kind === "executive"
        ? await getExecutiveReportData({}, "week", anchorISO, locale)
        : await getOpsReportData({}, "week", anchorISO, locale);

    const messages = await loadMessages(locale);
    const t = createTranslator({ locale, messages, namespace: "Reports" });
    const scopeLabel = t("scopeNetwork");
    const reportUrl = `${baseUrl}/reports${kind === "executive" ? "?type=executive" : ""}`;
    const html = buildWeeklyReportEmailHtml({ kind, core, t, scopeLabel, reportUrl });
    const subject = `${t(kind === "executive" ? "execTitle" : "opsTitle")} — ${core.periods.current.label}`;

    const results = await Promise.allSettled(
      group.map((r) => resend.emails.send({ from, to: r.email, subject, html }))
    );
    for (const result of results) {
      if (result.status === "fulfilled" && !result.value.error) {
        sent++;
        continue;
      }
      failed++;
      const message =
        result.status === "fulfilled"
          ? (result.value.error?.message ?? JSON.stringify(result.value.error))
          : result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
      console.error(`[weekly-report] fallo enviando (${kind}, ${locale}):`, message);
      errorMessages.add(message);
    }
  }

  return { sent, failed, errors: [...errorMessages].slice(0, 5) };
}

export async function GET(req: NextRequest) {
  const testEmail = req.nextUrl.searchParams.get("test");

  let authorized = false;
  let isTestRun = false;

  if (testEmail) {
    const admin = await requireAdmin();
    if (admin) {
      authorized = true;
      isTestRun = true;
    }
  } else {
    authorized = isAuthorizedCronRequest(req);
  }

  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.APP_URL ?? req.nextUrl.origin;
  // La "semana que acaba de cerrar": un anchor cualquiera dentro de la
  // semana anterior a la de hoy, snapeado a su lunes por resolvePeriod
  // (vía getOpsReportData/getExecutiveReportData) — mismo criterio que
  // "prior" en resolveReportPeriods (app/lib/db/reports.ts).
  const anchorISO = shiftAnchor("week", todayISO(), -1);

  let opsRecipients: Recipient[];
  let execRecipients: Recipient[];

  if (isTestRun && testEmail) {
    const testRecipient: Recipient = { id: "test", email: testEmail, locale: "es", canViewLeadership: true };
    opsRecipients = [testRecipient];
    execRecipients = [testRecipient];
  } else {
    const activeSince = new Date();
    activeSince.setUTCDate(activeSince.getUTCDate() - ACTIVE_WINDOW_DAYS);

    // Cast explícito: mismo motivo que el resto de app/lib/db/*.ts (ver
    // comentario en reports.ts) — este sandbox no tiene un cliente Prisma
    // generado desde el schema actual, así que el tipo inferido para un
    // campo nuevo (receivesWeeklyReport) no es confiable sin esto.
    const users = (await prisma.user.findMany({
      where: { receivesWeeklyReport: true, lastLoginAt: { gte: activeSince } },
      select: { id: true, email: true, locale: true, canViewLeadership: true },
    })) as Recipient[];
    opsRecipients = users;
    execRecipients = users.filter((u) => u.canViewLeadership);
  }

  const [opsResult, execResult] = await Promise.all([
    sendReportEmails("ops", opsRecipients, anchorISO, baseUrl),
    sendReportEmails("executive", execRecipients, anchorISO, baseUrl),
  ]);

  function toResponse(result: { sent: number; failed: number; errors: string[] }) {
    return isTestRun ? result : { sent: result.sent, failed: result.failed };
  }

  return NextResponse.json({
    ok: true,
    period: anchorISO,
    test: isTestRun,
    ops: toResponse(opsResult),
    executive: toResponse(execResult),
  });
}
