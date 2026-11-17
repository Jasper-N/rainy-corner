// Run: node state.test.mjs (no installation or backend required).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('./environment-state.js', import.meta.url), 'utf8');
const { createEnvironmentStore, normalizeState, showRainbow, SEASONS, WEATHERS, TIMES } = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let checks=0;
for (const season of SEASONS) for (const weather of WEATHERS) for (const timeOfDay of TIMES) {
  const requested={season,weather,timeOfDay};
  const {next}=normalizeState(requested);
  assert(!(next.season==='summer'&&next.weather==='snow'));
  assert(!(next.season==='winter'&&next.weather==='rainbow'));
  assert.equal(showRainbow(next),next.weather==='rainbow'&&next.timeOfDay!=='night'&&next.season!=='winter');
  for(const [key,choices] of [['season',SEASONS],['weather',WEATHERS],['timeOfDay',TIMES]])for(const value of choices){
    const store=createEnvironmentStore(next); let seen;
    const unsubscribe=store.subscribe(state=>seen=state);
    const {next:changed}=store.set({[key]:value});
    assert.equal(store.state,seen);assert.equal(changed,seen);assert(Object.isFrozen(store.state));
    assert(!(changed.season==='summer'&&changed.weather==='snow'));
    assert(!(changed.season==='winter'&&changed.weather==='rainbow'));
    unsubscribe();seen=null;store.set({});assert.equal(seen,null);checks++;
  }
}
assert.throws(()=>normalizeState({season:'spring',weather:'rain',timeOfDay:'night'},{weather:'storm'}),TypeError);
console.log(`PASS: 72 combinations, ${checks} state transitions, immutable shared state, unsubscription, validation, rainbow visibility.`);
