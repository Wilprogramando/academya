// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// A miniatura mostra a animacao do exercicio; se ela nao carregar (offline e nunca em cache, uma
// sessao vencida numa instancia fechada), cai para a foto parada, e se essa tambem falhar, para o
// tile neutro de um exercicio sem midia — nunca o icone de imagem quebrada do navegador (#281).
vi.mock('../store/useStore.js', () => ({ useStore: () => null }))
const { Thumb } = await import('./Media.jsx')

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return { host, root }
}
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('Thumb', () => {
  it('animates, falls back to the still, then to the neutral tile', () => {
    const { host } = mount(<Thumb ex={{ id: 'a', img: 'a.jpg' }} />)
    const img = host.querySelector('img.thumb')
    expect(img.getAttribute('src')).toBe('exercise-media/anim/a.webp')
    act(() => { img.dispatchEvent(new Event('error')) })
    expect(host.querySelector('img.thumb').getAttribute('src')).toMatch(/a\.jpg$/)
    act(() => { host.querySelector('img.thumb').dispatchEvent(new Event('error')) })
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('.thumb.thumb-x')).toBeTruthy()
  })

  it('another exercise in the same place tries its own media', () => {
    const { host, root } = mount(<Thumb ex={{ id: 'a', img: 'a.jpg' }} />)
    act(() => { host.querySelector('img').dispatchEvent(new Event('error')) })
    act(() => { host.querySelector('img').dispatchEvent(new Event('error')) })
    act(() => root.render(<Thumb ex={{ id: 'b', img: 'b.jpg' }} />))
    expect(host.querySelector('img.thumb').getAttribute('src')).toBe('exercise-media/anim/b.webp')
  })

  it('an exercise without media has the tile from the start', () => {
    const { host } = mount(<Thumb ex={{ id: 'c' }} />)
    expect(host.querySelector('.thumb-x')).toBeTruthy()
  })
})
