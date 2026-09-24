"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";

// El layout raíz envuelve TODO, incluida /login, con el TopNav de la app —
// pero /login la ve gente que todavía no inició sesión, así que no tiene
// sentido mostrarle navegación a páginas que de todos modos no puede abrir.
// Se resuelve acá (client, por pathname) y no en middleware.ts a propósito:
// ese archivo es el que gatea el acceso real, y no queremos mezclar una
// decisión puramente visual con la lógica de auth.
export default function AppChrome({
  topNav,
  children,
}: {
  topNav: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {topNav}
      <main
        className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8"
        style={{ background: "linear-gradient(160deg, #f5fffa 0%, #eff9f4 100%)" }}
      >
        {children}
      </main>
    </div>
  );
}
