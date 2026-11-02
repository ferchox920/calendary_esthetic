import assert from 'node:assert/strict';
import test from 'node:test';
import { instant, localDay, addDays, weekday, clock, esc } from '../src/domain.ts';

test('reserves a Buenos Aires wall clock independently of device timezone', () => {
  assert.equal(instant('2030-06-10', '09:00', 'America/Argentina/Buenos_Aires'), '2030-06-10T12:00:00Z');
  assert.equal(clock('2030-06-10T12:00:00Z', 'America/Argentina/Buenos_Aires'), '09:00');
});

test('uses the agenda local day for entries near midnight', () => {
  assert.equal(localDay('2030-06-11T01:30:00Z', 'America/Argentina/Buenos_Aires'), '2030-06-10');
});

test('rejects ambiguous and nonexistent daylight-saving wall clocks', () => {
  assert.throws(() => instant('2030-03-10', '02:30', 'America/New_York'));
  assert.throws(() => instant('2030-11-03', '01:30', 'America/New_York'));
});

test('navigates month, year, leap-day and Monday week boundaries', () => {
  assert.equal(addDays('2030-12-31', 1), '2031-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(weekday('2030-06-10'), 1);
  assert.equal(addDays('2030-06-16', 1 - weekday('2030-06-16')), '2030-06-10');
});

test('escapes user-provided notes and attribute values as text', () => {
  assert.equal(esc('<img src=x onerror="alert(1)"> & \'quoted\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;');
  assert.equal(esc(null), '');
});
