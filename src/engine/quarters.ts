import type { QuarterKey, QuarterNumber } from '../types/arc';

export function parseQuarter(key: QuarterKey): { year: number; q: QuarterNumber } {
  const match = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!match) {
    return { year: 2027, q: 1 };
  }
  return {
    year: Number(match[1]),
    q: Number(match[2]) as QuarterNumber,
  };
}

export function makeQuarter(year: number, q: QuarterNumber): QuarterKey {
  return `${year}-Q${q}`;
}

export function quarterToIndex(key: QuarterKey): number {
  const { year, q } = parseQuarter(key);
  return year * 4 + (q - 1);
}

export function indexToQuarter(index: number): QuarterKey {
  const year = Math.floor(index / 4);
  const q = (((index % 4) + 4) % 4) + 1;
  return makeQuarter(year, q as QuarterNumber);
}

export function addQuarters(key: QuarterKey, delta: number): QuarterKey {
  return indexToQuarter(quarterToIndex(key) + delta);
}

export function diffQuarters(a: QuarterKey, b: QuarterKey): number {
  return quarterToIndex(a) - quarterToIndex(b);
}

export function generateTimelineQuarters(startYear = 2027, endYear = 2032): QuarterKey[] {
  const out: QuarterKey[] = [];
  for (let year = startYear; year <= endYear; year++) {
    for (let q = 1 as QuarterNumber; q <= 4; q = (q + 1) as QuarterNumber) {
      out.push(makeQuarter(year, q));
    }
  }
  return out;
}

export function formatQuarterShort(key: QuarterKey): string {
  const { year, q } = parseQuarter(key);
  return `Q${q} ${year}`;
}

export function formatQuarterCompact(key: QuarterKey): string {
  const { year, q } = parseQuarter(key);
  return `${String(year).slice(2)}Q${q}`;
}

export function quarterToStartDate(key: QuarterKey): Date {
  const { year, q } = parseQuarter(key);
  const month = (q - 1) * 3; // 0, 3, 6, 9
  return new Date(Date.UTC(year, month, 1));
}

export function quarterToMidDate(key: QuarterKey): Date {
  const { year, q } = parseQuarter(key);
  const month = (q - 1) * 3 + 1;
  return new Date(Date.UTC(year, month, 15));
}

export function quarterToEndDate(key: QuarterKey): Date {
  const { year, q } = parseQuarter(key);
  const month = q * 3;
  return new Date(Date.UTC(year, month, 0));
}

export function parseFlexibleDate(value: string): Date | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  const ymMatch = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (ymMatch) {
    return new Date(Date.UTC(Number(ymMatch[1]), Number(ymMatch[2]) - 1, 1));
  }
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymdMatch) {
    return new Date(Date.UTC(Number(ymdMatch[1]), Number(ymdMatch[2]) - 1, Number(ymdMatch[3])));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addMonthsUtc(date: Date, months: number): Date {
  const totalMonths = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), maxDay)));
}

export function dateToQuarter(date: Date): QuarterKey {
  const year = date.getUTCFullYear();
  const q = (Math.floor(date.getUTCMonth() / 3) + 1) as QuarterNumber;
  return makeQuarter(year, q);
}

/**
 * Returns a fractional position across the timeline [0..1] for a given Date,
 * or null if the date falls outside [startYear-01-01, endYear-12-31].
 */
export function dateToTimelineFraction(
  date: Date,
  startYear = 2027,
  endYear = 2032,
): number | null {
  const startMs = Date.UTC(startYear, 0, 1);
  const endMs = Date.UTC(endYear + 1, 0, 1);
  const t = date.getTime();
  if (t < startMs || t > endMs) return null;
  return (t - startMs) / (endMs - startMs);
}

export function computeEcrCutoffDate(
  phdConferralDate: string,
  careerInterruptionMonths: number,
  ecrYears = 5,
): Date | null {
  const base = parseFlexibleDate(phdConferralDate);
  if (!base) return null;
  const totalMonths = ecrYears * 12 + Math.max(0, Math.round(careerInterruptionMonths || 0));
  return addMonthsUtc(base, totalMonths);
}

export function computePostPhdCutoffDate(
  phdConferralDate: string,
  careerInterruptionMonths: number,
  years: number,
): Date | null {
  return computeEcrCutoffDate(phdConferralDate, careerInterruptionMonths, years);
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
