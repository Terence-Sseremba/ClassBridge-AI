import type { LessonSession } from '../types/lesson'

const DATABASE = 'classbridge-ai'
const STORE = 'lessons'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = action(transaction.objectStore(STORE))
      // Wait for the transaction to commit before reporting a successful save.
      transaction.oncomplete = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      transaction.onerror = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

export const lessonStorage = {
  async list(): Promise<LessonSession[]> {
    const lessons = await runRequest<LessonSession[]>('readonly', (store) =>
      store.getAll(),
    )
    return lessons.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  get(id: string): Promise<LessonSession | undefined> {
    return runRequest('readonly', (store) => store.get(id))
  },
  async save(lesson: LessonSession): Promise<void> {
    await runRequest('readwrite', (store) => store.put(lesson))
  },
}
