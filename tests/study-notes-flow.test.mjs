import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(
  new URL('../src/services/studyNotesFlow.ts', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const { generateAndSaveStudyNotes } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)

function lesson(id) {
  return {
    id,
    status: 'saved',
    title: `Class ${id}`,
    date: '2026-11-04T00:00:00Z',
    updatedAt: '2026-11-04T00:00:00Z',
    transcript: [{ id: 'caption-1', text: 'Original caption' }],
    bookmarks: [],
    catchUps: [],
    studyMessages: [],
    notes: 'Original personal notes',
  }
}

const generatedNotes = {
  createdAt: '2026-11-04T01:00:00Z',
  source: 'muse',
  throughSegmentId: 'caption-1',
  coversFullTranscript: true,
  overview: 'Overview',
  concepts: [],
  takeaways: ['Takeaway'],
}

function harness() {
  const lessons = new Map([
    ['a', lesson('a')],
    ['b', lesson('b')],
  ])
  const pending = new Set()
  const saves = []
  let tail = Promise.resolve()
  return {
    lessons,
    pending,
    saves,
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
        saves.push(next)
        lessons.set(next.id, next)
      },
    },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('navigation away keeps notes with their original lesson and preserves concurrent edits', async () => {
  const context = harness()
  const model = deferred()
  let activeId = 'a'
  const run = generateAndSaveStudyNotes({
    lessonId: 'a',
    pending: context.pending,
    generate: () => model.promise,
    serialize: context.serialize,
    storage: context.storage,
  })
  activeId = 'b'
  const edited = {
    ...context.lessons.get('a'),
    updatedAt: '2026-11-04T01:30:00Z',
    transcript: [{ id: 'caption-2', text: 'Newer caption' }],
    bookmarks: [{ id: 'bookmark-2', segmentId: 'caption-2' }],
    catchUps: [{ id: 'catch-2', text: 'Newer recap' }],
    notes: 'Edited while generation was pending',
  }
  const writeGate = deferred()
  const newerWrite = context.serialize(async () => {
    await writeGate.promise
    await context.storage.save(edited)
  })
  model.resolve(generatedNotes)
  writeGate.resolve()
  await newerWrite
  const result = await run
  assert.equal(activeId, 'b')
  assert.equal(result.status, 'saved')
  assert.deepEqual(context.lessons.get('a').studyNotes, generatedNotes)
  assert.deepEqual(context.lessons.get('a').transcript, edited.transcript)
  assert.deepEqual(context.lessons.get('a').bookmarks, edited.bookmarks)
  assert.deepEqual(context.lessons.get('a').catchUps, edited.catchUps)
  assert.equal(context.lessons.get('a').notes, edited.notes)
  assert.equal(context.lessons.get('a').updatedAt, edited.updatedAt)
  assert.deepEqual(context.lessons.get('b'), lesson('b'))
  assert.equal(context.saves.at(-1).id, 'a')
})

test('duplicate requests are rejected and an existing newer result is preserved', async () => {
  const context = harness()
  const model = deferred()
  let calls = 0
  const actions = {
    lessonId: 'a',
    pending: context.pending,
    generate: () => {
      calls++
      return model.promise
    },
    serialize: context.serialize,
    storage: context.storage,
  }
  const first = generateAndSaveStudyNotes(actions)
  const duplicate = await generateAndSaveStudyNotes(actions)
  assert.equal(duplicate.status, 'duplicate')
  assert.equal(calls, 1)
  const newer = { ...generatedNotes, overview: 'Newer saved notes' }
  await context.serialize(() =>
    context.storage.save({ ...context.lessons.get('a'), studyNotes: newer }),
  )
  model.resolve(generatedNotes)
  assert.equal((await first).status, 'existing')
  assert.deepEqual(context.lessons.get('a').studyNotes, newer)
  assert.equal(context.pending.size, 0)
})

test('missing lesson and failed generation leave saved sessions unchanged', async () => {
  const context = harness()
  const missing = deferred()
  const request = generateAndSaveStudyNotes({
    lessonId: 'a',
    pending: context.pending,
    generate: () => missing.promise,
    serialize: context.serialize,
    storage: context.storage,
  })
  context.lessons.delete('a')
  missing.resolve(generatedNotes)
  assert.equal((await request).status, 'missing')
  assert.equal(context.saves.length, 0)

  const before = context.lessons.get('b')
  await assert.rejects(
    generateAndSaveStudyNotes({
      lessonId: 'b',
      pending: context.pending,
      generate: async () => {
        throw new Error('Muse unavailable')
      },
      serialize: context.serialize,
      storage: context.storage,
    }),
  )
  assert.deepEqual(context.lessons.get('b'), before)
  assert.equal(context.pending.size, 0)
})
