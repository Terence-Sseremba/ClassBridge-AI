import type {
  CatchUpExplanation,
  LessonSession,
  StudyMessage,
} from '../types/lesson'

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
