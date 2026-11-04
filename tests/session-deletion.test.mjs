import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function loadTypeScript(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
  )
}

const { deleteSavedSession } = await loadTypeScript(
  '../src/services/sessionDeletion.ts',
)
const { generateAndSaveStudyNotes } = await loadTypeScript(
  '../src/services/studyNotesFlow.ts',
)

function lesson(id) {
  return {
    id,
    status: 'saved',
    title: `Class ${id}`,
    updatedAt: '2026-11-04T00:00:00Z',
    transcript: [{ id: `${id}-caption`, text: `${id} transcript` }],
    bookmarks: [{ id: `${id}-bookmark` }],
    catchUps: [{ id: `${id}-recap` }],
    studyNotes: undefined,
    notes: `${id} personal notes`,
    studyMessages: [],
  }
}

function harness() {
  const lessons = new Map([
    ['a', lesson('a')],
    ['b', lesson('b')],
  ])
  const pending = new Set()
  const deleted = new Set()
  const removed = []
  let tail = Promise.resolve()
  return {
    lessons,
    pending,
    deleted,
    removed,
    serialize(action) {
      const result = tail.then(action)
      tail = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
    storage: {
      async get(id) {
        return lessons.get(id)
      },
      async save(next) {
        lessons.set(next.id, next)
      },
      async remove(id) {
        removed.push(id)
        lessons.delete(id)
      },
    },
  }
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function deleteActions(context, lessonId = 'a') {
  return {
    lessonId,
    pending: context.pending,
    deleted: context.deleted,
    serialize: context.serialize,
    storage: context.storage,
  }
}

test('confirmation deletes only the selected session', async () => {
  const context = harness()
  const otherBefore = structuredClone(context.lessons.get('b'))
  assert.equal(await deleteSavedSession(deleteActions(context)), 'deleted')
  assert.equal(context.lessons.has('a'), false)
  assert.deepEqual(context.lessons.get('b'), otherBefore)
  assert.deepEqual(context.removed, ['a'])
})

test('storage failure leaves data intact and allows a later retry', async () => {
  const context = harness()
  context.storage.remove = async () => {
    throw new Error('IndexedDB unavailable')
  }
  await assert.rejects(deleteSavedSession(deleteActions(context)))
  assert.equal(context.lessons.has('a'), true)
  assert.equal(context.deleted.has('a'), false)
  assert.equal(context.pending.size, 0)
  context.storage.remove = async (id) => {
    context.lessons.delete(id)
  }
  assert.equal(await deleteSavedSession(deleteActions(context)), 'deleted')
})

test('duplicate confirmation cannot delete twice', async () => {
  const context = harness()
  const gate = deferred()
  let calls = 0
  context.storage.remove = async (id) => {
    calls++
    await gate.promise
    context.lessons.delete(id)
  }
  const first = deleteSavedSession(deleteActions(context))
  assert.equal(await deleteSavedSession(deleteActions(context)), 'duplicate')
  gate.resolve()
  assert.equal(await first, 'deleted')
  assert.equal(calls, 1)
  assert.equal(await deleteSavedSession(deleteActions(context)), 'missing')
})

test('pending Study Notes cannot recreate a deleted session', async () => {
  const context = harness()
  const model = deferred()
  const generation = generateAndSaveStudyNotes({
    lessonId: 'a',
    pending: new Set(),
    generate: () => model.promise,
    serialize: context.serialize,
    storage: context.storage,
  })
  assert.equal(await deleteSavedSession(deleteActions(context)), 'deleted')
  model.resolve({ createdAt: '2026-11-04T01:00:00Z', overview: 'Late notes' })
  assert.equal((await generation).status, 'missing')
  assert.equal(context.lessons.has('a'), false)
  assert.equal(context.lessons.has('b'), true)
  // A stale whole-session save scheduled after deletion checks the marker.
  await context.serialize(async () => {
    if (!context.deleted.has('a')) await context.storage.save(lesson('a'))
  })
  assert.equal(context.lessons.has('a'), false)
})

test('a queued AI write is followed by deletion, leaving no session to restore', async () => {
  const context = harness()
  const generation = generateAndSaveStudyNotes({
    lessonId: 'a',
    pending: new Set(),
    generate: async () => ({
      createdAt: '2026-11-04T01:00:00Z',
      overview: 'Notes',
    }),
    serialize: context.serialize,
    storage: context.storage,
  })
  const deletion = deleteSavedSession(deleteActions(context))
  await Promise.all([generation, deletion])
  assert.equal(context.lessons.has('a'), false)
  assert.equal(context.lessons.has('b'), true)
})
