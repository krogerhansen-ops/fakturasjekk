import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/rate-limit-production-verification.yml', import.meta.url), 'utf8');

assert.match(workflow, /startsWith\(github\.head_ref, 'verify\/rate-limit-live-'\)/);
assert.match(workflow, /SUPABASE_DB_PASSWORD/);
assert.match(workflow, /No production database connection was attempted/);
assert.match(workflow, /12 independent concurrent increments/);
assert.match(workflow, /test "\$unique_pids" = '12'/);
assert.match(workflow, /test "\$final_count" = '12'/);
assert.match(workflow, /if: always\(\) && env\.PGPASSWORD != ''/);
assert.match(workflow, /delete from public\.rate_limit_windows where key = :'key'/);
assert.doesNotMatch(workflow, /if: always\(\)\n\s+shell: bash\n\s+run:[\s\S]*Verify synthetic row cleanup/,
  'cleanup verification must not attempt a database connection when the repository secret is absent');

console.log('OK live rate-limit verification fails cleanly when credentials are absent and retains synthetic cleanup guarantees');
