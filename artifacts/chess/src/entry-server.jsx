import React from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { Writable } from 'node:stream'
import App from './App'


/**
 * Server-renders the app for a given URL into an HTML string. Runs <App>
 * under a StaticRouter for the requested location and streams the markup
 * back once the shell is ready.
 *
 * `options.user` is the validated session user (or null for anonymous
 * requests). When provided, UserContext starts logged-in so the server HTML
 * already shows the personalized shell; the caller embeds the same object as
 * the one-shot window payload the client adopts on its first render.
 */
export function render(url, { user } = {}) {
  return new Promise((resolve, reject) => {
    let didError = false
    let html = ''
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        html += chunk.toString()
        callback()
      },
    })

    writable.on('finish', () => {
      if (didError) {
        reject(new Error('React SSR failed while rendering the route'))
      } else {
        resolve(html)
      }
    })

    const { pipe } = renderToPipeableStream(
      <React.StrictMode>
        <App Router={StaticRouter} routerProps={{ location: url }} initialUser={user} />
      </React.StrictMode>,
      {
        onAllReady() {
          pipe(writable)
        },
        onShellError(error) {
          reject(error)
        },
        onError(error) {
          didError = true
          console.error('[SSR] Render error:', error)
        },
      },
    )
  })
}
