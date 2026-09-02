import { auth, signOut } from "../lib/auth";

export default async function Header() {
  const session = await auth();

  return (
    <div className="h-16 border-b border-border bg-surface px-8 flex items-center justify-between">
      <div className="font-display text-base font-medium text-ink">Dashboard</div>

      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <span>{session?.user?.name ?? session?.user?.email ?? "Invitado"}</span>
        {session && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-brand hover:underline text-sm">
              Salir
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
