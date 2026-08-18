export function createPostgresAtomicCounterStore({ db } = {}) {
  if (!db?.query) throw new Error('PostgreSQL rate-limit store requires db.query.');
  return {
    async incrementWindow({ key, window_ms }) {
      if (!key || !Number.isFinite(Number(window_ms)) || Number(window_ms) <= 0) throw new Error('Invalid rate-limit window input.');
      const result = await db.query(
        `INSERT INTO rate_limit_windows (key, count, reset_at, updated_at)
         VALUES ($1, 1, now() + ($2 * interval '1 millisecond'), now())
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN rate_limit_windows.reset_at <= now() THEN 1 ELSE rate_limit_windows.count + 1 END,
           reset_at = CASE WHEN rate_limit_windows.reset_at <= now() THEN now() + ($2 * interval '1 millisecond') ELSE rate_limit_windows.reset_at END,
           updated_at = now()
         RETURNING count, (EXTRACT(EPOCH FROM reset_at) * 1000)::bigint AS reset_at_ms`,
        [key, Number(window_ms)]
      );
      const row = result.rows?.[0];
      if (!row) throw new Error('Rate-limit counter update returned no row.');
      return { count: Number(row.count), reset_at: Number(row.reset_at_ms) };
    }
  };
}
