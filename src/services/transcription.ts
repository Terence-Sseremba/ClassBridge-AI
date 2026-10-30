import type { TranscriptSegment } from '../types/lesson'

// A real implementation can replace this service without changing screen code.
export interface TranscriptionService {
  nextSegment(index: number): TranscriptSegment | null
}

const sampleLines = [
  [
    'Professor',
    'Good morning, everyone. Today we are exploring how photosynthesis turns sunlight into stored energy.',
  ],
  [
    'Professor',
    'Plants take in light through pigments in their leaves. Chlorophyll is the pigment that gives most leaves their green color.',
  ],
  [
    'Professor',
    'The process has two broad stages: light-dependent reactions and the Calvin cycle.',
  ],
  [
    'Professor',
    'In the first stage, light energy helps split water molecules. This releases oxygen as a byproduct.',
  ],
  [
    'Professor',
    'The Calvin cycle then uses carbon dioxide to build sugars that the plant can use later.',
  ],
  ['Student', 'Does the Calvin cycle need sunlight directly?'],
  [
    'Professor',
    'Great question. It uses products from the light-dependent reactions, so it depends on light indirectly.',
  ],
] as const

export const mockTranscriptionService: TranscriptionService = {
  nextSegment(index) {
    const line = sampleLines[index]
    if (!line) return null
    return {
      id: `sample-${index}`,
      atSeconds: index * 19,
      speaker: line[0],
      text: line[1],
    }
  },
}
