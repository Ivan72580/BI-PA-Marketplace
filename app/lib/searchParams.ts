export type SP = {
  regionId?: string;
  marketId?: string;
  facilityId?: string;
  granularity?: string;
  period?: string;
  compare?: string;
  facilitySort?: string;
  facilitySortDir?: string;
  customFrom?: string;
  customTo?: string;
  // CancellationCategory elegida desde "Cancellation reasons" en Overview —
  // ver CancellationReasonRanking.tsx. Solo tiene efecto cuando no hay
  // facilityId (ambos comparten la misma vista principal de "/").
  cancellationReason?: string;
};

export function buildQuery(current: SP, overrides: Partial<SP>): string {
  const merged: SP = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}
