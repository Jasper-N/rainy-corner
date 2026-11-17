// EXTENSION: the only authoritative season / weather / time state.
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const WEATHERS = ['clear', 'cloudy', 'rain', 'snow', 'fog', 'rainbow'];
export const TIMES = ['day', 'dusk', 'night'];
export function normalizeState(previous, patch = {}) {
  const next = { ...previous, ...patch };
  if (!SEASONS.includes(next.season) || !WEATHERS.includes(next.weather) || !TIMES.includes(next.timeOfDay)) throw new TypeError('Unknown environment option');
  let message = '';
  if (next.season === 'summer' && next.weather === 'snow') { next.weather = 'rain'; message = '夏季不降雪，已切换为雨。'; }
  if (next.season === 'winter' && next.weather === 'rainbow') { next.weather = 'clear'; message = '冬季不显示彩虹，已切换为晴。'; }
  if (next.weather === 'rainbow' && next.timeOfDay === 'night') message = '夜晚保留雨后天气，彩虹将在白天或黄昏出现。';
  return { next: Object.freeze(next), message };
}
export function showRainbow(state) { return state.weather === 'rainbow' && state.season !== 'winter' && state.timeOfDay !== 'night'; }
export function createEnvironmentStore(initial = { season: 'autumn', weather: 'rain', timeOfDay: 'night' }) {
  let state = normalizeState(initial).next;
  const listeners = new Set();
  return {
    get state() { return state; },
    set(patch) { const result = normalizeState(state, patch); state = result.next; listeners.forEach(fn => fn(state, result.message)); return result; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
