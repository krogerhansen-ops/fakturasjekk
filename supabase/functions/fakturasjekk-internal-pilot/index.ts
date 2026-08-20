const EXPECTED_PROJECT_REF = 'jxmkaxwflouacuboaetg'
const EXPECTED_PROJECT_ORIGIN = `https://${EXPECTED_PROJECT_REF}.supabase.co`
const PILOT_OWNER = 'internal-pilot'

const SECURITY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'pragma': 'no-cache',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: SECURITY_HEADERS })
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return json(405, { ok: false, code: 'method_not_allowed' })
  }

  const configuredUrl = Deno.env.get('SUPABASE_URL') ?? ''
  let projectMatches = false
  try {
    projectMatches = new URL(configuredUrl).origin === EXPECTED_PROJECT_ORIGIN
  } catch {
    projectMatches = false
  }

  if (!projectMatches) {
    return json(503, { ok: false, code: 'wrong_supabase_project' })
  }

  const expectedSecret = Deno.env.get('FAKTURASJEKK_INTERNAL_PILOT_SECRET') ?? ''
  const suppliedSecret = request.headers.get('x-fakturasjekk-pilot-secret') ?? ''
  if (expectedSecret.length < 32 || !safeEqual(expectedSecret, suppliedSecret)) {
    return json(401, { ok: false, code: 'pilot_auth_required' })
  }

  let input: Record<string, unknown>
  try {
    input = await request.json()
  } catch {
    return json(400, { ok: false, code: 'invalid_json' })
  }

  if (input.mode !== 'synthetic') {
    return json(403, { ok: false, code: 'synthetic_only' })
  }

  if (input.document_text || input.file || input.storage_key || input.email || input.phone) {
    return json(403, { ok: false, code: 'customer_data_forbidden' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRole) {
    return json(503, { ok: false, code: 'database_credentials_missing' })
  }

  const caseId = id('case')
  const analysisId = id('analysis')
  const draftId = id('draft')
  const now = new Date().toISOString()

  const caseRow = {
    id: caseId,
    owner_id: PILOT_OWNER,
    state: 'analyzed',
    retention_mode: 'temporary',
    buyer_type: 'consumer',
    subject: 'Syntetisk intern pilot',
    engine_version: 'internal-pilot-v1',
    snapshot: {
      synthetic: true,
      public_customer_upload_enabled: false,
      created_by: 'fakturasjekk-internal-pilot',
    },
    created_at: now,
    updated_at: now,
  }

  const analysisRow = {
    id: analysisId,
    case_id: caseId,
    owner_id: PILOT_OWNER,
    engine_version: 'internal-pilot-v1',
    rule_registry_version: 'synthetic-pilot',
    status: 'completed',
    result: {
      synthetic: true,
      outcome: 'internal_pipeline_verified',
      findings: [],
    },
    created_at: now,
  }

  const draftRow = {
    id: draftId,
    case_id: caseId,
    owner_id: PILOT_OWNER,
    analysis_id: analysisId,
    mode: 'synthetic_internal',
    body: 'Syntetisk pilotutkast. Skal aldri sendes til kunde eller leverandør.',
    created_at: now,
  }

  async function insert(table: string, row: Record<string, unknown>) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    })
    if (!response.ok) throw new Error(`${table}_insert_failed:${response.status}`)
  }

  try {
    await insert('cases', caseRow)
    await insert('analyses', analysisRow)
    await insert('drafts', draftRow)
  } catch {
    return json(500, { ok: false, code: 'pilot_write_failed' })
  }

  return json(201, {
    ok: true,
    synthetic: true,
    customer_upload_enabled: false,
    production_api_enabled: false,
    case_id: caseId,
    analysis_id: analysisId,
    draft_id: draftId,
  })
})
