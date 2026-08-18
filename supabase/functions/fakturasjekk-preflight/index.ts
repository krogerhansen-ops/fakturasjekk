const EXPECTED_PROJECT_REF = 'jxmkaxwflouacuboaetg'
const EXPECTED_PROJECT_ORIGIN = `https://${EXPECTED_PROJECT_REF}.supabase.co`

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

Deno.serve((request: Request) => {
  if (request.method !== 'GET') {
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
    return json(503, {
      ok: false,
      service: 'fakturasjekk-preflight',
      code: 'wrong_supabase_project',
      customer_upload_enabled: false,
    })
  }

  return json(200, {
    ok: true,
    service: 'fakturasjekk-preflight',
    project_bound: true,
    region_target: 'eu-north-1',
    customer_upload_enabled: false,
    production_api_enabled: false,
  })
})
