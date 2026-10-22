import { afterEach, describe, expect, it, vi } from 'vitest'

/* De onde vem a midia dos exercicios (VITE_MEDIA). Quatro modos, e cada um existe por um motivo:
   'bundled' e o que roda local e self-hosted (video + foto da Gym visual, 100% do catalogo);
   'anim' e o deploy estatico (so os WebP animados, 49 MB, 100% do catalogo animado, e a propria
   animacao faz de foto); 'free' sao fotos de dominio publico por CDN, so parte do catalogo e sem
   video, para quem nao puder publicar a midia da Gym visual (catalogue/media/NOTICE.md);
   'none' e o app sem midia nenhuma.

   O que estes testes prendem e o contrato que as telas assumem: uma URL que nao existe nunca e
   montada. Sem isso cada exercicio sem foto faria requisicoes 404 antes de cair no estado
   "sem midia", com piscada, e o prefetch do service worker encheria o cache de erros. */

const fresh = async () => { vi.resetModules(); return import('./exercises.js') }
const withMedia = db => Object.values(db).find(e => e.img && e.gif)

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('VITE_MEDIA=bundled (padrao: local e self-hosted)', () => {
  it('monta as URLs dos arquivos que vem no repositorio', async () => {
    const { imgSrc, gifSrc, CATALOGUE_MEDIA, EXIDX } = await fresh()
    expect(CATALOGUE_MEDIA).toBe(true)
    const ex = withMedia(EXIDX)
    expect(imgSrc(ex, 'male')).toMatch(/^exercise-media\/still\/.+\.webp$/)
    expect(gifSrc(ex, 'male')).toMatch(/^exercise-media\/clip\/.+\.mp4$/)
  })
})

describe('VITE_MEDIA=none', () => {
  it('nao monta URL nenhuma', async () => {
    vi.stubEnv('VITE_MEDIA', 'none')
    const { imgSrc, gifSrc, CATALOGUE_MEDIA, EXIDX } = await fresh()
    expect(CATALOGUE_MEDIA).toBe(false)
    const ex = withMedia(EXIDX)
    expect(imgSrc(ex, 'male')).toBeNull()
    expect(gifSrc(ex, 'male')).toBeNull()
  })
})

describe('VITE_MEDIA=free (site publico)', () => {
  it('da foto por CDN aos exercicios mapeados e nada aos demais', async () => {
    vi.stubEnv('VITE_MEDIA', 'free')
    const { imgSrc, gifSrc, EXIDX } = await fresh()
    const { FREE_MEDIA } = await import('./free-media-map.js')

    const mapped = Object.keys(FREE_MEDIA)
    expect(mapped.length, 'o mapa nao pode estar vazio').toBeGreaterThan(100)

    const comFoto = EXIDX[mapped[0]]
    expect(imgSrc(comFoto, 'male')).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/gh\/yuhonas\/free-exercise-db@main\/exercises\/.+/)

    // Um exercicio fora do mapa nao recebe URL inventada.
    const semFoto = Object.values(EXIDX).find(e => e.img && !FREE_MEDIA[e.id])
    expect(semFoto, 'ha exercicios fora do mapa').toBeTruthy()
    expect(imgSrc(semFoto, 'male')).toBeNull()
  })

  it('nao promete animacao: a free-exercise-db e um conjunto de fotos', async () => {
    vi.stubEnv('VITE_MEDIA', 'free')
    const { gifSrc, EXIDX } = await fresh()
    const { FREE_MEDIA } = await import('./free-media-map.js')
    // Mesmo para um exercicio que TEM foto mapeada, nao existe clipe — e as telas leem esse null
    // para mostrar a foto parada em vez do controle de pausa (Media.jsx).
    expect(gifSrc(EXIDX[Object.keys(FREE_MEDIA)[0]], 'male')).toBeNull()
    expect(gifSrc(withMedia(EXIDX), 'male')).toBeNull()
  })
})

describe('VITE_MEDIA=anim (deploy estatico)', () => {
  it('da a animacao leve a todo o catalogo, e ela mesma faz de foto', async () => {
    vi.stubEnv('VITE_MEDIA', 'anim')
    const { imgSrc, gifSrc, animSrc, CATALOGUE_MEDIA, EXIDX } = await fresh()
    expect(CATALOGUE_MEDIA).toBe(true)
    const ex = withMedia(EXIDX)
    expect(animSrc(ex, 'male')).toMatch(/^exercise-media\/anim\/.+\.webp$/)
    // A foto e a propria animacao: um WebP animado e uma imagem comum. Uma URL em still/ aqui
    // seria 404 — o deploy estatico publica apenas anim/ (.vercelignore).
    expect(imgSrc(ex, 'male')).toBe(animSrc(ex, 'male'))
    // E nenhum clipe: os MP4 nao sobem, e pedir um seria 404 por exercicio.
    expect(gifSrc(ex, 'male')).toBeNull()
  })

  it('nao tem animacao para um exercicio sem midia', async () => {
    vi.stubEnv('VITE_MEDIA', 'anim')
    const { imgSrc, animSrc } = await fresh()
    expect(animSrc({ id: 'c1' }, 'male')).toBeNull()
    expect(imgSrc({ id: 'c1' }, 'male')).toBeNull()
  })
})

describe('uma origem propria ganha do modo do arquivo', () => {
  it('VITE_GIF_BASE religa a midia mesmo com VITE_MEDIA=free no .env.static', async () => {
    // O caso real: o .env.static fixa o modo, e depois alguem configura no Vercel um bucket com
    // os videos filmados na propria academia. A origem configurada tem de ganhar.
    vi.stubEnv('VITE_MEDIA', 'free')
    vi.stubEnv('VITE_GIF_BASE', 'https://midia.example/clip/')
    const { gifSrc, imgSrc, EXIDX } = await fresh()
    const ex = withMedia(EXIDX)
    expect(gifSrc(ex, 'male')).toMatch(/^https:\/\/midia\.example\/clip\/.+\.mp4$/)
    expect(imgSrc(ex, 'male')).toMatch(/^exercise-media\/still\//)
  })
})
