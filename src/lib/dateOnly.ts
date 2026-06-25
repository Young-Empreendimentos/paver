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

export function todayDateOnly(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}