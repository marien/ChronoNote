export function formatISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function todayISO(): string {
  return formatISO(new Date());
}

/** Mirrors the date-jump grammar from the reference prototype's date picker. */
export function parseDateQuery(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const base = new Date();

  if (trimmed === "today" || trimmed === "t") return formatISO(base);
  if (trimmed === "yesterday" || trimmed === "y") {
    const d = new Date(base);
    d.setDate(d.getDate() - 1);
    return formatISO(d);
  }
  if (trimmed === "tomorrow") {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return formatISO(d);
  }
  if (/^-\d+$/.test(trimmed)) {
    const offset = parseInt(trimmed, 10);
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    return formatISO(d);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}-\d{2}$/.test(trimmed)) return `${base.getFullYear()}-${trimmed}`;
  return null;
}
