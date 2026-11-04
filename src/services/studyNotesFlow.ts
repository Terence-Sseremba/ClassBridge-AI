import type { LessonSession, StudyNotes } from '../types/lesson'

interface StudyNotesActions {
  lessonId: string
  pending: Set<string>
  generate: () => Promise<StudyNotes>
  serialize: <T>(action: () => Promise<T>) => Promise<T>
  storage: {
    get: (id: string) => Promise<LessonSession | undefined>
    save: (lesson: LessonSession) => Promise<void>
  }
}

type StudyNotesResult =
  | { status: 'duplicate' | 'missing' }
  | { status: 'saved' | 'existing'; lesson: LessonSession }

export async function generateAndSaveStudyNotes({
  lessonId,
  pending,
  generate,
  serialize,
  storage,
}: StudyNotesActions): Promise<StudyNotesResult> {
  if (pending.has(lessonId)) return { status: 'duplicate' }
  pending.add(lessonId)
  try {
    const studyNotes = await generate()
    return await serialize(async () => {
      const latest = await storage.get(lessonId)
      if (!latest || latest.status !== 'saved') return { status: 'missing' }
      if (latest.studyNotes) return { status: 'existing', lesson: latest }
      const updated = { ...latest, studyNotes }
      await storage.save(updated)
      return { status: 'saved', lesson: updated }
    })
  } finally {
    pending.delete(lessonId)
  }
}
