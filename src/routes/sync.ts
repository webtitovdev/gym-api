import { Hono } from 'hono';
import { db } from '../db.js';

export const syncRoutes = new Hono();

interface SessionRow {
  id: string;
  dayId: string;
  startedAt: number;
  completedAt: number;
  bodyWeight: number | null;
  notes: string | null;
  updatedAt: number;
  deleted: 0 | 1;
}
interface SetLogRow {
  id: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  weight: number;
  reps: number;
  rir: number;
  side: string | null;
  completedAt: number;
  notes: string | null;
  updatedAt: number;
  deleted: 0 | 1;
}
interface SettingRow {
  key: string;
  value: string;
  updatedAt: number;
}
interface SyncPayload {
  sessions?: SessionRow[];
  setLogs?: SetLogRow[];
  settings?: SettingRow[];
}

// GET /api/sync — full snapshot of everything (incl. soft-deleted rows)
syncRoutes.get('/', (c) => {
  const sessions = db
    .prepare(
      `SELECT id, day_id AS dayId, started_at AS startedAt, completed_at AS completedAt,
              body_weight AS bodyWeight, notes, updated_at AS updatedAt, deleted
       FROM sessions`
    )
    .all();
  const setLogs = db
    .prepare(
      `SELECT id, session_id AS sessionId, exercise_id AS exerciseId, set_index AS setIndex,
              weight, reps, rir, side, completed_at AS completedAt, notes,
              updated_at AS updatedAt, deleted
       FROM set_logs`
    )
    .all();
  const settings = db
    .prepare(`SELECT key, value, updated_at AS updatedAt FROM settings`)
    .all();
  return c.json({ sessions, setLogs, settings, serverTime: Date.now() });
});

// POST /api/sync — bulk upsert (last-write-wins by updated_at)
syncRoutes.post('/', async (c) => {
  const payload = (await c.req.json().catch(() => ({}))) as SyncPayload;

  const upsertSession = db.prepare(`
    INSERT INTO sessions (id, day_id, started_at, completed_at, body_weight, notes, updated_at, deleted)
    VALUES (@id, @dayId, @startedAt, @completedAt, @bodyWeight, @notes, @updatedAt, @deleted)
    ON CONFLICT(id) DO UPDATE SET
      day_id = excluded.day_id,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      body_weight = excluded.body_weight,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
    WHERE excluded.updated_at > sessions.updated_at
  `);

  const upsertSetLog = db.prepare(`
    INSERT INTO set_logs (id, session_id, exercise_id, set_index, weight, reps, rir, side, completed_at, notes, updated_at, deleted)
    VALUES (@id, @sessionId, @exerciseId, @setIndex, @weight, @reps, @rir, @side, @completedAt, @notes, @updatedAt, @deleted)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      exercise_id = excluded.exercise_id,
      set_index = excluded.set_index,
      weight = excluded.weight,
      reps = excluded.reps,
      rir = excluded.rir,
      side = excluded.side,
      completed_at = excluded.completed_at,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
    WHERE excluded.updated_at > set_logs.updated_at
  `);

  const upsertSetting = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (@key, @value, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at > settings.updated_at
  `);

  let counts = { sessions: 0, setLogs: 0, settings: 0 };

  const tx = db.transaction(() => {
    for (const s of payload.sessions ?? []) {
      upsertSession.run({
        id: s.id,
        dayId: s.dayId,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        bodyWeight: s.bodyWeight ?? null,
        notes: s.notes ?? null,
        updatedAt: s.updatedAt,
        deleted: s.deleted ?? 0,
      });
      counts.sessions++;
    }
    for (const sl of payload.setLogs ?? []) {
      upsertSetLog.run({
        id: sl.id,
        sessionId: sl.sessionId,
        exerciseId: sl.exerciseId,
        setIndex: sl.setIndex,
        weight: sl.weight,
        reps: sl.reps,
        rir: sl.rir,
        side: sl.side ?? null,
        completedAt: sl.completedAt,
        notes: sl.notes ?? null,
        updatedAt: sl.updatedAt,
        deleted: sl.deleted ?? 0,
      });
      counts.setLogs++;
    }
    for (const st of payload.settings ?? []) {
      upsertSetting.run({ key: st.key, value: st.value, updatedAt: st.updatedAt });
      counts.settings++;
    }
  });
  tx();

  return c.json({ ok: true, accepted: counts, serverTime: Date.now() });
});
