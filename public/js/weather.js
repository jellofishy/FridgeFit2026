// Open-Meteo: free, no API key. Geocoding is also keyless.
const WMO = [
  [[0], 'Clear', '☀️'], [[1, 2], 'Mostly clear', '🌤️'], [[3], 'Cloudy', '☁️'], [[45, 48], 'Foggy', '🌫️'],
  [[51, 53, 55, 56, 57], 'Drizzle', '🌦️'], [[61, 63, 65, 66, 67, 80, 81, 82], 'Rainy', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'Snowy', '❄️'], [[95, 96, 99], 'Stormy', '⛈️'],
];

export function describe(code) {
  const hit = WMO.find(([codes]) => codes.includes(code));
  return hit ? { label: hit[1], emoji: hit[2] } : { label: 'Weather', emoji: '🌡️' };
}

export const toF = c => Math.round(c * 9 / 5 + 32);
export const fmtTemp = (c, units) => units === 'F' ? `${toF(c)}°F` : `${Math.round(c)}°C`;

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      e => reject(new Error(e.code === 1 ? 'denied' : 'unavailable')),
      { timeout: 10000, maximumAge: 600000 },
    );
  });
}

export async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
  const j = await r.json();
  const hit = j.results && j.results[0];
  if (!hit) throw new Error('not-found');
  return { lat: hit.latitude, lon: hit.longitude, place: [hit.name, hit.admin1 || hit.country].filter(Boolean).join(', ') };
}

export async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('weather');
  const c = (await r.json()).current;
  return { tempC: c.temperature_2m, feelC: c.apparent_temperature, code: c.weather_code, at: Date.now() };
}

/** 'cozy' for cold/wet days, 'hot' for warm days, null otherwise. */
export function weatherMode(w) {
  if (!w) return null;
  const wet = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].includes(w.code);
  if (w.feelC <= 10 || (wet && w.feelC < 22)) return 'cozy';
  if (w.feelC >= 27) return 'hot';
  return null;
}

export function weatherBlurb(w, units) {
  const d = describe(w.code), mode = weatherMode(w), t = fmtTemp(w.feelC, units);
  if (mode === 'cozy') return { ...d, text: `${d.label} and ${t}. Perfect day for something warm and cozy.`, chip: 'Cozy picks' };
  if (mode === 'hot') return { ...d, text: `${d.label} and ${t}. Let's keep it fresh and light.`, chip: 'Cool & fresh' };
  return { ...d, text: `${d.label}, ${t}. Great day to cook whatever you're craving.`, chip: null };
}
