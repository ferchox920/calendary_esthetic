import { Temporal } from '@js-temporal/polyfill';

export interface Client { id: string; name: string; phone: string | null; email: string | null; shortNote: string | null; version: number; archivedAt?: string | null; totalCount?: number }
export interface Project { id: string; clientId: string; title: string; briefDescription: string | null; version: number; archivedAt?: string | null; sessions?: Entry[] }
export type Status = 'pending' | 'confirmed' | 'done' | 'absent' | 'canceled';
export interface Entry { id: string; kind: 'session' | 'block'; startAt: string; endAt: string; projectId?: string; projectTitle?: string; clientId?: string; clientName?: string; description?: string; sessionStatus?: Status; blockReason?: string; blockActive?: boolean; version: number; source?: 'google'; googleTitle?: string; googleStatus?: 'confirmed' | 'tentative' | 'cancelled'; allDay?: boolean; hasLocalConflict?: boolean }
export interface GoogleStatus { configured: boolean; googleEmail: string | null; needsReconnect: boolean; sourceReadEnabled: boolean; importedEvents: number; unlinkedEvents: number; source: { calendarId: string; name: string; timezone: string; enabled: boolean; fullSync: boolean; lastSyncedAt: string | null; lastError: string | null; rangeFrom: string; rangeTo: string } | null }
export interface Settings { timezone: string; version: number; defaultPrepMinutes: number; defaultCleanupMinutes: number; windows: { weekday: number; localStart: string; localEnd: string; validFrom: string; validTo?: string | null }[] }
export interface Day { date: string; timezone: string; entries: Entry[] }
export interface Availability { free: { startAt: string; endAt: string }[] }
export const statusLabels: Record<Status, string> = { pending: 'Por confirmar', confirmed: 'Confirmado', done: 'Realizado', absent: 'No asistió', canceled: 'Cancelado' };
export const today = (zone: string) => Temporal.Now.zonedDateTimeISO(zone).toPlainDate().toString();
export const addDays = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days }).toString();
export const weekday = (date: string) => Temporal.PlainDate.from(date).dayOfWeek;
export const instant = (date: string, time: string, zone: string) => Temporal.PlainDate.from(date).toPlainDateTime(time).toZonedDateTime(zone, { disambiguation: 'reject' }).toInstant().toString();
export const localDay = (value: string, zone: string) => Temporal.Instant.from(value).toZonedDateTimeISO(zone).toPlainDate().toString();
export const clock = (value: string, zone: string) => new Intl.DateTimeFormat('es-AR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
export const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('es-AR', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
