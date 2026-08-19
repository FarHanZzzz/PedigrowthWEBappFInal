export function formatAgeMonths(ageMonths: number | null | undefined): string {
  if (typeof ageMonths !== "number" || !Number.isFinite(ageMonths) || ageMonths < 0) {
    return "Age unknown";
  }

  const years = Math.floor(ageMonths / 12);
  const months = Math.round(ageMonths % 12);

  if (years === 0) {
    return `${months} mo`;
  }
  if (months === 0) {
    return `${years} yr`;
  }
  return `${years} yr ${months} mo`;
}

export function monthsFromYearsAndMonths(years: string, months: string): number | null {
  const y = years.trim() === "" ? 0 : Number(years);
  const m = months.trim() === "" ? 0 : Number(months);
  if (!Number.isFinite(y) || !Number.isFinite(m) || y < 0 || m < 0 || m > 11) {
    return null;
  }
  const total = y * 12 + m;
  if (total < 0 || total > 216) {
    return null;
  }
  return total;
}
