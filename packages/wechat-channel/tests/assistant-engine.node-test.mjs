import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Assistant, nextDaily, quietAt } from '../src/assistant/assistant.mjs';
import { createWeather } from '../src/assistant/weather.mjs';
import { startRunner } from '../src/assistant/runner.mjs';

const start = Date.parse('2026-10-28T00:00:00Z'); // 08:00 Shanghai
test('timezone and DST calculations', () => {
  assert.equal(nextDaily(start, '09:00', 'Asia/Shanghai'), start + 3_600_000);
  assert.equal(nextDaily(Date.parse('2026-03-08T06:59:00Z'), '02:30', 'America/New_York'), Date.parse('2026-03-09T06:30:00Z'));
  assert.equal(nextDaily(Date.parse('2026-11-01T05:30:00Z'), '01:30', 'America/New_York', '2026-11-01'), Date.parse('2026-11-02T06:30:00Z'));
});
test('weather adapter validates date, units and numbers using HTTP fixtures', async () => {
  const data = { daily: { time: ['2026-10-28'], temperature_2m_max: [23], temperature_2m_min: [15], precipitation_probability_max: [80] },
    daily_units: { temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%' } };
  const location = { name: '测试', latitude: 30, longitude: 120 };
  const make = body => createWeather({ now: () => start, fetchImpl: async url => {
    assert.equal(url.searchParams.get('timezone'), 'Asia/Shanghai'); return { ok: true, json: async () => body };
  } });
  assert.match((await make(data)(location, 'Asia/Shanghai')).summary, /带伞/);
  for (const bad of [{ ...data, daily_units: {} }, { ...data, daily: { ...data.daily, time: ['2020-01-01'] } }, { ...data, daily: { ...data.daily, temperature_2m_max: [null] } }]) await assert.rejects(make(bad)(location, 'Asia/Shanghai'));
});

