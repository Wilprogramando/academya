/* The members dashboard end to end: GET /api/admin/roster reads every profile on the instance,
   and POST /api/admin/user/routine writes into somebody else's. The write is the one worth a
   spawned server rather than a unit test — it has to leave the member's document in the shape
   their next sync accepts (a bumped `_rev`, a stamp of its own), and the way to be sure of that
   is to let the real server.js write it and read the file back off disk. Roster.js's own
   arithmetic is pinned in roster.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');

function mintSession(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
const OWNER = 'u_owner', ANA = 'u_ana', BRUNO = 'u_bruno', CARLA = 'u_carla';
const asOwner = { Cookie: `gymsid=${mintSession(OWNER)}`, 'Content-Type': 'application/json' };
const asAna = { Cookie: `gymsid=${mintSession(ANA)}`, 'Content-Type': 'application/json' };

const day = 86400000;
const dateDaysAgo = n => new Date(Date.now() - n * day).toISOString().slice(0, 10);

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-roster-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: OWNER, name: 'Dona da academia', created: new Date(Date.now() - 400 * day).toISOString(), admin: true },
      { id: ANA, name: 'Ana', created: new Date(Date.now() - 300 * day).toISOString() },
      { id: BRUNO, name: 'Bruno', created: new Date(Date.now() - 300 * day).toISOString() },
      { id: CARLA, name: 'Carla', created: new Date(Date.now() - 2 * day).toISOString() }
    ], creds: [], subs: [], invites: []
  }));
  // O dono tem as fichas; Ana treina, Bruno sumiu, Carla acabou de se matricular.
  const write = (uid, S) => fs.writeFileSync(path.join(dataDir, `state-${uid}.json`), JSON.stringify(S));
  write(OWNER, { _rev: 3, routines: [{ id: 'r1', name: 'Treino A', emoji: '💪', ex: [{ id: '0025', sets: 4 }] }], workouts: [] });
  write(ANA, { _rev: 7, workouts: [{ id: 'w1', name: 'A', d: dateDaysAgo(1) }, { id: 'w2', name: 'A', d: dateDaysAgo(5) }], routines: [{ id: 'own', name: 'A minha' }] });
  write(BRUNO, { _rev: 2, workouts: [{ id: 'w9', name: 'A', d: dateDaysAgo(45) }], routines: [] });

  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost' }
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.port = await boundPort(child, () => h.log);
  h.api = `http://127.0.0.1:${h.port}`;
  h.get = async (p, headers = asOwner) => {
    const r = await fetch(`${h.api}${p}`, { headers });
    return { status: r.status, body: await r.json() };
  };
  h.post = async (p, data, headers = asOwner) => {
    const r = await fetch(`${h.api}${p}`, { method: 'POST', headers: { ...headers, Origin: 'http://localhost:8080' }, body: JSON.stringify(data) });
    return { status: r.status, body: await r.json() };
  };
  h.stateOf = uid => JSON.parse(fs.readFileSync(path.join(h.dataDir, `state-${uid}.json`), 'utf8'));
  return h;
}

test('the roster is the floor, not the account list', async t => {
  const h = await startServer(t);
  const { status, body } = await h.get('/api/admin/roster');
  assert.equal(status, 200);

  const byId = Object.fromEntries(body.members.map(m => [m.id, m]));
  assert.equal(body.members.length, 3, 'o dono nao aparece como aluno da propria lista');
  assert.equal(byId[OWNER], undefined);

  assert.equal(byId[ANA].status, 'active');
  assert.equal(byId[ANA].days, 1);
  assert.equal(byId[ANA].last7, 2);
  assert.equal(byId[BRUNO].status, 'gone');
  assert.equal(byId[CARLA].status, 'new', 'matriculada ha 2 dias e ainda sem treino');
  assert.equal(byId[CARLA].workouts, 0, 'um aluno sem arquivo de estado nao quebra a lista');

  assert.deepEqual(body.summary, { members: 3, active: 1, slipping: 0, gone: 1, new: 1, noRoutine: 2, sessions7: 2 });
  // As fichas do dono viajam junto: mandar uma e o que a tela faz em seguida.
  assert.deepEqual(body.routines, [{ id: 'r1', name: 'Treino A', emoji: '💪', exercises: 1 }]);
});

test('a member cannot read the roster', async t => {
  const h = await startServer(t);
  assert.equal((await h.get('/api/admin/roster', asAna)).status, 403);
  assert.equal((await h.get('/api/admin/roster', {})).status, 401);
});

test('sending a routine lands in the member profile, ready for their next sync', async t => {
  const h = await startServer(t);
  const before = h.stateOf(ANA);
  const { status, body } = await h.post('/api/admin/user/routine', { id: ANA, routineId: 'r1' });
  assert.equal(status, 200);
  assert.equal(body.ok, true);

  const after = h.stateOf(ANA);
  assert.ok(after._rev > before._rev, 'a revisao anda, senao o celular dela nunca le o arquivo de novo');
  assert.ok(after._wid && after._wid !== before._wid, 'cada escrita tem a sua id');
  assert.equal(after.routines.length, 2, 'a ficha dela continua la');
  const enviada = after.routines.find(r => r.assignedFrom === 'r1');
  assert.ok(enviada, 'a copia diz de onde veio');
  assert.equal(enviada.name, 'Treino A');
  assert.equal(enviada.assignedBy, 'Dona da academia');
  assert.notEqual(enviada.id, 'r1', 'id proprio: dois perfis nunca compartilham um');
  assert.deepEqual(after.workouts, before.workouts, 'o treino registrado dela nao e tocado');
  // A ficha do dono nao mudou: o que foi para a aluna e uma copia.
  assert.equal(h.stateOf(OWNER).routines.length, 1);

  // Reenviar substitui, em vez de empilhar uma segunda quase igual.
  await h.post('/api/admin/user/routine', { id: ANA, routineId: 'r1' });
  const depois = h.stateOf(ANA);
  assert.equal(depois.routines.length, 2);
  assert.equal(depois.routines.find(r => r.assignedFrom === 'r1').id, enviada.id, 'mantem a id que ela ja sincronizou');
});

test('a profile that never synced still receives its first routine', async t => {
  const h = await startServer(t);
  assert.equal(fs.existsSync(path.join(h.dataDir, `state-${CARLA}.json`)), false);
  const { status } = await h.post('/api/admin/user/routine', { id: CARLA, routineId: 'r1' });
  assert.equal(status, 200);
  const S = h.stateOf(CARLA);
  assert.equal(S.routines.length, 1);
  assert.equal(S._rev, 1);
});

test('what the route refuses', async t => {
  const h = await startServer(t);
  assert.equal((await h.post('/api/admin/user/routine', { id: 'fantasma', routineId: 'r1' })).status, 404);
  assert.equal((await h.post('/api/admin/user/routine', { id: ANA, routineId: 'nao-existe' })).status, 404);
  assert.equal((await h.post('/api/admin/user/routine', { id: OWNER, routineId: 'r1' })).status, 400, 'nao se manda ficha para um admin');
  assert.equal((await h.post('/api/admin/user/routine', { id: BRUNO, routineId: 'r1' }, asAna)).status, 403, 'aluno nao manda ficha para aluno');
  // A recusa nao pode ter mexido em nada.
  assert.equal(h.stateOf(BRUNO).routines.length, 0);
});
