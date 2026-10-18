import { gateModule } from "../lib/db/users";

// Sección del módulo Operativo (MAGIC): sin acceso, gateModule redirige.
// Ver app/lib/module.ts.
export default async function SectionLayout({ children }: { children: React.ReactNode }) {
  await gateModule("MAGIC");
  return <>{children}</>;
}
