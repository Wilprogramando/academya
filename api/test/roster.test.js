import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, memberStatus, memberRow, rosterSummary, routineForMember, placeRoutine } from '../roster.js';

const day = 86400000;
// A fixed afternoon, so "today" and "yesterday" are not whatever the suite happens to run at.
const NOW = new Date('2026-03-18T15:00:00').getTime();
const daysAgo = n => new Date(NOW - n * day).toISOString().slice(0, 10);
const member = (over = {}) => ({ id: 'u1', name: 'Ana', created: NOW - 200 * day, ...over });

describe('days are counted by calendar day, not by 24 h blocks', () => {
  it('last night and this morning are both today', () => {
    const lastNight = new Date('2026-03-18T22:30:00').getTime() - day;   // ontem à noite
    const thisMorning = new Date('2026-03-18T06:10:00').getTime();
    assert.equal(daysBetween(thisMorning, NOW), 0);
    assert.equal(daysBetween(lastNight, NOW), 1);
  });

  it('has no answer for a member who never trained', () => {
    assert.equal(daysBetween(null, NOW), null);
  });
});

describe('where a member stands', () => {
  const at = (days, created = NOW - 200 * day) => memberStatus({ days, created, now: NOW });

  it('reads the gaps the way a gym does', () => {
    assert.equal(at(0), 'active');
    assert.equal(at(7), 'active');
    assert.equal(at(8), 'slipping');
    assert.equal(at(21), 'slipping');
    assert.equal(at(22), 'gone');
  });

  it('does not chase someone who signed up last week', () => {
    assert.equal(at(null, NOW - 3 * day), 'new');
    assert.equal(at(null, NOW - 14 * day), 'new');
    // passados os 14 dias sem nenhum treino, é alguém que se matriculou e não voltou
    assert.equal(at(null, NOW - 15 * day), 'gone');
  });
});

describe('one row per member', () => {
  const S = {
    workouts: [
      { d: daysAgo(40), name: 'A' },
      { d: daysAgo(9), name: 'A' },
      { d: daysAgo(2), name: 'B' },
      { d: 'não é uma data', name: 'ruim' }
    ],
    routines: [
      { id: 'r1', name: 'Treino A', ex: [{ id: '0025' }, { id: '0001' }] },
      { id: 'r2', name: 'Treino B', ex: [] },
      null
    ]
  };

  it('conta sessões por janela e ignora entrada quebrada', () => {
    const row = memberRow(member(), S, NOW);
    assert.equal(row.workouts, 3);          // a entrada sem data não vira treino
    assert.equal(row.days, 2);
    assert.equal(row.last7, 1);
    assert.equal(row.last30, 2);
    assert.equal(row.status, 'active');
    assert.deepEqual(row.routines, [
      { id: 'r1', name: 'Treino A', exercises: 2 },
      { id: 'r2', name: 'Treino B', exercises: 0 }
    ]);
  });

  it('um perfil vazio não quebra a linha', () => {
    const row = memberRow(member({ created: NOW - 2 * day }), null, NOW);
    assert.equal(row.workouts, 0);
    assert.equal(row.days, null);
    assert.equal(row.routines.length, 0);
    assert.equal(row.status, 'new');
  });
});

describe('os números acima da lista', () => {
  it('são contados das próprias linhas', () => {
    const rows = [
      memberRow(member({ id: 'a' }), { workouts: [{ d: daysAgo(1) }, { d: daysAgo(4) }] }, NOW),
      memberRow(member({ id: 'b' }), { workouts: [{ d: daysAgo(12) }], routines: [{ id: 'r', name: 'A' }] }, NOW),
      memberRow(member({ id: 'c' }), { workouts: [{ d: daysAgo(60) }] }, NOW),
      memberRow(member({ id: 'd', created: NOW - 3 * day }), null, NOW)
    ];
    assert.deepEqual(rosterSummary(rows), {
      members: 4, active: 1, slipping: 1, gone: 1, new: 1,
      noRoutine: 3, sessions7: 2
    });
  });
});

describe('mandar uma ficha para o aluno', () => {
  const origem = { id: 'r1', name: 'Treino A', ex: [{ id: '0025', sets: 4 }], deleted: true };

  it('a cópia é independente e diz de onde veio', () => {
    const copia = routineForMember(origem, { from: 'Prof. Silva', now: NOW });
    assert.notEqual(copia.id, origem.id);
    assert.equal(copia.name, 'Treino A');
    assert.equal(copia.assignedFrom, 'r1');
    assert.equal(copia.assignedBy, 'Prof. Silva');
    assert.equal(copia.deleted, undefined);       // uma ficha apagada no professor não chega apagada
    copia.ex[0].sets = 9;
    assert.equal(origem.ex[0].sets, 4);           // cópia profunda: editar uma não mexe na outra
  });

  it('reenviar substitui a anterior, mantendo o id que o aluno já tem', () => {
    const copia1 = routineForMember(origem, { from: 'Prof', now: NOW });
    const lista1 = placeRoutine([{ id: 'propria', name: 'Minha' }], copia1);
    assert.equal(lista1.length, 2);

    const copia2 = routineForMember({ ...origem, name: 'Treino A (corrigido)' }, { from: 'Prof', now: NOW + day });
    const lista2 = placeRoutine(lista1, copia2);
    assert.equal(lista2.length, 2, 'não acumula uma segunda cópia');
    assert.equal(lista2[1].name, 'Treino A (corrigido)');
    assert.equal(lista2[1].id, copia1.id, 'mantém o id que o aluno já sincronizou');
    assert.equal(lista2[0].name, 'Minha', 'a ficha do próprio aluno fica onde está');
  });

  it('uma ficha de outra origem entra ao lado, não por cima', () => {
    const a = routineForMember({ id: 'r1', name: 'A' }, { from: 'Prof', now: NOW });
    const b = routineForMember({ id: 'r2', name: 'B' }, { from: 'Prof', now: NOW });
    const lista = placeRoutine(placeRoutine([], a), b);
    assert.deepEqual(lista.map(r => r.name), ['A', 'B']);
  });
});
