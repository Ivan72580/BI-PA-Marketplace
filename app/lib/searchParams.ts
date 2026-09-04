export type SP = {
  regionId?: string;
  marketId?: string;
  facilityId?: string;
  granularity?: string;
  period?: string;
  compare?: string;
  heatmapMetric?: string;
  facilitySort?: string;
  facilitySortDir?: string;
  customFrom?: string;
  customTo?: string;
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
