import { redirect } from "next/navigation";
import { requireLeadershipAccess } from "../lib/db/users";
import PanelEjecutivoNav from "../components/PanelEjecutivoNav";

// Único punto donde se valida el acceso a todo el cluster /panel-ejecutivo
// (antes cada página lo repetía por separado: page.tsx, facilities/page.tsx,
// facilities/[facilityId]/page.tsx y satisfaction/page.tsx). layout.tsx de
// Next.js corre en cada request a cualquier ruta anidada debajo de esta, así
// que alcanza con chequearlo una sola vez aquí — mismo criterio que ya usa
// RootLayout con la sesión de NextAuth.
export default async function PanelEjecutivoLayout({ children }: { children: React.ReactNode }) {
  const access = await requireLeadershipAccess();
  if (!access) redirect("/");

  return (
    <div>
      {/* print:hidden — igual criterio que el TopNav global en AppChrome.tsx:
          /panel-ejecutivo/reports imprime su propio contenido vía
          window.print(), este nav de pestañas no pertenece al PDF. */}
      <div className="print:hidden">
        <PanelEjecutivoNav />
      </div>
      <div className="mt-5 print:mt-0">{children}</div>
    </div>
  );
}
