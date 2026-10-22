import { afterEach, describe, expect, it, vi } from 'vitest'

/* Um build sem a midia do catalogo (VITE_MEDIA=none): o deploy publico sob outra marca nao pode
   levar os arquivos da Gym visual, que sao licenciados para o openGym (catalogue/media/NOTICE.md).
   O que este teste prende e que a ausencia e dita UMA vez, na origem: imgSrc e gifSrc devolvem
   null, e por isso nenhuma tela chega a pedir um arquivo que nao existe. Sem isso cada um dos
   1.324 exercicios faria duas requisicoes 404 antes de cair no tile neutro, e o prefetch do
   service worker encheria o cache de erros. */

// O flag e lido na carga do modulo, entao cada caso precisa de uma importacao propria.
const freshExercises = async () => {
  vi.resetModules()
  return import('./exercises.js')
}

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('build sem a midia do catalogo', () => {
  it('nao monta URL nenhuma: imgSrc e gifSrc devolvem null', async () => {
    vi.stubEnv('VITE_MEDIA', 'none')
    const { imgSrc, gifSrc, CATALOGUE_MEDIA, EXIDX } = await freshExercises()
    expect(CATALOGUE_MEDIA).toBe(false)

    // Um exercicio real do catalogo, com foto e animacao — justamente o caso que pediria os dois.
    const ex = Object.values(EXIDX).find(e => e.img && e.gif)
    expect(ex, 'um exercicio do catalogo com midia').toBeTruthy()
    expect(imgSrc(ex, 'male')).toBeNull()
    expect(gifSrc(ex, 'male')).toBeNull()
    // Tambem para os desenhados nas duas figuras, que passam por outro ramo (drawing()).
    const both = Object.values(EXIDX).find(e => e.fv || e.mv)
    if (both) {
      expect(imgSrc(both, 'female')).toBeNull()
      expect(gifSrc(both, 'female')).toBeNull()
    }
  })

  it('apontar uma origem propria religa a midia, mesmo com VITE_MEDIA=none', async () => {
    // O caso real: o .env.static traz VITE_MEDIA=none, e depois alguem configura no Vercel um
    // bucket com os videos proprios. A origem configurada tem de ganhar do padrao do arquivo.
    vi.stubEnv('VITE_MEDIA', 'none')
    vi.stubEnv('VITE_GIF_BASE', 'https://midia.example/clip/')
    const { gifSrc, imgSrc, CATALOGUE_MEDIA, EXIDX } = await freshExercises()
    expect(CATALOGUE_MEDIA).toBe(true)
    const ex = Object.values(EXIDX).find(e => e.img && e.gif)
    expect(gifSrc(ex, 'male')).toMatch(/^https:\/\/midia\.example\/clip\/.+\.mp4$/)
    expect(imgSrc(ex, 'male')).toBeTruthy()
  })

  it('o build normal segue intocado: as URLs continuam saindo', async () => {
    const { imgSrc, gifSrc, CATALOGUE_MEDIA, EXIDX } = await freshExercises()
    expect(CATALOGUE_MEDIA).toBe(true)
    const ex = Object.values(EXIDX).find(e => e.img && e.gif)
    expect(imgSrc(ex, 'male')).toMatch(/^exercise-media\/still\/.+\.webp$/)
    expect(gifSrc(ex, 'male')).toMatch(/^exercise-media\/clip\/.+\.mp4$/)
  })
})
