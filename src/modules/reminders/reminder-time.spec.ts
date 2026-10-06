import {
  allowedAt,
  internationalPhone,
  nextAllowed,
  renderReminder,
  validateRules,
  ReminderSettings,
} from './reminder-time';
import { reminderRuntime } from './reminder-provider';

describe('Reminder time and runtime policy', () => {
  const settings: ReminderSettings = {
    enabled: true,
    rules: [],
    allowedStart: '09:00',
    allowedEnd: '20:00',
    graceMinutes: 30,
    maxAttempts: 3,
    version: 1,
  };
  const zone = 'America/Argentina/Buenos_Aires';
  it('uses the agenda timezone, exclusive end and next local day', () => {
    expect(allowedAt(new Date('2035-06-11T12:00:00Z'), settings, zone)).toBe(true);
    expect(allowedAt(new Date('2035-06-11T23:00:00Z'), settings, zone)).toBe(false);
    expect(nextAllowed(new Date('2035-06-11T23:00:00Z'), settings, zone).toISOString()).toBe(
      '2035-06-12T12:00:00.000Z'
    );
    expect(nextAllowed(new Date('2035-06-11T10:00:00Z'), settings, zone).toISOString()).toBe(
      '2035-06-11T12:00:00.000Z'
    );
  });
  it('handles DST boundaries with an explicit compatible policy', () => {
    const s = { ...settings, allowedStart: '02:30', allowedEnd: '04:00' };
    expect(nextAllowed(new Date('2027-03-14T06:00:00Z'), s, 'America/New_York').toISOString()).toBe(
      '2027-03-14T07:30:00.000Z'
    );
    expect(
      nextAllowed(new Date('2027-11-07T04:00:00Z'), { ...s, allowedStart: '01:30' }, 'America/New_York').toISOString()
    ).toBe('2027-11-07T05:30:00.000Z');
  });
  it('does not infer a country, evaluates only allowlisted template variables and formats local time', () => {
    expect(internationalPhone('+5491100000000')).toBe(true);
    for (const value of ['01112345678', '+012345678', '+54 911 0000', '+123', null])
      expect(internationalPhone(value)).toBe(false);
    expect(() => validateRules([{ leadMinutes: 1, template: '{{name}}' }])).toThrow();
    expect(() =>
      validateRules([
        { leadMinutes: 1, template: 'a' },
        { leadMinutes: 1, template: 'b' },
      ])
    ).toThrow();
    expect(renderReminder('{{date}} {{time}} {{timezone}}', new Date('2035-06-11T13:00:00Z'), zone)).toBe(
      '11/06/2035 10:00 America/Argentina/Buenos_Aires'
    );
  });
  it('fails closed on runtime mistakes and forbids simulated success in production', () => {
    expect(reminderRuntime({})).toEqual({ workerEnabled: false, provider: 'disabled' });
    expect(() => reminderRuntime({ REMINDERS_WORKER_ENABLED: 'yes' })).toThrow();
    expect(() => reminderRuntime({ REMINDERS_PROVIDER: 'baileys' })).toThrow();
    expect(() => reminderRuntime({ NODE_ENV: 'production', REMINDERS_PROVIDER: 'simulated' })).toThrow();
  });
});
