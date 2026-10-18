import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "../../lib/db/users";
import { prisma } from "../../lib/db/prisma";
import UserRoleTable from "./UserRoleTable";
import { resolveAccess } from "../../lib/module";
import RefreshDataButton from "./RefreshDataButton";
import PageHeader from "../../components/PageHeader";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  const [users, t] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        moduleAccess: { select: { module: true, level: true } },
        receivesWeeklyReport: true,
        lastLoginAt: true,
      },
    }),
    getTranslations("Admin"),
  ]);

  return (
    <div className="max-w-5xl">
      <PageHeader title={t("usersTitle")} subtitle={t("usersSubtitle")} />
      <RefreshDataButton />
      <UserRoleTable
        users={users.map(({ moduleAccess, ...u }) => ({
          ...u,
          access: resolveAccess(moduleAccess),
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        }))}
        currentUserId={admin.id}
      />
    </div>
  );
}
