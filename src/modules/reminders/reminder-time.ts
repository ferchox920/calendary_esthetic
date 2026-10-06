import { BadRequestException } from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { zoned } from '../agenda/agenda-time';

export interface ReminderRule {
  leadMinutes: number;
  template: string;
}
export interface ReminderSettings {
  enabled: boolean;
  rules: ReminderRule[];
  allowedStart: string;
  allowedEnd: string;
  graceMinutes: number;
  maxAttempts: number;
  version: number;
}
export const internationalPhone = (phone: unknown): phone is string =>
  typeof phone === 'string' && /^\+[1-9]\d{7,14}$/.test(phone);

export function validateRules(rules: ReminderRule[]) {
  if (new Set(rules.map((r) => r.leadMinutes)).size !== rules.length)
    throw new BadRequestException('Anticipaciones duplicadas');
  for (const rule of rules) {
    if (!rule.template.trim() || /[{}]/.test(rule.template.replace(/\{\{(?:date|time|timezone)\}\}/g, '')))
      throw new BadRequestException('Plantilla inválida; variables permitidas: date, time, timezone');
  }
}

// Windows are [start,end), every day in the agenda zone. Never use the host's timezone.
export function allowedAt(at: Date, settings: ReminderSettings, zone: string): boolean {
  const time = zoned(at, zone).toPlainTime();
  return (
    Temporal.PlainTime.compare(time, Temporal.PlainTime.from(settings.allowedStart)) >= 0 &&
    Temporal.PlainTime.compare(time, Temporal.PlainTime.from(settings.allowedEnd)) < 0
  );
}

export function nextAllowed(at: Date, settings: ReminderSettings, zone: string): Date {
  if (allowedAt(at, settings, zone)) return at;
  const local = zoned(at, zone);
  const date =
    Temporal.PlainTime.compare(local.toPlainTime(), Temporal.PlainTime.from(settings.allowedEnd)) >= 0
      ? local.toPlainDate().add({ days: 1 })
      : local.toPlainDate();
  // Explicit DST policy: skip nonexistent boundaries forward, choose earlier repeated boundary.
  const start = date.toPlainDateTime(settings.allowedStart).toZonedDateTime(zone, { disambiguation: 'compatible' });
  return new Date(start.epochMilliseconds);
}

export function renderReminder(template: string, startAt: Date, zone: string): string {
  const local = zoned(startAt, zone);
  const values = {
    date: `${String(local.day).padStart(2, '0')}/${String(local.month).padStart(2, '0')}/${local.year}`,
    time: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
    timezone: zone,
  };
  return template.replace(/\{\{(date|time|timezone)\}\}/g, (_, key: keyof typeof values) => values[key]);
}
