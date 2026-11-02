import { readFile, writeFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// Public shell only: account data and live prices must never enter static HTML.
const vite = await createServer({ configFile:false,plugins:[react()],
  optimizeDeps:{noDiscovery:true,include:[]},
  server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom' })
try {
  const { default: PageLoading } = await vite.ssrLoadModule('/src/components/PageLoading.jsx')
  const shell = renderToStaticMarkup(createElement('div', null,
    createElement('header', { className: 'prerender-header' },
      createElement('a', { href: '/cricket', 'aria-label': 'CricEdge home' }, 'CricEdge'),
      createElement('nav', { 'aria-label': 'Sports' },
        ...['Cricket', 'Toss', 'Session'].map(name => createElement('a', { href: `/${name.toLowerCase()}`, key: name }, name)))),
    createElement(PageLoading, { label: 'Loading live markets' })))
  const file = new URL('../dist/index.html', import.meta.url)
  const html = await readFile(file, 'utf8')
  await writeFile(file, html.replace('<div id="root"></div>', `<div id="root">${shell}</div>`))
} finally {
  await vite.close()
}
