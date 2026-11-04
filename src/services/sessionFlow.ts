import type { LessonSession } from '../types/lesson'

interface FinishClassActions {
  stopListening: () => Promise<boolean>
  getCurrent: () => LessonSession | null
  setCurrent: (lesson: LessonSession) => void
  persist: (lesson: LessonSession) => Promise<boolean>
  openSaved: (lesson: LessonSession) => void
  generateStudyNotes: (lesson: LessonSession) => void
}

export async function finishClassSession({
  stopListening,
  getCurrent,
  setCurrent,
  persist,
  openSaved,
  generateStudyNotes,
}: FinishClassActions): Promise<boolean> {
  if (!(await stopListening())) return false
  const current = getCurrent()
  if (!current) return false
  const saved: LessonSession = {
    ...current,
    status: 'saved',
    updatedAt: new Date().toISOString(),
  }
  setCurrent(saved)
  if (!(await persist(saved))) {
    const latest = getCurrent()
    if (latest?.id === saved.id) setCurrent({ ...latest, status: 'live' })
    return false
  }
  const latest = getCurrent()
  const ready = latest?.id === saved.id ? latest : saved
  openSaved(ready)
  generateStudyNotes(ready)
  return true
}
