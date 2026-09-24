import { getTranslations } from "next-intl/server";
import { signInWithGoogleAction } from "../lib/actions/signInGoogle";
import LoginBackground from "./LoginBackground";
import LoginCard from "./LoginCard";

export default async function LoginPage() {
  const t = await getTranslations("Login");

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-brand-soft to-surface px-6">
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
