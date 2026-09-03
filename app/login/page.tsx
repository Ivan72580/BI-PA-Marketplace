import { signIn } from "@/app/lib/auth";

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "20px",
        backgroundColor: "#f8fafc",
      }}
    >
      <div style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a" }}>
        Plei · Marketplace Intelligence
      </div>
      <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "10px" }}>
        Ingresá con tu cuenta de Google Workspace de la empresa
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          style={{
            padding: "12px 28px",
            borderRadius: "8px",
            background: "#2563eb",
            color: "white",
            border: "none",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Ingresar con Google
        </button>
      </form>
    </div>
  );
}
