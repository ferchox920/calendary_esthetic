import { Temporal } from '@js-temporal/polyfill';

export interface ImportedGoogleEvent {
  eventId: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  title?: string;
  description?: string;
  location?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  busy?: boolean;
  etag?: string;
  recurringEventId?: string;
}

export function normalizeGoogleEvent(event: any, calendarTimezone: string): ImportedGoogleEvent {
  if (!event || typeof event.id !== 'string' || !event.id || event.id.length > 2000) throw new Error('invalid_event');
  if (event.status === 'cancelled') return { eventId: event.id, status: 'cancelled' };
  const allDay = !!event.start?.date;
  const point = (value: any) => {
    if (allDay)
      return Temporal.PlainDate.from(value.date)
        .toZonedDateTime({ timeZone: calendarTimezone, plainTime: '00:00' })
        .toInstant();
    return Temporal.Instant.from(value.dateTime);
  };
  const start = point(event.start),
    end = point(event.end);
  if (Temporal.Instant.compare(start, end) >= 0) throw new Error('invalid_event_interval');
  const safeText = (value: unknown, fallback = '') => (typeof value === 'string' ? value.slice(0, 20000) : fallback);
  return {
    eventId: event.id,
    status: event.status === 'tentative' ? 'tentative' : 'confirmed',
    title: safeText(event.summary, 'Evento de Google Calendar'),
    description: safeText(event.description),
    location: safeText(event.location),
    startAt: start.toString(),
    endAt: end.toString(),
    allDay,
    busy: event.transparency !== 'transparent',
    etag: safeText(event.etag),
    recurringEventId: safeText(event.recurringEventId),
  };
}
