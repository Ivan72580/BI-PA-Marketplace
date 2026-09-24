"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import { updateUserRole, updateLeadershipAccess } from "../../lib/actions/adminUsers";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  canViewLeadership: boolean;
  lastLoginAt: string | null;
};

type Feedback = { type: "ok" | "error"; text: string };

// Checkbox de leadership: a diferencia del select de rol (que junta varios
// cambios y los guarda con un botón), este guarda apenas se togglea — es un
// solo booleano por fila, sin necesidad de un paso de "confirmar" separado.
function LeadershipCheckbox({ userId, initialValue }: { userId: string; initialValue: boolean }) {
  const t = useTranslations("Admin");
  const [checked, setChecked] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: boolean) {
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const result = await updateLeadershipAccess(userId, next);
      if (!result.ok) {
        setChecked(!next);
        setError(t(`errors.${result.errorKey}`));
      }
    });
  }

  return (
    <div>
      <input
        type="checkbox"
        checked={checked}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.checked)}
        aria-label={t("table.leadership")}
        className="w-4 h-4 rounded border-border text-brand cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {error && <div className="text-[11px] text-red-600 mt-1">{error}</div>}
    </div>
  );
}

const selectClass =
  "rounded-md border border-border bg-surface/60 px-2 py-0.5 text-xs text-ink cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand/30 hover:border-border-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export default function UserRoleTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const t = useTranslations("Admin");

  // "selected" es lo que el select muestra; "saved" es lo último confirmado
  // por el server — la diferencia entre ambos es lo que habilita el botón
  // de guardar y lo que se revierte si el guardado falla.
  const [selected, setSelected] = useState<Record<string, Role>>(() =>
    Object.fromEntries(users.map((u) => [u.id, u.role]))
  );
  const [saved, setSaved] = useState<Record<string, Role>>(() =>
    Object.fromEntries(users.map((u) => [u.id, u.role]))
  );
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleSave(id: string) {
    const role = selected[id];
    setPendingId(id);
    setFeedback((prev) => ({ ...prev, [id]: { type: "ok", text: "" } }));
    startTransition(async () => {
      const result = await updateUserRole(id, role);
      if (result.ok) {
        setSaved((prev) => ({ ...prev, [id]: role }));
        setFeedback((prev) => ({ ...prev, [id]: { type: "ok", text: t("saved") } }));
      } else {
        // Revierte el select al último valor confirmado por el server.
        setSelected((prev) => ({ ...prev, [id]: saved[id] }));
        setFeedback((prev) => ({ ...prev, [id]: { type: "error", text: t(`errors.${result.errorKey}`) } }));
      }
      setPendingId(null);
    });
  }

  return (
    <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
      <thead className="bg-surface/60 text-ink-faint text-[10px] uppercase tracking-wide">
        <tr>
          <th className="text-left px-3 py-2 font-medium">{t("table.user")}</th>
          <th className="text-left px-3 py-2 font-medium">{t("table.email")}</th>
          <th className="text-left px-3 py-2 font-medium">{t("table.role")}</th>
          <th className="text-left px-3 py-2 font-medium">{t("table.leadership")}</th>
          <th className="text-left px-3 py-2 font-medium">{t("table.lastLogin")}</th>
          <th className="px-3 py-2" />
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const role = selected[user.id];
          const dirty = role !== saved[user.id];
          const isSaving = pendingId === user.id;
          const rowFeedback = feedback[user.id];

          return (
            <tr key={user.id} className="border-t border-border/70">
              <td className="px-3 py-2 text-ink">
                {user.name ?? user.email}
                {user.id === currentUserId && <span className="text-ink-faint ml-1">{t("you")}</span>}
              </td>
              <td className="px-3 py-2 text-ink-muted">{user.email}</td>
              <td className="px-3 py-2">
                <select
                  value={role}
                  disabled={isSaving}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [user.id]: e.target.value as Role }))
                  }
                  className={selectClass}
                >
                  <option value="ADMIN">{t("role.ADMIN")}</option>
                  <option value="MEMBER">{t("role.MEMBER")}</option>
                </select>
              </td>
              <td className="px-3 py-2">
                <LeadershipCheckbox userId={user.id} initialValue={user.canViewLeadership} />
              </td>
              <td className="px-3 py-2 text-ink-muted">
                {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : t("table.never")}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {dirty && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleSave(user.id)}
                    className="text-xs text-brand hover:underline disabled:opacity-50"
                  >
                    {isSaving ? t("saving") : t("save")}
                  </button>
                )}
                {rowFeedback?.text && (
                  <div
                    className={
                      rowFeedback.type === "error"
                        ? "text-[11px] text-red-600 mt-1"
                        : "text-[11px] text-ink-faint mt-1"
                    }
                  >
                    {rowFeedback.text}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
