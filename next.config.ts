import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Setup sin rutas por idioma (no hay app/[locale]/...): next-intl solo se
// usa para resolver mensajes server-side vía i18n/request.ts, sin tocar el
// routing existente ni el middleware de auth.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);