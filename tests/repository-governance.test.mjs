import fs from 'node:fs';
import assert from 'node:assert/strict';

const owners = fs.readFileSync(new URL('../.github/CODEOWNERS', import.meta.url), 'utf8');
const baseline = fs.readFileSync(new URL('../docs/REPOSITORY-SECURITY-BASELINE.md', import.meta.url), 'utf8');

for (const critical of ['/.github/workflows/', '/server/', '/supabase/', '/rules/', '/config/', '/tests/']) {
  assert.match(owners, new RegExp(`^${critical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+@krogerhansen-ops$`, 'm'), `CODEOWNERS must cover ${critical}`);
}
assert.match(baseline, /blocks direct pushes to `main`/);
assert.match(baseline, /requires pull requests before merge/);
assert.match(baseline, /requires the Fakturasjekk quality gate to pass/);
assert.match(baseline, /requires CODEOWNER review/);
assert.match(baseline, /prevents force-push and branch deletion/);
assert.match(baseline, /Presence of CODEOWNERS or CI files alone is not evidence/);
assert.match(baseline, /live read-back of the active repository ruleset\/branch-protection state/);

console.log('OK repository governance baseline defines critical ownership and fail-closed main-branch protection requirements');
