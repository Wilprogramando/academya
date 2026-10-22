import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { fmtDate } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import '../admin.css'

// The gym floor, as the owner reads it: who is still coming, who is slipping away, and who has
// no routine at all. The Admin dashboard next door answers "who is on this instance" – accounts,
// invites, the activity log. This answers the question that costs money, which is who stopped
// coming, and gives the one action that follows from the answer: send them a routine.
//
// Admin-only, guarded again server-side (GET /api/admin/roster). Like Admin.jsx this is an
// operator surface, not part of the translated end-user app, so it stays out of the string packs
// – every label it shows is in LABELS below, which is also where to translate it in one go.

const LABELS = {
  title: 'Members',
  lead: 'Everyone training here, in the order that needs you. Tap a member to see their last sessions and to send them a routine.',
  members: 'Members',
  active: 'Active',
  slipping: 'Slipping',
  gone: 'Gone',
  sessions: 'Sessions / 7 days',
  search: 'Search a name…',
  all: 'Everyone',
  noRoutine: 'No routine',
  never: 'never trained',
  today: 'trained today',
  yesterday: 'trained yesterday',
  daysAgo: n => `${n} days ago`,
  sessions30: n => `${n} session${n === 1 ? '' : 's'} in 30 days`,
  routines: n => `${n} routine${n === 1 ? '' : 's'}`,
  empty: 'Nobody matches this filter.',
  loading: 'Loading…',
  failed: 'Could not load the members.',
  retry: 'Try again',
  send: 'Send a routine',
  sendLead: 'Pick one of your routines. A copy lands in their profile and syncs to their phone, where they can edit it like their own. Sending a corrected version later replaces this copy instead of adding a second one.',
  noneOfMine: 'You have no routines to send yet. Build one in Plan first – this sends a copy of yours.',
  sent: name => `Routine sent to ${name}`,
  carries: 'Routines they carry',
  none: 'None yet',
  lastSessions: 'Last sessions',
  noSessions: 'No sessions logged yet.',
  since: 'Member since',
  fromGym: 'from the gym'
}

// The four words the floor is read in. The colour is the message: an owner should be able to tell
// a healthy list from a leaking one at arm's length, before reading a single name.
const STATUS = {
  active:   { label: 'active',   pill: 'ok' },
  slipping: { label: 'slipping', pill: 'warn' },
  gone:     { label: 'gone',     pill: 'bad' },
  new:      { label: 'new',      pill: 'acc' }
}

const lastSeen = m => {
  if (m.days == null) return LABELS.never
  if (m.days === 0) return LABELS.today
  if (m.days === 1) return LABELS.yesterday
  return LABELS.daysAgo(m.days)
}

// The order the screen exists for: the ones worth a phone call first (slipping, longest gap at
// the top), then who has nobody chasing them yet, then everyone still coming. Sorting by name
// would be tidier and would bury the only rows that need a decision.
const URGENCY = { slipping: 0, gone: 1, new: 2, active: 3 }
const byUrgency = (a, b) =>
  URGENCY[a.status] - URGENCY[b.status] ||
  (b.days ?? 1e6) - (a.days ?? 1e6) ||
  String(a.name).localeCompare(String(b.name))

function SendRoutineSheet({ member, routines, onSent, close }) {
  const toast = useUI(s => s.toast)
  const [busy, setBusy] = useState(null)
  const send = r => {
    setBusy(r.id)
    api('/api/admin/user/routine', { method: 'POST', body: JSON.stringify({ id: member.id, routineId: r.id }) })
      .then(() => { toast(LABELS.sent(member.name)); onSent(); close() })
      .catch(e => { setBusy(null); toast(e.message || 'Failed') })
  }
  return <>
    <h3>{LABELS.send}</h3>
    <div className="adm-lead">{LABELS.sendLead}</div>
    {!routines.length
      ? <div className="adm-empty">{LABELS.noneOfMine}</div>
      : <div className="list">
          {routines.map(r => <div key={r.id} className="item" onClick={() => !busy && send(r)} style={busy && busy !== r.id ? { opacity: .5 } : null}>
            <div className="grow">
              <div className="tt">{r.emoji ? r.emoji + ' ' : ''}{r.name || '–'}</div>
              <div className="ss">{r.exercises} exercises</div>
            </div>
            {busy === r.id ? <span className="adm-pill acc">sending…</span> : <Icon name="chevronRight" className="chev" />}
          </div>)}
        </div>}
  </>
}

function MemberSheet({ member, routines, reload, close }) {
  const openSheet = useUI(s => s.openSheet)
  const [detail, setDetail] = useState(null)
  useEffect(() => { api('/api/admin/user?id=' + encodeURIComponent(member.id)).then(setDetail).catch(() => {}) }, [member.id])
  const s = STATUS[member.status]
  const sessions = (detail?.workouts || []).slice(0, 8)
  return <>
    <h3>{member.name} <span className={'adm-pill ' + s.pill} style={{ marginInlineStart: 6 }}>{s.label}</span></h3>
    <div className="adm-lead">
      {lastSeen(member)} · {LABELS.sessions30(member.last30)}
      {member.created ? ' · ' + LABELS.since.toLowerCase() + ' ' + fmtDate(member.created) : ''}
    </div>

    <h4 className="sec">{LABELS.carries}</h4>
    {member.routines.length
      ? <div className="list">{member.routines.map(r => <div key={r.id} className="item">
          <div className="grow"><div className="tt">{r.name || '–'}</div>
            <div className="ss">{r.exercises} exercises{String(r.id).startsWith('gym-') ? ' · ' + LABELS.fromGym : ''}</div></div>
        </div>)}</div>
      : <div className="adm-empty">{LABELS.none}</div>}

    <h4 className="sec">{LABELS.lastSessions}</h4>
    {sessions.length
      ? <div className="list">{sessions.map((w, i) => <div key={i} className="item">
          <div className="grow"><div className="tt">{w.name || '–'}</div><div className="ss">{fmtDate(w.d)}</div></div>
        </div>)}</div>
      : <div className="adm-empty">{detail ? LABELS.noSessions : LABELS.loading}</div>}

    <div style={{ marginTop: 14 }}>
      <Button icon="plus" onClick={() => openSheet(c =>
        <SendRoutineSheet member={member} routines={routines} onSent={() => { reload(); close() }} close={c} />)}>
        {LABELS.send}
      </Button>
    </div>
  </>
}

export default function Members() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const openSheet = useUI(s => s.openSheet)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')

  const load = () => api('/api/admin/roster')
    .then(d => {
      if (!Array.isArray(d?.members)) throw new Error('The server answered without a list of members.')
      setData(d); setErr(null)
    })
    .catch(e => setErr(e.message || LABELS.failed))
  useEffect(() => { if (!user?.admin) return; load(); const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [])

  // Every hook runs before the admin check below: an early return above a useMemo would change
  // the hook order the moment `user` arrives, which React refuses mid-render.
  const rows = useMemo(() => {
    const all = [...(data?.members || [])].sort(byUrgency)
    const term = q.trim().toLowerCase()
    return all.filter(m =>
      (!term || String(m.name).toLowerCase().includes(term)) &&
      (!filter || (filter === 'noRoutine' ? !m.routines.length : m.status === filter)))
  }, [data, q, filter])
  if (!user?.admin) return null

  const sum = data?.summary

  const open = m => openSheet(close =>
    <MemberSheet member={m} routines={data?.routines || []} reload={load} close={close} />)

  const chips = [
    ['', LABELS.all, sum?.members],
    ['slipping', LABELS.slipping, sum?.slipping],
    ['gone', LABELS.gone, sum?.gone],
    ['noRoutine', LABELS.noRoutine, sum?.noRoutine],
    ['active', LABELS.active, sum?.active]
  ]

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/admin')} aria-label="Back"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 8 }}><h1 style={{ margin: 0 }}>{LABELS.title}</h1>
        <div className="sub">{sum ? `${sum.members} members · ${sum.sessions7} sessions this week` : err ? 'Could not load' : LABELS.loading}</div></div>
      <button className="iconbtn" onClick={load} aria-label="refresh">↻</button>
    </div>
    <div className="adm-intro">{LABELS.lead}</div>

    {err && <div className="card" role="alert" style={{ borderColor: 'var(--red)' }}>
      <div className="row between"><h2 style={{ margin: 0 }}>{data ? 'The last update failed' : LABELS.failed}</h2>
        <Button size="sm" icon="reset" onClick={load}>{LABELS.retry}</Button></div>
      <div className="adm-lead" style={{ marginBottom: 0 }}>
        {err} {data ? 'The list below is the last one that loaded.' : 'It tries again every 30 seconds.'}
      </div>
    </div>}

    {/* Slipping before active, deliberately: the tiles read left to right as "how many, how many
        need me, how many are leaving, how busy is the floor". */}
    <div className="tiles" style={{ marginBottom: 12 }}>
      <div className="tile"><div className="l">{LABELS.members}</div><div className="v">{sum ? sum.members : '–'}</div></div>
      <div className="tile"><div className="l">{LABELS.slipping}</div><div className="v" style={{ color: sum?.slipping ? 'var(--orange)' : undefined }}>{sum ? sum.slipping : '–'}</div></div>
      <div className="tile"><div className="l">{LABELS.gone}</div><div className="v" style={{ color: sum?.gone ? 'var(--red)' : undefined }}>{sum ? sum.gone : '–'}</div></div>
      <div className="tile"><div className="l">{LABELS.sessions}</div><div className="v">{sum ? sum.sessions7 : '–'}</div></div>
    </div>

    <div className="card">
      <div className="search" style={{ marginBottom: 10 }}>
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input className="input" placeholder={LABELS.search} value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="chips" style={{ marginBottom: 10 }}>
        {chips.map(([v, l, n]) => <button key={v} className={'chip nocap' + (filter === v ? ' on' : '')} onClick={() => setFilter(v)}>
          {l}{n != null ? ' ' + n : ''}
        </button>)}
      </div>

      <div className="list">
        {rows.map(m => {
          const s = STATUS[m.status]
          return <div key={m.id} className="item" onClick={() => open(m)} style={m.disabled ? { opacity: .55 } : null}>
            <div className="grow">
              <div className="tt">{m.name}<span className={'adm-pill ' + s.pill} style={{ marginInlineStart: 6 }}>{s.label}</span></div>
              <div className="ss">{lastSeen(m)} · {LABELS.sessions30(m.last30)} · {m.routines.length ? LABELS.routines(m.routines.length) : LABELS.noRoutine}</div>
            </div>
            <Icon name="chevronRight" className="chev" />
          </div>
        })}
        {data && !rows.length && <div className="adm-empty">{LABELS.empty}</div>}
      </div>
    </div>
  </div>
}
