import { afterEach, describe, expect, it, vi } from 'vitest'

// A animacao leve que a lista de Exercicios mostra em cada linha: um WebP animado por exercicio,
// nomeado pelo id (ou pelo desenho da figura escolhida), em exercise-media/anim/.
describe('animSrc', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
  const ex = { id: '0025', img: '0025.webp', gif: '0025.mp4', fv: '2440' }

  it('names the exercise animation by id', async () => {
    const { animSrc } = await import('./exercises.js')
    expect(animSrc(ex, 'male')).toBe('exercise-media/anim/0025.webp')
  })

  it('follows the chosen figure', async () => {
    const { animSrc } = await import('./exercises.js')
    expect(animSrc(ex, 'female')).toBe('exercise-media/anim/2440.webp')
    // desenhado uma vez so: a mesma animacao nas duas figuras
    expect(animSrc({ ...ex, fv: undefined }, 'female')).toBe('exercise-media/anim/0025.webp')
  })

  it('has none without catalogue media, and none for an exercise without media', async () => {
    const { animSrc } = await import('./exercises.js')
    expect(animSrc({ id: 'c1' }, 'male')).toBe(null)
    vi.resetModules()
    vi.stubEnv('VITE_MEDIA', 'none')
    expect((await import('./exercises.js')).animSrc(ex, 'male')).toBe(null)
    vi.resetModules()
    vi.stubEnv('VITE_MEDIA', 'free')
    expect((await import('./exercises.js')).animSrc(ex, 'male')).toBe(null)
  })
})
