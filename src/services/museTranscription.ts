import { transcriptionSocketUrl } from './apiUrl'

export type MuseStatus = 'connecting' | 'listening' | 'finishing' | 'stopped'

export interface MuseTranscript {
  text: string
  final: boolean
  turnId?: number
}

export interface MuseSession {
  stop(): Promise<void>
}

type ServerEvent = {
  type?: string
  text?: string
  turnId?: number
  message?: string
}

export async function startMuseTranscription(
  onTranscript: (result: MuseTranscript) => void,
  onStatus: (status: MuseStatus) => void,
  onError: (message: string) => void,
): Promise<MuseSession> {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
    throw new Error(
      'Microphone capture requires a supported browser and HTTPS or localhost.',
    )
  }

  const socketUrl = transcriptionSocketUrl()
  onStatus('connecting')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
    },
  })
  const socket = new WebSocket(socketUrl)
  const context = new AudioContext()
  let source: MediaStreamAudioSourceNode | undefined
  let processor: AudioWorkletNode | undefined
  let stopping = false
  let stopped = false
  let started = false
  let resolveStop: (() => void) | undefined
  let rejectStop: ((reason: Error) => void) | undefined
  let stopTimer: number | undefined
  let finishFlush: (() => void) | undefined

  const cleanup = async () => {
    if (stopped) return
    stopped = true
    source?.disconnect()
    processor?.disconnect()
    stream.getTracks().forEach((track) => track.stop())
    await context.close().catch(() => undefined)
    onStatus('stopped')
  }

  const ready = new Promise<void>((resolve, reject) => {
    socket.onmessage = (message) => {
      if (typeof message.data !== 'string') return
      let event: ServerEvent
      try {
        event = JSON.parse(message.data) as ServerEvent
      } catch {
        return
      }
      if (event.type === 'ready') {
        resolve()
      } else if (event.type === 'partial') {
        onTranscript({ text: event.text ?? '', final: false })
      } else if (event.type === 'final') {
        onTranscript({
          text: event.text ?? '',
          final: true,
          turnId: event.turnId,
        })
      } else if (event.type === 'error') {
        const error = new Error(event.message || 'Meta transcription failed.')
        if (!started) reject(error)
        else onError(error.message)
      }
    }
    socket.onerror = () => {
      const error = new Error(
        'Could not connect to the ClassBridge transcription server.',
      )
      if (!started) reject(error)
      else onError(error.message)
    }
    socket.onclose = (event) => {
      window.clearTimeout(stopTimer)
      void cleanup().then(() => {
        if (!started)
          reject(
            new Error(
              'The transcription connection closed before it was ready.',
            ),
          )
        else if (!stopping)
          onError('The transcription connection closed unexpectedly.')
        if (event.code === 1000) resolveStop?.()
        else
          rejectStop?.(
            new Error(
              'Transcription ended before final captions were confirmed.',
            ),
          )
      })
    }
  })

  try {
    await ready
    await context.audioWorklet.addModule('/pcm-worklet.js')
    source = context.createMediaStreamSource(stream)
    processor = new AudioWorkletNode(context, 'pcm-24khz')
    processor.port.onmessage = ({
      data,
    }: MessageEvent<ArrayBuffer | { type: string }>) => {
      if (data instanceof ArrayBuffer && socket.readyState === WebSocket.OPEN)
        socket.send(data)
      else if (!(data instanceof ArrayBuffer) && data.type === 'flushed')
        finishFlush?.()
    }
    source.connect(processor)
    processor.connect(context.destination)
    await context.resume()
    started = true
    onStatus('listening')
  } catch (error) {
    socket.close()
    await cleanup()
    throw error
  }

  return {
    stop: async () => {
      if (stopping) return
      stopping = true
      onStatus('finishing')
      source?.disconnect()
      if (processor && socket.readyState === WebSocket.OPEN) {
        await new Promise<void>((resolve) => {
          finishFlush = resolve
          processor?.port.postMessage('flush')
        })
      }
      processor?.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      await context.close().catch(() => undefined)
      if (socket.readyState !== WebSocket.OPEN) {
        await cleanup()
        return
      }
      socket.send(JSON.stringify({ type: 'stop' }))
      await new Promise<void>((resolve, reject) => {
        resolveStop = resolve
        rejectStop = reject
        stopTimer = window.setTimeout(() => {
          if (socket.readyState !== WebSocket.CLOSED) {
            socket.close()
            rejectStop?.(
              new Error('Timed out waiting for final transcription.'),
            )
          }
        }, 20000)
      })
    },
  }
}
