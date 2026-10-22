#!/usr/bin/env node
/**
 * Build frontend/src/lib/free-media-map.js — catalogue id -> foto da free-exercise-db.
 *
 *   node scripts/catalogue/build-free-media-map.mjs            # baixa o dataset
 *   node scripts/catalogue/build-free-media-map.mjs ex.json    # usa um arquivo local
 *
 * POR QUE ISTO EXISTE
 * A midia que vem no repositorio (catalogue/media) e licenciada da Gym visual para o openGym e
 * nao pode ir num site de terceiros (catalogue/media/NOTICE.md). A free-exercise-db esta sob
 * Unlicense (dominio publico), entao suas fotos podem. Mas os dois catalogos nao compartilham
 * id nenhum: o casamento tem de ser feito por nome, com equipamento e musculo como prova.
 *
 * O MAPA E GERADO, NAO ADIVINHADO EM TEMPO DE EXECUCAO
 * Mesma escolha do scripts/build-hevy-id-map.mjs: casar nomes no cliente seria instavel e caro.
 * Aqui o casamento roda uma vez, fica revisavel no diff e e deterministico.
 *
 * O CRITERIO E CONSERVADOR DE PROPOSITO
 * Uma foto errada e pior que nenhuma: alguem aprende o movimento errado. Um par so entra se o
 * nome normalizado for identico, ou se um nome contiver o outro com excedente neutro (ver
 * QUALIFIER), ou se a sobreposicao de palavras for alta — e, nos dois ultimos casos, o
 * equipamento tem de ser compativel E o musculo primario tem de bater. Na duvida, fica de fora.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EXDB } from '../../frontend/src/lib/exercises-data.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = join(ROOT, 'frontend/src/lib/free-media-map.js')
const SRC = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'

/* ------------------------------------------------------------------ nomes -- */

// "3/4 Sit-Up" e "3 4 sit up" tem de colidir. Barras, hifens e pontuacao viram espaco; o resto
// cai fora. O plural e normalizado logo abaixo (sing), senao "hammer curl" e "hammer curls"
// nunca se encontram.
const norm = s => String(s || '')
  .toLowerCase()
  .replace(/[/\-_]/g, ' ')
  .replace(/[^a-z0-9 ]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

// Palavras que nao distinguem um exercicio de outro e so inflam a sobreposicao.
const STOP = new Set(['the', 'a', 'an', 'with', 'on', 'in', 'to', 'and', 'of', 'variation'])

// Plural ingenuo: "curl"/"curls", "dip"/"dips", "pulldown"/"pulldowns" sao a mesma palavra aqui.
// So o 's' final, e so em palavras de 4+ letras, para nao transformar "press" em "pres" nem
// mexer em siglas.
const sing = w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
const tokens = s => norm(s).split(' ').filter(w => w && !STOP.has(w)).map(sing)

/* ------------------------------------------------------------ qualificadores */

// O caso que fez a primeira versao deste script render 5%: a free-exercise-db escreve
// "Barbell Bench Press - Medium Grip" onde o openGym escreve "barbell bench press". Por
// sobreposicao de conjuntos isso da 0.6 e era rejeitado, apesar de ser o mesmo exercicio.
//
// A regra agora e: um nome pode conter o outro, desde que TODO excedente seja palavra que nao
// muda o movimento. Duas familias entram aqui:
//   - nomes de equipamento, porque o equipamento ja e verificado a parte (EQ abaixo); dizer
//     "cable lat pulldown" ou "lat pulldown" e a mesma coisa quando os dois sao de cabo.
//   - qualificadores neutros de pegada e nomenclatura.
//
// NAO entram: reverse, close, wide, narrow, front, incline, decline, seated, standing, alternate.
// Essas mudam o exercicio — pegada fechada e aberta no supino sao movimentos diferentes, e uma
// foto errada aqui ensina a fazer errado. Na duvida o par e descartado.
const QUALIFIER = new Set([
  'barbell', 'dumbbell', 'cable', 'machine', 'smith', 'band', 'kettlebell', 'ez', 'bar', 'vbar',
  'plate', 'lever', 'leverage', 'bodyweight', 'weighted', 'olympic', 'trap',
  'medium', 'grip', 'version', 'attachment', 'powerlifting',
])

/* ------------------------------------------------------- equipamento ------- */

// openGym tem 33 equipamentos, a free-exercise-db tem 13. O mapa abaixo diz quais valores do
// openGym podem casar com quais do outro lado. Equipamento que nao tem equivalente (sled machine,
// skierg, macebell, tire...) fica sem entrada: esses exercicios nunca casam, que e o certo.
const EQ = {
  'body weight': ['body only'],
  assisted: ['machine', 'other', 'body only'],
  band: ['bands'],
  'resistance band': ['bands'],
  barbell: ['barbell'],
  'olympic barbell': ['barbell'],
  'ez barbell': ['e-z curl bar', 'barbell'],
  'trap bar': ['barbell'],
  cable: ['cable'],
  dumbbell: ['dumbbell'],
  kettlebell: ['kettlebells'],
  'leverage machine': ['machine'],
  'smith machine': ['machine', 'barbell'],
  hammer: ['machine'],
  'medicine ball': ['medicine ball'],
  'stability ball': ['exercise ball'],
  'bosu ball': ['exercise ball'],
  roller: ['foam roll'],
  'wheel roller': ['foam roll', 'other'],
  rope: ['other'],
  'weight plate': ['other', 'barbell'],
  weighted: ['other'],
  'suspension trainer': ['other', 'body only'],
  landmine: ['barbell'],
  sandbag: ['other'],
}

/* ------------------------------------------------------------ musculos ----- */

// Musculo ALVO do openGym (tg) -> primaryMuscles da free-exercise-db.
//
// Tem de ser `tg`, nao `mg`. Essa confusao fez a primeira versao deste script render 5%: no
// catalogo do openGym `mg` e o sinergista, nao o alvo — "barbell bench press" traz mg:"triceps",
// e comparar isso com o primaryMuscles "chest" do outro lado rejeitava o supino, a rosca direta,
// a remada curvada e praticamente todo exercicio basico.
const TG = {
  pectorals: 'chest',
  lats: 'lats',
  'upper back': 'middle back',
  traps: 'traps',
  'levator scapulae': 'neck',
  delts: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  abs: 'abdominals',
  'serratus anterior': 'abdominals',
  spine: 'lower back',
  glutes: 'glutes',
  quads: 'quadriceps',
  hamstrings: 'hamstrings',
  calves: 'calves',
  adductors: 'adductors',
  abductors: 'abductors',
  // 'cardiovascular system' nao tem equivalente do outro lado: esses casam so por nome identico.
}
const muscleOf = ex => TG[ex.tg] || null

/* ------------------------------------------------------------ casamento ---- */

/**
 * Quao bom e o par (0 = descartar). Dois criterios, nesta ordem:
 *
 * 1. CONTENCAO COM EXCEDENTE NEUTRO — o criterio que pega os exercicios comuns. Um dos nomes
 *    contem o outro inteiro, e tudo o que sobra esta em QUALIFIER. "barbell bench press" dentro
 *    de "barbell bench press medium grip" passa; dentro de "barbell incline bench press" nao,
 *    porque "incline" nao e neutro.
 * 2. SOBREPOSICAO ALTA — rede de seguranca para ordem de palavras diferente
 *    ("kettlebell open palm clean" vs "open palm kettlebell clean").
 */
const score = (a, b) => {
  const A = new Set(a), B = new Set(b)
  let hit = 0
  for (const w of A) if (B.has(w)) hit++
  const small = Math.min(A.size, B.size)
  if (!small) return 0
  if (hit === small) {
    const [big, sml] = A.size >= B.size ? [A, B] : [B, A]
    const extra = [...big].filter(w => !sml.has(w))
    // Contencao limpa vale mais que qualquer sobreposicao parcial.
    if (extra.every(w => QUALIFIER.has(w))) return 1 + (1 / (1 + extra.length))
  }
  return hit / (A.size + B.size - hit)
}

function buildMap(free) {
  const withImg = free.filter(f => f.images && f.images.length)
  // Indice por nome normalizado para o caminho rapido (e o mais confiavel).
  const byName = new Map()
  for (const f of withImg) if (!byName.has(norm(f.name))) byName.set(norm(f.name), f)

  const prepared = withImg.map(f => ({ f, tok: tokens(f.name) }))
  const map = {}
  const stats = { exact: 0, fuzzy: 0, none: 0 }

  for (const ex of EXDB) {
    const n = norm(ex.n)
    const exact = byName.get(n)
    if (exact) { map[ex.id] = exact.images[0]; stats.exact++; continue }

    const tok = tokens(ex.n)
    const okEq = EQ[ex.eq] || null
    const mg = muscleOf(ex)
    // Sem equivalente de equipamento nao ha como provar o par: nao arrisca.
    if (!okEq || !tok.length) { stats.none++; continue }

    let best = null, bestScore = 0
    for (const { f, tok: ftok } of prepared) {
      if (!okEq.includes(f.equipment)) continue
      if (mg && !(f.primaryMuscles || []).includes(mg)) continue
      const s = score(tok, ftok)
      if (s > bestScore) { bestScore = s; best = f }
    }
    // 0.7 exige praticamente o mesmo conjunto de palavras — uma de diferenca num nome de tres.
    // Abaixo disso o par e palpite, e um palpite aqui ensina o movimento errado.
    if (best && bestScore >= 0.7) { map[ex.id] = best.images[0]; stats.fuzzy++ }
    else stats.none++
  }
  return { map, stats, pool: withImg.length }
}

/* ----------------------------------------------------------------- saida --- */

const arg = process.argv[2]
const free = arg && existsSync(arg)
  ? JSON.parse(readFileSync(arg, 'utf8'))
  : await (await fetch(SRC)).json()

const { map, stats, pool } = buildMap(free)
const n = Object.keys(map).length
const pct = (n / EXDB.length * 100).toFixed(1)

const body = `// generated by scripts/catalogue/build-free-media-map.mjs — do not edit
//
// Catalogue id -> caminho da foto na free-exercise-db (Unlicense / dominio publico).
// Cobertura: ${n} de ${EXDB.length} exercicios (${pct}%), de um conjunto de ${pool} fotos.
// Os demais nao tem foto: as telas ja tratam "exercicio sem midia" (ver Media.jsx).
export const FREE_MEDIA = ${JSON.stringify(map)}
`
writeFileSync(OUT, body)

console.log(`free-exercise-db: ${pool} exercicios com foto`)
console.log(`casados por nome identico: ${stats.exact}`)
console.log(`casados por sobreposicao:  ${stats.fuzzy}`)
console.log(`sem foto:                  ${stats.none}`)
console.log(`cobertura: ${n}/${EXDB.length} (${pct}%) -> ${OUT}`)
