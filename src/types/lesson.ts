// One session model is used by the live room, saved list, and study view.
export interface TranscriptSegment {
  id: string
  atSeconds: number
  speaker: string
  text: string
}

export interface Concept {
  id: string
  title: string
  description: string
}

export interface Bookmark {
  id: string
  segmentId: string
  note: string
}

export interface CatchUpExplanation {
  id: string
  createdAt: string
  throughSegmentId: string
  text: string
  source: 'mock' | 'muse'
}

export interface StudyMessage {
  id: string
  role: 'student' | 'assistant'
  text: string
  createdAt: string
  source?: 'mock'
}

export interface StudyNotes {
  createdAt: string
  source: 'muse' | 'sample'
  throughSegmentId: string
  coversFullTranscript: boolean
  overview: string
  concepts: { title: string; explanation: string }[]
  takeaways: string[]
}

export interface LessonSession {
  id: string
  transcriptSource?: 'sample' | 'muse'
  title: string
  date: string
  updatedAt: string
  status: 'live' | 'saved'
  transcript: TranscriptSegment[]
  concepts: Concept[]
  bookmarks: Bookmark[]
  catchUps: CatchUpExplanation[]
  studyMessages: StudyMessage[]
  notes: string
  studyNotes?: StudyNotes
}

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
