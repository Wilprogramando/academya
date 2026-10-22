// Demo build (VITE_DEMO=1) — what runs on the GitHub Pages deployment.
//
// Pages can only serve static files, so there is no API: passkey sign-in, per-profile sync
// and the admin dashboard all need the Node backend and are simply not part of a demo build.
// The app therefore stays in guest mode (everything in localStorage) and boots with a seeded
// example history (demoSeed.js), so the charts, heatmap, streaks and "last time you lifted…"
// pre-fills have something to show instead of an empty shell.
//
// Only these three constants are shared with normal builds: Vite replaces VITE_DEMO at build
// time, so the demo-only UI folds away and the seed generator — imported dynamically — never
// lands in a self-hosted bundle.
export const DEMO = import.meta.env.VITE_DEMO === '1'
export const DEMO_SEEDED = 'gym_demo_seeded_v1'
export const REPO = 'https://gitlab.com/DuarteSantos8/opengym'

// Build estatico (VITE_STATIC=1) — o que roda no Vercel.
//
// Mesma situacao do demo quanto ao backend (hospedagem de arquivos estaticos, sem a API Node),
// com UMA diferenca que e a razao deste flag existir: o demo semeia um historico de exemplo
// (useStore boot + demoSeed.js) para os graficos terem o que mostrar. Num app de verdade isso
// seria um historico falso na conta de cada pessoa, entao o build estatico NAO semeia nada: abre
// vazio, como um perfil novo.
//
// Tudo o mais que precisa da API — entrada por passkey, sincronizacao, painel de admin, coach,
// notificacoes push — fica de fora dos dois. Boa parte disso ja se desliga sozinha, porque
// depende de `user` (nunca existe sem servidor) ou de `config.coach.enabled` (a config vem da
// API); NO_BACKEND cobre o que resta: as secoes e avisos que falariam de um servidor que nao ha.
export const STATIC_BUILD = import.meta.env.VITE_STATIC === '1'
export const NO_BACKEND = DEMO || STATIC_BUILD
