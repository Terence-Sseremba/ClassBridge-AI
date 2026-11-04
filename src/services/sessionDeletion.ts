import type { LessonSession } from '../types/lesson'

interface DeleteSessionActions {
  lessonId: string
  pending: Set<string>
  deleted: Set<string>
  serialize: <T>(action: () => Promise<T>) => Promise<T>
  storage: {
    get: (id: string) => Promise<LessonSession | undefined>
    remove: (id: string) => Promise<void>
  }
}

export async function deleteSavedSession({
  lessonId,
  pending,
  deleted,
  serialize,
  storage,
}: DeleteSessionActions): Promise<'deleted' | 'missing' | 'duplicate'> {
  if (pending.has(lessonId)) return 'duplicate'
  pending.add(lessonId)
  try {
    return await serialize(async () => {
      if (deleted.has(lessonId)) return 'missing'
      const lesson = await storage.get(lessonId)
      if (!lesson || lesson.status !== 'saved') return 'missing'
      await storage.remove(lessonId)
      deleted.add(lessonId)
      return 'deleted'
    })
  } finally {
    pending.delete(lessonId)
  }
}
