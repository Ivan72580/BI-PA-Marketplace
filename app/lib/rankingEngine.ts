export function rankEntities(
  data: any[],
  metric: string,
  order: "asc" | "desc" = "desc",
  limit: number = 5
) {

  const sorted = [...data].sort((a, b) => {

    if (order === "desc") {
      return b[metric] - a[metric];
    }

    return a[metric] - b[metric];

  });

  return sorted.slice(0, limit).map((item) => ({
    label: item.name,
    value: item[metric]
  }));

}