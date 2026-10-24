import { get } from "svelte/store";
import { locale, t } from "./i18n";
import { longDate, parseISODateLocal } from "./date";

/** Tooltip text for a due date pill, shared by the editor and read-only renderings. */
export function dueTooltip(date: string, status: "overdue" | "today" | "later", today: string): string {
  const translate = get(t);
  let detail = longDate(get(locale), date);
  if (status === "overdue") {
    const days = Math.max(1, Math.round((parseISODateLocal(today).getTime() - parseISODateLocal(date).getTime()) / 86400000));
    detail += `, ${translate("dueDate.pill.daysLate", { count: days })}`;
  } else if (status === "today") {
    detail += `, ${translate("dueDate.pill.dueToday", undefined)}`;
  }
  return detail;
}
