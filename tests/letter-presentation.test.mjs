import fs from 'node:fs';
import assert from 'node:assert/strict';

const wrapper = fs.readFileSync(new URL('../site/engine/draft.mjs', import.meta.url), 'utf8');

assert.match(wrapper, /export \* from '\.\.\/\.\.\/engine\/draft\.mjs'/);
assert.match(wrapper, /fakturasjekk-letter-ui/);
assert.match(wrapper, /Utkast – gjennomgå før sending/);
assert.match(wrapper, /Kontrollen viser:/);
assert.match(wrapper, /Det jeg ber om:/);
assert.match(wrapper, /MutationObserver/);
assert.equal(wrapper.includes('HTJL_'), false, 'presentation layer must not hard-code internal legal rule ids');
assert.equal(wrapper.includes('lovdata.no'), false, 'presentation layer must not introduce legal sources');

console.log('OK letter presentation layer formats the controlled draft without adding legal content.');
