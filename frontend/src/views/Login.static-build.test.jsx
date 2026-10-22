// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Login from './Login.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* A tela de entrada do build estatico (VITE_STATIC=1, o que roda no Vercel).
   Nao ha API para autenticar contra, entao a unica porta e o perfil local — e, diferente do build
   de demo, nada de dados de exemplo nem da palavra "demo": e o app de verdade, guardado neste
   navegador. O que este teste prende e justamente o que uma tela sem backend nao pode mostrar:
   nenhum caminho que dependa do servidor, porque todos levariam a um erro de rede. */
const mocks = vi.hoisted(() => {
  const state = { webauthn: true, config: null, setGuest: vi.fn() }
  state.snapshot = () => ({
    config: state.config, S: {},
    setUser: vi.fn(), adoptProfile: vi.fn(), setGuest: state.setGuest, loadConfig: vi.fn(async () => state.config),
    pushState: vi.fn(), pullState: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({
  webauthnOK: () => mocks.webauthn, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(),
  BIO: 'your fingerprint', bio: () => 'your fingerprint',
  api: vi.fn(), passkeyAssertion: vi.fn(), passwordLogin: vi.fn(), passwordRegister: vi.fn(), passwordResetRedeem: vi.fn(),
}))
// O build estatico: STATIC_BUILD ligado, DEMO desligado — a combinacao que o flag existe para
// distinguir. Com os dois ligados seria o demo, que semeia historico de exemplo.
vi.mock('../lib/demo.js', () => ({ DEMO: false, STATIC_BUILD: true, NO_BACKEND: true, REPO: 'https://example.invalid' }))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn(), confirmSheet: vi.fn() }))

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
afterEach(() => {
  while (mounted.length) { const { root, host } = mounted.pop(); act(() => root.unmount()); host.remove() }
  mocks.webauthn = true
  mocks.setGuest.mockClear()
})

describe('a tela de entrada do build estatico', () => {
  it('oferece uma entrada local e nenhum caminho que precise do servidor', () => {
    const host = mount(<Login />)
    const text = host.textContent

    // Nada de passkey, senha, criacao de perfil no servidor ou codigo de outro dispositivo.
    expect(text).not.toMatch(/passkey/i)
    expect(text).not.toMatch(/password/i)
    expect(text).not.toMatch(/Create new profile/i)
    expect(text).not.toMatch(/code from your other device/i)
    // Nem a palavra "demo": este build nao e o demo.
    expect(text).not.toMatch(/demo/i)

    // E a porta local esta la, e e ela que entra como visitante.
    const start = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')
    expect(start, 'o botao de entrada local').toBeTruthy()
    act(() => start.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(mocks.setGuest).toHaveBeenCalledWith(true)
  })

  it('nao muda de conversa num navegador sem suporte a passkey: nao havia passkey a oferecer', () => {
    // No build normal, webauthnOK() falso troca a tela toda (senha, ou um aviso de que nao ha
    // como entrar). Aqui nao ha servidor em nenhum dos casos, entao a tela e a mesma.
    mocks.webauthn = false
    const host = mount(<Login />)
    expect(host.textContent).not.toMatch(/passkey/i)
    expect([...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')).toBeTruthy()
  })
})
