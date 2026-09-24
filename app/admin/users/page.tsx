import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "../../lib/db/users";
import { prisma } from "../../lib/db/prisma";
import UserRoleTable from "./UserRoleTable";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  const [users, t] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: { id: true, email: true, name: true, role: true, canViewLeadership: true, lastLoginAt: true },
    }),
    getTranslations("Admin"),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-ink mb-1">{t("usersTitle")}</h1>
      <p className="text-sm text-ink-muted mb-6">{t("usersSubtitle")}</p>
      <UserRoleTable
        users={users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        }))}
        currentUserId={admin.id}
      />
    </div>
  );
}
