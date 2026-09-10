import fs from 'node:fs'
import path from 'node:path'
import { render } from '../artifacts/chess/dist/server/entry-server.js'

const template = fs.readFileSync(path.join(process.cwd(), 'dist', 'index.html'), 'utf8')

function getRenderUrl(req) {
  const requestUrl = new URL(req.url || '/', 'http://localhost')
  const route = requestUrl.searchParams.get('__route') || requestUrl.pathname
  requestUrl.searchParams.delete('__route')
  const query = requestUrl.searchParams.toString()
  return route + (query ? '?' + query : '')
}

export default async function handler(req, res) {
  try {
    const appHtml = await render(getRenderUrl(req))
    const html = template.replace('<div id="root"></div>', '<div id="root">' + appHtml + '</div>')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
    res.end(html)
  } catch (error) {
    console.error('[SSR] Request failed:', error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(template)
  }
}
