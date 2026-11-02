import { normalizeGoogleEvent } from './google-import-event';
import { GoogleGateway } from './google.gateway';

describe('Calendar source event normalization and incremental requests', () => {
  const zone = 'America/Argentina/Buenos_Aires';
  it('preserves event identity, recurrence and local offsets without creating contacts', () => {
    expect(
      normalizeGoogleEvent(
        {
          id: 'instance-1',
          summary: 'Cliente · Tratamiento',
          recurringEventId: 'series-1',
          start: { dateTime: '2035-06-11T09:00:00-03:00' },
          end: { dateTime: '2035-06-11T10:00:00-03:00' },
          attendees: [{ email: 'private@example.test' }],
        },
        zone
      )
    ).toMatchObject({
      eventId: 'instance-1',
      recurringEventId: 'series-1',
      startAt: '2035-06-11T12:00:00Z',
      allDay: false,
      busy: true,
    });
  });
  it('uses an exclusive all-day end in the calendar timezone, including DST', () => {
    const event = normalizeGoogleEvent(
      { id: 'holiday', start: { date: '2030-03-10' }, end: { date: '2030-03-11' } },
      'America/New_York'
    );
    expect(event).toMatchObject({ startAt: '2030-03-10T05:00:00Z', endAt: '2030-03-11T04:00:00Z', allDay: true });
    expect(Date.parse(event.endAt) - Date.parse(event.startAt)).toBe(23 * 3600000);
  });
  it('accepts deleted-event tombstones with no dates and keeps transparent events free', () => {
    expect(normalizeGoogleEvent({ id: 'deleted', status: 'cancelled' }, zone)).toEqual({
      eventId: 'deleted',
      status: 'cancelled',
    });
    expect(
      normalizeGoogleEvent(
        { id: 'free', transparency: 'transparent', start: { date: '2035-06-11' }, end: { date: '2035-06-12' } },
        zone
      ).busy
    ).toBe(false);
  });
  it('rejects malformed identities, missing dates and inverted intervals', () => {
    expect(() => normalizeGoogleEvent({}, zone)).toThrow();
    expect(() => normalizeGoogleEvent({ id: 'bad' }, zone)).toThrow();
    expect(() =>
      normalizeGoogleEvent({ id: 'bad', start: { date: '2035-06-12' }, end: { date: '2035-06-11' } }, zone)
    ).toThrow();
  });
  it('never combines a sync token with forbidden time-range filters; keeps paging and query settings', async () => {
    const gateway = new GoogleGateway();
    const request = jest.spyOn(gateway, 'request').mockResolvedValue({ items: [], nextSyncToken: 'next' });
    const source = { rangeFrom: '2030-01-01T00:00:00Z', rangeTo: '2037-01-01T00:00:00Z' };
    await gateway.listEvents('fake', 'calendar@example.test', source);
    let url = new URL(`https://example.test/${request.mock.calls[0][2]}`);
    expect(url.searchParams.has('timeMin')).toBe(true);
    await gateway.listEvents('fake', 'calendar@example.test', { ...source, syncToken: 'sync', pageToken: 'page' });
    url = new URL(`https://example.test/${request.mock.calls[1][2]}`);
    expect(url.searchParams.get('syncToken')).toBe('sync');
    expect(url.searchParams.get('pageToken')).toBe('page');
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('showDeleted')).toBe('true');
    expect(url.searchParams.has('timeMin')).toBe(false);
    expect(url.searchParams.has('timeMax')).toBe(false);
  });
});
