/**
 * Calcula un multiplicador para ajustar métricas según el período
 * seleccionado (año/mes). Centralizado acá para que todos los
 * "data engines" apliquen el mismo criterio de forma consistente.
 */
export function getPeriodMultiplier(year: string, month: string): number {
  let multiplier = 1;

  if (year === "2024") multiplier *= 0.85;

  if (month === "Jan") multiplier *= 0.9;
  else if (month === "Feb") multiplier *= 1.05;
  else if (month === "Mar") multiplier *= 1.1;
  else if (month === "All") multiplier *= 1.02;

  return multiplier;
}

export function getPeriodLabel(year: string, month: string) {
  if (month === "All") {
    return `${year}`;
  }

  const monthMap: Record<string, string> = {
    Jan: "Jan",
    Feb: "Feb",
    Mar: "Mar",
    Apr: "Apr",
    May: "May",
    Jun: "Jun",
    Jul: "Jul",
    Aug: "Aug",
    Sep: "Sep",
    Oct: "Oct",
    Nov: "Nov",
    Dec: "Dec",
  };

  return `${monthMap[month]} ${year}`;
}

export function getPreviousPeriodLabel(year: string, month: string) {
  if (month === "All") {
    return `${Number(year) - 1}`;
  }

  const months = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec"
  ];

  const index = months.indexOf(month);

  if (index === 0) {
    return `Dec ${Number(year) - 1}`;
  }

  return `${months[index - 1]} ${year}`;
}