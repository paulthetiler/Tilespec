/*
 * Money in the application, decimal-safe. The database works out every total (PostgreSQL numeric).
 * The application only reads amounts typed by a person and shows amounts the database returns:
 *   - parsePounds turns "£12,345.6" into pence (an integer) and back into a decimal number whose
 *     JSON form is exactly the typed value, so the database receives exactly what was typed;
 *   - addPence adds integers, for the few running totals shown on screen before saving;
 *   - formatPounds only formats.
 * Nothing here multiplies or adds floating-point pounds.
 */
import { ValidationError } from "./validation";

const MAX_PENCE = 100_000_000_000; // £1,000,000,000.00

/** Whole pence from a typed amount. Allows "£", commas and up to two decimal places. */
export function toPence(raw: unknown, label: string, options: { allowNegative?: boolean; max?: number } = {}): number {
  const value = typeof raw === "string" ? raw.trim().replace(/^£/, "").replace(/,/g, "").replace(/^(-)£/, "$1") : "";
  const match = /^(-)?(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match || (match[1] && !options.allowNegative)) throw new ValidationError(`Enter ${label} in pounds and pence.`);
  const pence = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  const limit = Math.round((options.max ?? MAX_PENCE / 100) * 100);
  if (pence > limit) throw new ValidationError(`Enter ${label} up to ${formatPounds(limit / 100)}.`);
  return match[1] ? -pence : pence;
}
/** The amount as a decimal number for the database. Pence / 100 is the nearest double to the exact
 *  two-place value, and its shortest JSON form is that value, so nothing is lost on the way. */
export const fromPence = (pence: number) => {
  if (!Number.isSafeInteger(pence)) throw new ValidationError("That amount is too large.");
  return pence / 100;
};
export const parsePounds = (raw: unknown, label: string, options: { allowNegative?: boolean; max?: number } = {}) => fromPence(toPence(raw, label, options));
export function optionalPounds(form: FormData, key: string, label: string, options: { allowNegative?: boolean; max?: number } = {}) {
  const raw = form.get(key);
  if (raw === null || (typeof raw === "string" && !raw.trim())) return null;
  return parsePounds(raw, label, options);
}
/** Whole pence from an amount the database returned (a JSON number or numeric string). */
export function penceOf(value: number | string): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Not an amount: ${value}`);
  const pence = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -pence : pence;
}
export const addPence = (...values: (number | string)[]) => values.reduce<number>((total, value) => total + penceOf(value), 0);

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** £12,345.67, or −£12,345.67 for a negative amount. */
export function formatPounds(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const pence = penceOf(value);
  const text = gbp.format(Math.abs(pence) / 100);
  return pence < 0 ? `−${text}` : text;
}
/** A percentage as typed in the terms: 0 to 100 with up to three decimal places. */
export function parsePercent(raw: unknown, label: string) {
  const value = typeof raw === "string" ? raw.trim().replace(/%$/, "") : "";
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(value) || Number(value) > 100) throw new ValidationError(`Enter ${label} as a percentage from 0 to 100.`);
  return Number(value);
}
export function formatPercent(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return `${Number(value).toLocaleString("en-GB", { maximumFractionDigits: 3 })}%`;
}
