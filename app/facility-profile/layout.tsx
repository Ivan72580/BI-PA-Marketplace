import { gateModule } from "../lib/db/users";

// Perfil de facilities: datos maestros que carga el equipo a mano. Módulo Equipo (ver app/lib/module.ts);
// antes vivía en el Panel Ejecutivo.
export default async function FacilityProfileLayout({ children }: { children: React.ReactNode }) {
  await gateModule("TEAM");
  return <>{children}</>;
}
