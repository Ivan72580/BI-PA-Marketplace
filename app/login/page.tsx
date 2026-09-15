import { signIn } from "@/app/lib/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-brand-soft to-surface px-6">
      <div className="text-center">
        <div className="font-display text-3xl font-semibold text-ink mb-2">Plei</div>
        <div className="text-sm text-ink-muted">Marketplace Intelligence</div>
      </div>
      <div className="text-sm text-ink-faint max-w-xs text-center">
        Ingresá con tu cuenta de Google Workspace de la empresa para continuar.
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="px-7 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
        >
          Ingresar con Google
        </button>
      </form>
    </div>
  );
}
