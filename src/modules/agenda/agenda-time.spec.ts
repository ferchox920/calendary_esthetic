import { dayRange, instant, validateWindows, withinWindow } from './agenda-time';

describe('Agenda time', () => {
  it('accepts offsets and rejects missing zones, impossible dates and leap seconds', () => {
    expect(instant('2030-01-02T10:00:00-03:00').toISOString()).toBe('2030-01-02T13:00:00.000Z');
    for (const value of ['2030-02-30T10:00:00Z', '2030-01-02T10:00:00', 'Infinity', '2030-01-02T10:00:60Z']) {
      expect(() => instant(value)).toThrow();
    }
  });

  it('uses local midnight boundaries rather than a fixed 24 hours', () => {
    const spring = dayRange('2030-03-10', 'America/New_York');
    const autumn = dayRange('2030-11-03', 'America/New_York');
    expect(spring.to.getTime() - spring.from.getTime()).toBe(23 * 3600000);
    expect(autumn.to.getTime() - autumn.from.getTime()).toBe(25 * 3600000);
    expect(dayRange('2030-01-02', 'America/Argentina/Buenos_Aires').from.toISOString()).toBe(
      '2030-01-02T03:00:00.000Z'
    );
  });

  it('checks the entire occupation without rounding minutes or crossing breaks', () => {
    const settings = { timezone: 'America/Argentina/Buenos_Aires' };
    const windows = [{ weekday: 3, localStart: '09:00', localEnd: '13:00', validFrom: '2030-01-01', validTo: null }];
    expect(
      withinWindow(
        { occupiedStartAt: '2030-01-02T12:03:00Z', occupiedEndAt: '2030-01-02T15:59:00Z' },
        settings,
        windows
      )
    ).toBe(true);
    expect(
      withinWindow(
        { occupiedStartAt: '2030-01-02T12:03:00Z', occupiedEndAt: '2030-01-02T16:01:00Z' },
        settings,
        windows
      )
    ).toBe(false);
  });

  it('rejects overlapping effective windows and invalid dates', () => {
    const a = { weekday: 1, localStart: '09:00', localEnd: '13:00', validFrom: '2030-01-01' };
    expect(() => validateWindows([a, { ...a, localStart: '12:00', localEnd: '14:00' }])).toThrow();
    expect(() => validateWindows([{ ...a, validFrom: '2030-02-30' }])).toThrow();
    expect(() => validateWindows([a, { ...a, localStart: '13:00', localEnd: '18:00' }])).not.toThrow();
  });
});
