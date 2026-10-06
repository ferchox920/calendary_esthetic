import { BadRequestException } from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';

export function instant(value: string): Date {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    throw new BadRequestException('Fecha ISO 8601 con segundos y zona obligatoria');
  }
  try {
    if (value.startsWith('0000-')) throw new Error('PostgreSQL has no year zero');
    const parsed = Temporal.Instant.from(value);
    if (value.slice(17, 19) === '60') throw new Error('Leap seconds unsupported');
    return new Date(parsed.epochMilliseconds);
  } catch {
    throw new BadRequestException('Fecha inválida');
  }
}

export function timezone(value: string): string {
  try {
    if (typeof value !== 'string' || /^[+-]/.test(value)) throw new Error('IANA zone required');
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    Temporal.Now.zonedDateTimeISO(value);
    return value;
  } catch {
    throw new BadRequestException('Zona IANA inválida');
  }
}

export function localDate(value: string): Temporal.PlainDate {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date required');
    return Temporal.PlainDate.from(value, { overflow: 'reject' });
  } catch {
    throw new BadRequestException('Día local inválido');
  }
}

export function zoned(value: Date, zone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(value.getTime()).toZonedDateTimeISO(zone);
}

export function dayRange(day: string, zone: string): { from: Date; to: Date } {
  const date = localDate(day);
  // PlainDate.toZonedDateTime selects the actual start of each local day, including DST.
  return {
    from: new Date(date.toZonedDateTime(zone).epochMilliseconds),
    to: new Date(date.add({ days: 1 }).toZonedDateTime(zone).epochMilliseconds),
  };
}

export function interval(start: string, end: string) {
  const startAt = instant(start),
    endAt = instant(end);
  if (endAt <= startAt) throw new BadRequestException('El fin debe ser posterior al inicio');
  return { startAt, endAt };
}

export function readRange(from: string, to: string) {
  const values = interval(from, to);
  if (values.endAt.getTime() - values.startAt.getTime() > 93 * 86400000) {
    throw new BadRequestException('Consulta como máximo 93 días');
  }
  return values;
}

export function withinWindow(entry: any, settings: any, windows: any[]): boolean {
  const start = zoned(new Date(entry.occupiedStartAt), settings.timezone);
  const end = zoned(new Date(entry.occupiedEndAt), settings.timezone);
  if (!start.toPlainDate().equals(end.toPlainDate())) return false;
  const day = start.toPlainDate().toString();
  const startTime = start.toPlainTime();
  const endTime = end.toPlainTime();
  return windows.some(
    (w) =>
      w.weekday === start.dayOfWeek &&
      w.validFrom <= day &&
      (!w.validTo || day <= w.validTo) &&
      Temporal.PlainTime.compare(startTime, Temporal.PlainTime.from(w.localStart)) >= 0 &&
      Temporal.PlainTime.compare(endTime, Temporal.PlainTime.from(w.localEnd)) <= 0
  );
}

export function validateWindows(windows: any[]) {
  for (const w of windows) {
    localDate(w.validFrom);
    if (w.validTo) localDate(w.validTo);
    if (w.localEnd <= w.localStart || (w.validTo && w.validTo < w.validFrom)) {
      throw new BadRequestException('Ventana laboral inválida');
    }
  }
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i],
        b = windows[j];
      if (
        a.weekday === b.weekday &&
        a.localStart < b.localEnd &&
        b.localStart < a.localEnd &&
        a.validFrom <= (b.validTo || '9999-12-31') &&
        b.validFrom <= (a.validTo || '9999-12-31')
      ) {
        throw new BadRequestException('Las ventanas laborales se superponen');
      }
    }
  }
}
