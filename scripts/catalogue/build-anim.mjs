#!/usr/bin/env node
// Gera catalogue/media/anim/<id>.webp — o WebP animado que a lista de Exercicios mostra em cada
// linha — a partir dos clipes MP4 de catalogue/media/clip.
//
//   node scripts/catalogue/build-anim.mjs            [--size 120] [--q 30] [--force]
//
// Por que um WebP animado e nao o proprio MP4: a lista mostra dezenas de exercicios na mesma tela,
// e um <video> por linha estoura o limite de decodificadores simultaneos de um telefone (no iOS,
// poucos). Um WebP animado e uma imagem: anima sozinha, sem player, e o navegador lida com 40
// delas como lida com 40 fotos.
//
// Por que 120 px e nao os 180 px do clipe: a miniatura e desenhada pequena, e o conjunto inteiro
// pesa ~78 MB a 120 px contra ~157 MB a 180 px. O clipe MP4 continua sendo o que a tela aberta do
// exercicio mostra, em tamanho cheio.
//
// A midia e licenciada da Gym visual para o openGym (catalogue/media/NOTICE.md); o que sai daqui
// herda essa licenca.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const size = arg('size', '120')
const q = arg('q', '30')
const force = process.argv.includes('--force')
const from = path.join(ROOT, 'catalogue/media/clip')
const to = path.join(ROOT, 'catalogue/media/anim')
fs.mkdirSync(to, { recursive: true })

const clips = fs.readdirSync(from).filter(f => f.endsWith('.mp4'))
// Um arquivo ja animado (VP8X com ANMF) e pulado: a conversao inteira leva minutos, e uma
// retomada depois de uma interrupcao nao deve refazer o que ficou pronto. --force refaz tudo.
const animated = f => {
  try { return fs.readFileSync(f).subarray(0, 64).toString('latin1').includes('ANMF') } catch { return false }
}
const todo = clips.filter(f => force || !animated(path.join(to, f.replace(/\.mp4$/, '.webp'))))
console.log(`${clips.length} clipes, ${todo.length} a converter (${size} px, q${q})`)

const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const run = f => new Promise(resolve => {
  const out = path.join(to, f.replace(/\.mp4$/, '.webp'))
  execFile(ffmpeg, ['-y', '-v', 'error', '-i', path.join(from, f),
    '-vf', `scale=${size}:-1:flags=lanczos`, '-loop', '0', '-q:v', q,
    '-compression_level', '6', '-an', out], err => resolve(err ? f : null))
})

// Uma conversao por nucleo: sao 6.554 processos curtos, e em serie levaria quase uma hora.
const workers = Math.max(2, Math.min(os.cpus().length, 12))
let next = 0, done = 0
const failed = []
await Promise.all(Array.from({ length: workers }, async () => {
  while (next < todo.length) {
    const f = todo[next++]
    const bad = await run(f)
    if (bad) failed.push(bad)
    if (++done % 500 === 0) console.log(`  ${done}/${todo.length}`)
  }
}))

const bytes = fs.readdirSync(to).reduce((n, f) => n + fs.statSync(path.join(to, f)).size, 0)
console.log(`anim: ${fs.readdirSync(to).length} arquivos, ${(bytes / 1048576).toFixed(0)} MB${failed.length ? `, ${failed.length} falharam: ${failed.slice(0, 5)}` : ''}`)
if (failed.length) process.exitCode = 1
