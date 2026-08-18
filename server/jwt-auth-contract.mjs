function audienceMatches(claim, expected) {
  if (typeof claim === 'string') return claim === expected;
  return Array.isArray(claim) && claim.includes(expected);
}

export function validateVerifiedClaims(claims = {}, { issuer, audience, clock = () => new Date(), clock_skew_seconds = 60 } = {}) {
  const errors = [];
  const now = Math.floor(clock().getTime() / 1000);
  const skew = Number(clock_skew_seconds) || 0;
  if (!claims.sub || typeof claims.sub !== 'string') errors.push('sub mangler.');
  if (claims.iss !== issuer) errors.push('iss stemmer ikke.');
  if (!audienceMatches(claims.aud, audience)) errors.push('aud stemmer ikke.');
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) < now - skew) errors.push('Token er utløpt.');
  if (claims.nbf != null && (!Number.isFinite(Number(claims.nbf)) || Number(claims.nbf) > now + skew)) errors.push('Token er ikke gyldig ennå.');
  if (claims.iat != null && Number.isFinite(Number(claims.iat)) && Number(claims.iat) > now + skew) errors.push('Token har fremtidig iat.');
  return { valid: errors.length === 0, errors };
}

export function createJwtAuthAdapter({ verifier, issuer, audience, clock = () => new Date(), clock_skew_seconds = 60 } = {}) {
  if (!verifier?.verify) throw new Error('JWT verifier requires verify(token).');
  if (!issuer || !audience) throw new Error('JWT issuer and audience are required.');

  return {
    async verifyBearer(token) {
      if (typeof token !== 'string' || token.length < 16 || token.length > 20000) return null;
      const verified = await verifier.verify(token);
      if (!verified?.signature_valid || !verified?.claims) return null;
      const check = validateVerifiedClaims(verified.claims, { issuer, audience, clock, clock_skew_seconds });
      if (!check.valid) return null;
      const claims = verified.claims;
      return {
        id: claims.sub,
        email: typeof claims.email === 'string' ? claims.email : null,
        role: typeof claims.role === 'string' ? claims.role : 'user',
        disabled: claims.disabled === true
      };
    }
  };
}

export function createDevelopmentJwtVerifier({ claimsByToken = {} } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Development JWT verifier cannot run in production.');
  return {
    async verify(token) {
      const claims = claimsByToken[token];
      return claims ? { signature_valid: true, claims: structuredClone(claims) } : { signature_valid: false, claims: null };
    }
  };
}
