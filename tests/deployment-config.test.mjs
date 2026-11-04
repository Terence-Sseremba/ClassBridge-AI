import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { once } from 'node:events'
import { connect } from 'node:net'

process.env.NODE_ENV = 'production'
process.env.PORT = '0'
process.env.MODEL_API_KEY = 'test-only-key'
process.env.CLASSBRIDGE_ALLOWED_ORIGIN = 'https://classbridge.example'

const { server } = await import('../server/index.mjs')
if (!server.listening) await once(server, 'listening')
const baseUrl = `http://127.0.0.1:${server.address().port}`

after(() => server.close())

test('production server binds publicly and responds to health checks', async () => {
  assert.equal(server.address().address, '0.0.0.0')
  const response = await fetch(`${baseUrl}/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('production JSON routes allow only the configured origin and preflight', async () => {
  const allowed = await fetch(`${baseUrl}/api/study-notes`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://classbridge.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  assert.equal(allowed.status, 204)
  assert.equal(
    allowed.headers.get('access-control-allow-origin'),
    'https://classbridge.example',
  )
  assert.equal(
    allowed.headers.get('access-control-allow-methods'),
    'POST, OPTIONS',
  )
  assert.equal(
    allowed.headers.get('access-control-allow-headers'),
    'Content-Type',
  )

  const rejected = await fetch(`${baseUrl}/api/catch-up`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173' },
  })
  assert.equal(rejected.status, 403)
  assert.equal(rejected.headers.get('access-control-allow-origin'), null)

  const invalidTranscript = await fetch(`${baseUrl}/api/catch-up`, {
    method: 'POST',
    headers: {
      Origin: 'https://classbridge.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ segments: [] }),
  })
  assert.equal(invalidTranscript.status, 422)
  assert.equal(
    invalidTranscript.headers.get('access-control-allow-origin'),
    'https://classbridge.example',
  )
})

test('production WebSocket upgrade rejects an unapproved origin', async () => {
  const socket = connect(server.address().port, '127.0.0.1')
  await once(socket, 'connect')
  socket.write(
    'GET /api/transcription HTTP/1.1\r\n' +
      `Host: 127.0.0.1:${server.address().port}\r\n` +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
      'Sec-WebSocket-Version: 13\r\n' +
      'Origin: http://localhost:5173\r\n\r\n',
  )
  const [data] = await once(socket, 'data')
  assert.match(data.toString(), /^HTTP\/1\.1 403 Forbidden/)
  socket.destroy()
})
