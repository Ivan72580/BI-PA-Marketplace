import { auth, signOut } from "../lib/auth";

export default async function UserMenu() {
  const session = await auth();

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-white/50 truncate">{session?.user?.name ?? session?.user?.email ?? "Invitado"}</span>
      {session && (
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="text-xs text-white/50 hover:text-white shrink-0">
            Salir
          </button>
        </form>
      )}
    </div>
  );
}
