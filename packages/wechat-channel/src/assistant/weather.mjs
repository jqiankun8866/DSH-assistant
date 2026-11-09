// Open-Meteo daily forecast adapter. Coordinates must be supplied by onboarding.
// No account location inference; no background network calls during tests/demo.
export function createWeather({ fetchImpl = fetch, now = Date.now } = {}) {
  return async (location, timeZone) => {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude),
      timezone: timeZone, forecast_days: '1', daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max' });
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('weather HTTP failure');
    const data = await response.json();
    const d = data.daily;
    const high = d?.temperature_2m_max?.[0], low = d?.temperature_2m_min?.[0], rain = d?.precipitation_probability_max?.[0];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
    if (![high, low, rain].every(Number.isFinite) || high < low || rain < 0 || rain > 100 || d.time?.[0] !== today
      || data.daily_units?.temperature_2m_max !== '°C' || data.daily_units?.temperature_2m_min !== '°C'
      || data.daily_units?.precipitation_probability_max !== '%') throw new Error('invalid weather data');
    return { summary: `今天 ${low}–${high}°C，最高降水概率 ${rain}%。${rain >= 50 ? '出门记得带伞。' : ''}`,
      fetchedAt: now(), source: 'https://open-meteo.com/' };
  };
}
