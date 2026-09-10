import React from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { Writable } from 'node:stream'
import App from './App'

export function render(url) {
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

    renderToPipeableStream(
      <React.StrictMode>
        <App ssr location={url} />
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
