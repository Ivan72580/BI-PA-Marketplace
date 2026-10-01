import { Resend } from "resend";

// Un solo cliente por proceso (igual que prisma.ts) — RESEND_API_KEY se
// configura en Vercel (Project Settings → Environment Variables), nunca se
// commitea. No hay fallback "modo demo": si falta la key, el cron de
// reportes semanales debe fallar fuerte en vez de fingir que mandó algo.
let client: Resend | null = null;

export function getResendClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY no está configurada — ver .env.example.");
    }
    client = new Resend(apiKey);
  }
  return client;
}

// Dirección "From" del mail semanal — Resend exige un dominio verificado en
// la cuenta (o el sandbox onboarding@resend.dev, que solo entrega al mismo
// mail con el que se creó la cuenta, útil para la primera prueba pero no
// para producción). Ver .env.example.
export function getReportSenderAddress(): string {
  return process.env.REPORTS_EMAIL_FROM ?? "onboarding@resend.dev";
}
