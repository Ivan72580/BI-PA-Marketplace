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
          title="Ingresar con Google"
          aria-label="Ingresar con Google"
          className="w-16 h-16 rounded-full bg-brand text-white flex items-center justify-center hover:brightness-90 transition-[filter] shadow-md"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
        </button>
      </form>
    </div>
  );
}
