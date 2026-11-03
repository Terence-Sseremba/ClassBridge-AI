import type {
  CatchUpExplanation,
  LessonSession,
  StudyMessage,
  TranscriptSegment,
} from '../types/lesson'

const CONTEXT_SECONDS = 5 * 60
const MAX_CONTEXT_CHARACTERS = 12000

type EmptyContextReason =
  'no-finalized-captions' | 'no-recent-captions' | 'oversized-segment'

export class CatchUpRequestError extends Error {}

export function selectCatchUpContext(
  transcript: TranscriptSegment[],
  elapsedSeconds: number,
): { segments: TranscriptSegment[]; emptyReason?: EmptyContextReason } {
  const finalized = transcript.filter((segment) => segment.text.trim())
  const recent = finalized.filter(
    (segment) =>
      segment.atSeconds >= Math.max(0, elapsedSeconds - CONTEXT_SECONDS),
  )
  if (!recent.length)
    return {
      segments: [],
      emptyReason: finalized.length
        ? 'no-recent-captions'
        : 'no-finalized-captions',
    }
  const selected: TranscriptSegment[] = []
  let characters = 0
  for (let index = recent.length - 1; index >= 0; index--) {
    if (selected.length >= 80) break
    const segment = recent[index]
    if (segment.text.length > MAX_CONTEXT_CHARACTERS)
      return selected.length
        ? { segments: selected }
        : { segments: [], emptyReason: 'oversized-segment' }
    if (characters + segment.text.length > MAX_CONTEXT_CHARACTERS) break
    selected.unshift(segment)
    characters += segment.text.length
  }
  return { segments: selected }
}

export function catchUpCharacterCount(segments: TranscriptSegment[]): number {
  return segments.reduce(
    (characters, segment) =>
      characters + segment.text.replace(/\s/g, '').length,
    0,
  )
}

export function hasEnoughCatchUpContext(
  segments: TranscriptSegment[],
): boolean {
  return segments.length > 0 && catchUpCharacterCount(segments) >= 20
}

export async function museCatchUp(
  segments: TranscriptSegment[],
): Promise<CatchUpExplanation> {
  const response = await fetch('/api/catch-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segments }),
  })
  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null)
    const code =
      errorBody && typeof errorBody === 'object' && 'code' in errorBody
        ? errorBody.code
        : null
    if (code === 'NO_FINALIZED_CAPTIONS')
      throw new CatchUpRequestError(
        'No finalized captions yet. Try again after speech is finalized.',
      )
    if (code === 'INSUFFICIENT_CONTEXT')
      throw new CatchUpRequestError(
        'A little more finalized speech is needed for a recap.',
      )
    if (code === 'OVERSIZED_SEGMENT' || code === 'REQUEST_TOO_LARGE')
      throw new CatchUpRequestError(
        'A caption segment is too large for a recap. Try again after another finalized segment.',
      )
    throw new CatchUpRequestError(
      'Could not reach Muse Spark. Please try again.',
    )
  }
  const result: unknown = await response.json()
  if (
    !result ||
    typeof result !== 'object' ||
    !('text' in result) ||
    typeof result.text !== 'string' ||
    !result.text.trim()
  )
    throw new Error('The recap was unavailable. Please try again.')
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    throughSegmentId: segments.at(-1)?.id ?? '',
    source: 'muse',
    text: result.text.trim(),
  }
}

export interface ReasoningService {
  catchUp(lesson: LessonSession): Promise<CatchUpExplanation>
  answer(lesson: LessonSession, question: string): Promise<StudyMessage>
}

// Deterministic examples make it clear that this milestone does not call an AI API.
export const mockReasoningService: ReasoningService = {
  async catchUp(lesson) {
    const recent = lesson.transcript.slice(-3)
    return {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      throughSegmentId: recent.at(-1)?.id ?? '',
      source: 'mock',
      text: recent.length
        ? `In the most recent discussion: ${recent.map((segment) => segment.text).join(' ')}`
        : 'Captions will appear here as the sample class progresses.',
    }
  },
  async answer(lesson, question) {
    const topic = lesson.concepts[0]?.title ?? lesson.title
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      createdAt: new Date().toISOString(),
      source: 'mock',
      text: `Mock study response: Your question about “${question}” relates to ${topic}. Review the transcript and your notes for the exact class explanation. AI study help will be connected in a later milestone.`,
    }
  },
}
