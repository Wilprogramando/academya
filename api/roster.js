// The gym roster: one row per member, derived from the profile each of them syncs.
//
// This is the reading side of the members dashboard (GET /api/admin/roster). It is pure — a user
// record and their stored state in, a row out — because it decides the thing the screen exists to
// answer ("who stopped coming?") and nobody can verify that by clicking around a dashboard with
// three profiles in it. The fs, the session and the HTTP live in server.js.
//
// Days are counted in whole local days, not in 24-hour blocks: someone who trained last night and
// someone who trained at six this morning are both "today", which is how a receptionist reads the
// list. The caller passes `now`, so the clock is testable.

const DAY = 86400000;

/** Whole days between two timestamps, by calendar day in the server's zone. */
export function daysBetween(then, now) {
  if (!then) return null;
  const a = new Date(then), b = new Date(now);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((b - a) / DAY));
}

// A workout entry carries its day as `d` (an ISO date or a timestamp, depending on the client
// that wrote it). Anything we cannot read as a date is skipped rather than counted as "today",
// which would quietly turn a broken entry into a member who trained.
//
// A bare "2026-03-16" is read as midnight LOCAL, not UTC. Date.parse() reads a date-only string as
// UTC, which in every zone west of Greenwich lands on the evening before: in São Paulo a session
// logged on the 16th became the 15th, and every member on the list showed one day more since they
// last trained — exactly the number this screen exists to show.
export function workoutTime(w) {
  const d = w?.d;
  if (typeof d === 'number') return Number.isFinite(d) ? d : null;
  if (typeof d !== 'string') return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]).getTime();
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : null;
}

/**
 * Where a member stands, in the words a gym uses:
 *   'new'      — signed up in the last 14 days and has not trained yet. Nobody to chase yet.
 *   'active'   — trained within the last 7 days.
 *   'slipping' — last training 8 to 21 days ago. This is the row worth a phone call: still a
 *                member, not yet a lost one.
 *   'gone'     — over 21 days, or never trained and signed up over 14 days ago.
 * The thresholds are deliberately wide: a member who trains twice a week and skips a week is not
 * "slipping", and a list that cries wolf is a list nobody opens.
 */
export function memberStatus({ days, created, now }) {
  if (days == null) {
    const since = daysBetween(created, now);
    return since != null && since <= 14 ? 'new' : 'gone';
  }
  if (days <= 7) return 'active';
  if (days <= 21) return 'slipping';
  return 'gone';
}

/** One row of the members list. `S` is the member's stored state (or null for an empty profile). */
export function memberRow(user, S, now = Date.now()) {
  const workouts = Array.isArray(S?.workouts) ? S.workouts : [];
  const times = workouts.map(workoutTime).filter(t => t != null).sort((a, b) => a - b);
  const last = times.length ? times[times.length - 1] : null;
  const days = daysBetween(last, now);
  const since = n => times.filter(t => t > now - n * DAY).length;
  const routines = (Array.isArray(S?.routines) ? S.routines : [])
    .filter(r => r && typeof r === 'object' && r.id)
    .map(r => ({ id: r.id, name: r.name || '', exercises: Array.isArray(r.ex) ? r.ex.length : 0 }));
  return {
    id: user.id,
    name: user.name,
    created: user.created || null,
    disabled: !!user.disabled,
    workouts: times.length,
    lastWorkout: last,
    days,                                  // whole days since the last session, null if never
    last7: since(7),
    last30: since(30),
    routines,
    status: memberStatus({ days, created: user.created, now })
  };
}

/** The four numbers above the list. Counted from the rows, so they can never disagree with it. */
export function rosterSummary(rows) {
  const count = s => rows.filter(r => r.status === s).length;
  return {
    members: rows.length,
    active: count('active'),
    slipping: count('slipping'),
    gone: count('gone'),
    new: count('new'),
    noRoutine: rows.filter(r => !r.routines.length).length,
    // Sessions logged across the gym in the last 7 days: the one number that says whether the
    // floor is busier than last week.
    sessions7: rows.reduce((n, r) => n + r.last7, 0)
  };
}

/**
 * A copy of one of the owner's routines, ready to drop into a member's profile.
 * The copy gets its own id (two profiles must never share one — the sync merges by id) and is
 * stamped with where it came from, so the member sees "from the gym" rather than a routine that
 * appeared out of nowhere, and a second send replaces the first instead of piling up.
 */
export function routineForMember(routine, { from, now = Date.now(), id = null }) {
  const copy = JSON.parse(JSON.stringify(routine));
  delete copy.deleted;
  return {
    ...copy,
    id: id || 'gym-' + String(routine.id).slice(0, 12) + '-' + now.toString(36),
    assignedBy: from || null,
    assignedAt: now,
    assignedFrom: routine.id
  };
}

/**
 * Where the copy goes in the member's routines: replacing the one sent from the same source
 * before (same `assignedFrom`), otherwise at the end. Without this, re-sending a corrected
 * routine would leave the member with two nearly identical ones and no way to tell them apart.
 */
export function placeRoutine(routines, copy) {
  const list = Array.isArray(routines) ? [...routines] : [];
  const at = list.findIndex(r => r && r.assignedFrom && r.assignedFrom === copy.assignedFrom);
  if (at >= 0) { list[at] = { ...copy, id: list[at].id }; return list; }
  list.push(copy);
  return list;
}
