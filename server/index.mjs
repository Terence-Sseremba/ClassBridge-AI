import http from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'

const apiKey = process.env.MODEL_API_KEY
if (!apiKey) {
  process.stderr.write(
    'Set MODEL_API_KEY before starting the transcription server.\n',
  )
  process.exit(1)
}

const safeErrorCodes = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPROTO',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
])
let connectionCount = 0

function errorCode(error) {
  if (error?.message === 'Opening handshake has timed out')
    return 'UPSTREAM_HANDSHAKE_TIMEOUT'
  return safeErrorCodes.has(error?.code) ? error.code : 'UNCLASSIFIED'
}

function log(connectionId, stage, details = {}) {
  process.stdout.write(
    `${JSON.stringify({ connectionId, stage, ...details })}\n`,
  )
}

const port = Number(process.env.CLASSBRIDGE_SERVER_PORT || 8787)
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.CLASSBRIDGE_ALLOWED_ORIGIN,
])
const server = http.createServer((_request, response) => {
  response.writeHead(404).end()
})
const browserSockets = new WebSocketServer({ noServer: true, maxPayload: 8192 })

server.on('upgrade', (request, socket, head) => {
  if (
    request.url !== '/api/transcription' ||
    !allowedOrigins.has(request.headers.origin)
  ) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }
  browserSockets.handleUpgrade(request, socket, head, (browser) => {
    browserSockets.emit('connection', browser)
  })
})

browserSockets.on('connection', (browser) => {
  const connectionId = ++connectionCount
  log(connectionId, 'browser_connected')
  const meta = new WebSocket('wss://api.meta.ai/v1/asr/realtime', {
    handshakeTimeout: 30000,
  })
  log(connectionId, 'meta_connecting')
  let ready = false
  let ending = false
  let failed = false
  let audioStarted = false
  let activeTurn = null
  const completed = new Set()

  function send(event) {
    if (browser.readyState === WebSocket.OPEN)
      browser.send(JSON.stringify(event))
  }

  function fail(message) {
    if (failed) return
    failed = true
    log(connectionId, 'connection_failed')
    send({ type: 'error', message })
    meta.terminate()
    browser.close(1011, 'Transcription unavailable')
  }

  meta.on('open', () => {
    log(connectionId, 'meta_socket_open')
    meta.send(
      JSON.stringify({
        authorization: { accessToken: `Bearer ${apiKey}` },
        audioEncoding: 'PCM_24KHZ',
        model: 'muse-voice-transcribe-1.0',
        mode: 'ENDPOINTING',
        partialMode: 'CUMULATIVE',
        emitAudioProgress: false,
      }),
    )
    log(connectionId, 'meta_handshake_sent')
  })

  meta.on('unexpected-response', (_request, response) => {
    log(connectionId, 'meta_http_rejected', { statusCode: response.statusCode })
    response.resume()
    fail('Meta rejected the WebSocket connection.')
  })

  meta.on('message', (data, isBinary) => {
    if (isBinary) return
    let event
    try {
      event = JSON.parse(data.toString())
    } catch {
      log(connectionId, 'meta_invalid_json')
      return
    }
    if (!ready) {
      if (typeof event.sessionId !== 'string') {
        log(connectionId, 'meta_handshake_rejected', {
          errorCode:
            typeof event.code === 'string' &&
            /^[A-Z0-9_]{1,40}$/.test(event.code)
              ? event.code
              : 'UNSPECIFIED',
        })
        fail('Meta rejected the transcription session.')
        return
      }
      ready = true
      log(connectionId, 'meta_handshake_accepted')
      send({ type: 'ready' })
      return
    }
    if (event.type === 'speechStart') {
      activeTurn = event.turnId
      send({ type: 'partial', text: '' })
    } else if (event.type === 'transcript') {
      send({ type: 'partial', text: String(event.transcript || '') })
    } else if (event.type === 'speechComplete') {
      if (!completed.has(event.turnId)) {
        completed.add(event.turnId)
        send({
          type: 'final',
          turnId: event.turnId,
          text: String(event.transcript || ''),
        })
      }
      if (activeTurn === event.turnId) send({ type: 'partial', text: '' })
    } else if (event.type === 'error') {
      log(connectionId, 'meta_error_event', {
        errorCode:
          typeof event.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(event.code)
            ? event.code
            : 'UNSPECIFIED',
      })
      fail('Meta reported a transcription error.')
    }
  })

  meta.on('error', (error) => {
    log(connectionId, 'meta_socket_error', { errorCode: errorCode(error) })
    fail('Could not connect to Meta Muse Voice Transcribe.')
  })
  meta.on('close', (code) => {
    log(connectionId, 'meta_socket_closed', { closeCode: code })
    if (failed) return
    if (browser.readyState !== WebSocket.OPEN) return
    if (ending && code === 1000) {
      send({ type: 'stopped' })
      browser.close(1000)
    } else {
      send({
        type: 'error',
        message:
          code === 1013
            ? 'Meta is rate limiting transcription. Try again later.'
            : 'Meta transcription disconnected unexpectedly.',
      })
      browser.close(1011, 'Transcription unavailable')
    }
  })

  browser.on('message', (data, isBinary) => {
    if (isBinary) {
      if (!ready || ending || meta.readyState !== WebSocket.OPEN) return
      if (!audioStarted) {
        audioStarted = true
        log(connectionId, 'audio_stream_started')
      }
      if (data.length > 8192 || meta.bufferedAmount > 384000) {
        fail('Audio could not be streamed in real time.')
        return
      }
      meta.send(data, { binary: true })
      return
    }
    let event
    try {
      event = JSON.parse(data.toString())
    } catch {
      return
    }
    if (event.type === 'stop' && ready && !ending) {
      ending = true
      log(connectionId, 'end_stream_sent')
      meta.send(JSON.stringify({ type: 'endStream' }))
    }
  })
  browser.on('close', (code) => {
    log(connectionId, 'browser_socket_closed', { closeCode: code })
    meta.terminate()
  })
  browser.on('error', (error) => {
    log(connectionId, 'browser_socket_error', { errorCode: errorCode(error) })
    meta.terminate()
  })
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(
    `ClassBridge transcription server listening on 127.0.0.1:${port}\n`,
  )
  log(0, 'startup', { modelApiKeyConfigured: true })
})
