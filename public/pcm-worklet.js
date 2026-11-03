class Pcm24kHzProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.input = []
    this.position = 0
    this.output = []
    this.port.onmessage = (event) => {
      if (event.data !== 'flush') return
      if (this.output.length) this.sendFrame(this.output)
      this.output = []
      this.port.postMessage({ type: 'flushed' })
    }
  }

  sendFrame(samples) {
    const frame = new ArrayBuffer(samples.length * 2)
    const pcm = new DataView(frame)
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]
      pcm.setInt16(i * 2, sample < 0 ? sample * 32768 : sample * 32767, true)
    }
    this.port.postMessage(frame, [frame])
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    for (const sample of channel) this.input.push(sample)

    const step = sampleRate / 24000
    while (this.position + 1 < this.input.length) {
      const index = Math.floor(this.position)
      const fraction = this.position - index
      const value =
        this.input[index] * (1 - fraction) + this.input[index + 1] * fraction
      this.output.push(Math.max(-1, Math.min(1, value)))
      if (this.output.length === 1920) {
        this.sendFrame(this.output)
        this.output = []
      }
      this.position += step
    }
    const consumed = Math.floor(this.position)
    this.input.splice(0, consumed)
    this.position -= consumed
    return true
  }
}

registerProcessor('pcm-24khz', Pcm24kHzProcessor)
