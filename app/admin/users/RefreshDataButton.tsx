"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { refreshDataNow } from "../../lib/actions/refreshData";

export default function RefreshDataButton() {
  const t = useTranslations("Admin.refreshData");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<boolean | null>(null);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0 flex-1 text-xs text-ink-muted">
        <span className="font-medium text-ink">{t("title")}</span> · {t("hint")}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await refreshDataNow();
            setDone(res.ok);
          })
        }
        className="rounded-md border border-border px-3 py-1 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
      >
        {pending ? t("running") : t("button")}
      </button>
      {done !== null && !pending && (
        <span className={`text-xs ${done ? "text-brand" : "text-danger"}`}>{done ? t("ok") : t("error")}</span>
      )}
    </div>
  );
}
