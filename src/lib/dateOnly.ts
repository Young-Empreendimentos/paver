export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateOnlyPtBr(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
): string {
  return new Intl.DateTimeFormat('pt-BR', {
    ...options,
    timeZone: 'UTC',
  }).format(parseDateOnly(dateStr));
}

// Always returns "today" in America/Sao_Paulo, ignoring the device timezone.
// Prevents incorrect defaults when a user's device has a wrong/unexpected timezone.
export function todayDateOnly(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  // en-CA outputs YYYY-MM-DD
  return parts;
}