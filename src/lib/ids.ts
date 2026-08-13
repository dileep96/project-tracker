/** Generate a stable unique id for records created client-side. */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Current time as epoch milliseconds — stored on every record for sorting and future charting. */
export function now(): number {
  return Date.now();
}
