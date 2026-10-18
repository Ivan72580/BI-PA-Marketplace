import { gateModule } from "../lib/db/users";

// Sección del módulo Equipo (TEAM): sin acceso, gateModule redirige.
// Ver app/lib/module.ts.
export default async function SectionLayout({ children }: { children: React.ReactNode }) {
  await gateModule("TEAM");
  return <>{children}</>;
}
