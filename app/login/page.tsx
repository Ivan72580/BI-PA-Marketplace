import { getTranslations } from "next-intl/server";
import { signInWithGoogleAction } from "../lib/actions/signInGoogle";
import LoginBackground from "./LoginBackground";
import LoginCard from "./LoginCard";
import ForceLightTheme from "../components/ForceLightTheme";

export default async function LoginPage() {
  const t = await getTranslations("Login");

  return (
    // Login: siempre en claro (sin sesión todavía; diseño pensado para claro).
    <div data-theme="light" className="min-h-screen relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-brand-soft to-surface px-6">
      <ForceLightTheme />
      <LoginBackground />
      <LoginCard
        subtitle={t("subtitle")}
        description={t("description")}
        signInLabel={t("signInButton")}
        signInAction={signInWithGoogleAction}
      />
    </div>
  );
}
