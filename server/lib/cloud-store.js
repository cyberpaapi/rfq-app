import { neon } from '@neondatabase/serverless'

// Keep the prototype's document store durable on serverless instances. Each
// request gets its own snapshot; compare-and-swap prevents lost updates.
export function createPostgresDatabase(seed) {
  let sql, initialized
  const init = async () => {
    sql ||= neon(process.env.DATABASE_URL)
    initialized ||= sql`CREATE TABLE IF NOT EXISTS opro_state (
      id text PRIMARY KEY, data jsonb NOT NULL, version bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.catch((error) => { initialized = null; throw error })
    await initialized
  }
  return {
    async load() {
      await init()
      let rows = await sql`SELECT data, version FROM opro_state WHERE id = 'main'`
      if (!rows.length) {
        await sql`INSERT INTO opro_state (id, data) VALUES ('main', ${JSON.stringify(seed())}::jsonb) ON CONFLICT (id) DO NOTHING`
        rows = await sql`SELECT data, version FROM opro_state WHERE id = 'main'`
      }
      return { data: rows[0].data, version: rows[0].version, dirty: false }
    },
    async commit(state) {
      const rows = await sql`UPDATE opro_state SET data = ${JSON.stringify(state.data)}::jsonb,
        version = version + 1, updated_at = now()
        WHERE id = 'main' AND version = ${state.version} RETURNING version`
      if (!rows.length) throw Object.assign(new Error('Another request changed the data. Reload and retry.'), { status: 409 })
    },
  }
}

export function createCloudMiddleware(database, runWithState) {
  return async (req, res, next) => {
    try {
      const state = await database.load()
      const end = res.end.bind(res)
      let finishing = false
      res.end = function (...args) {
        if (finishing) return res
        finishing = true
        const save = state.dirty && res.statusCode < 400 ? database.commit(state) : Promise.resolve()
        save.then(() => end(...args)).catch((error) => {
          console.error('[cloud-store] save failed:', error.message)
          res.statusCode = error.status || 503
          for (const name of ['Content-Length', 'ETag', 'Content-Disposition']) res.removeHeader(name)
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          end(JSON.stringify({ error: error.status === 409 ? error.message : 'Could not save changes. Please retry.' }))
        })
        return res
      }
      runWithState(state, next)
    } catch (error) {
      console.error('[cloud-store] load failed:', error.message)
      res.status(503).json({ error: 'Database is temporarily unavailable. Please retry.' })
    }
  }
}
