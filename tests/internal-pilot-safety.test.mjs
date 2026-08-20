import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../supabase/functions/fakturasjekk-internal-pilot/index.ts', import.meta.url), 'utf8')

test('internal pilot is synthetic-only and fail-closed', () => {
  assert.match(source, /input\.mode !== 'synthetic'/)
  assert.match(source, /customer_data_forbidden/)
  assert.match(source, /FAKTURASJEKK_INTERNAL_PILOT_SECRET/)
  assert.match(source, /customer_upload_enabled: false/)
  assert.match(source, /production_api_enabled: false/)
})

test('internal pilot remains bound to Fakturasjekk production project', () => {
  assert.match(source, /jxmkaxwflouacuboaetg/)
  assert.match(source, /wrong_supabase_project/)
})

test('internal pilot does not accept obvious customer identifiers or document payloads', () => {
  for (const token of ['document_text', 'file', 'storage_key', 'email', 'phone']) {
    assert.match(source, new RegExp(token))
  }
})
