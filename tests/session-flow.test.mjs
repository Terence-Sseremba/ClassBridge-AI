import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(
  new URL('../src/services/sessionFlow.ts', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const { finishClassSession } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)

function lesson() {
  return {
    id: 'class-1',
    transcriptSource: 'muse',
    title: 'Class',
    date: '2026-11-04T00:00:00Z',
    updatedAt: '2026-11-04T00:00:00Z',
    status: 'live',
    transcript: [],
    concepts: [],
    bookmarks: [{ id: 'bookmark-1', segmentId: 'final-1', note: '' }],
    catchUps: [
      {
        id: 'catch-1',
        createdAt: '2026-11-04T00:00:00Z',
        throughSegmentId: '',
        text: 'Recap',
        source: 'muse',
      },
    ],
    studyMessages: [],
    notes: 'My own notes',
  }
}

test('final captions are saved before the study page opens and generation starts', async () => {
  const events = []
  let current = lesson()
  let finishStop
  let finishSave
  let saveEntered
  const stopped = new Promise((resolve) => {
    finishStop = resolve
  })
  const saved = new Promise((resolve) => {
    finishSave = resolve
  })
  const entered = new Promise((resolve) => {
    saveEntered = resolve
  })
  let persisted
  const run = finishClassSession({
    stopListening: async () => {
      events.push('stop')
      const result = await stopped
      current = {
        ...current,
        transcript: [
          {
            id: 'final-1',
            atSeconds: 4,
            speaker: 'Speaker',
            text: 'Final caption',
          },
        ],
      }
      return result
    },
    getCurrent: () => current,
    setCurrent: (next) => {
      current = next
      events.push('set-saved')
    },
    persist: async (next) => {
      persisted = next
      events.push('save')
      saveEntered()
      return saved
    },
    openSaved: () => events.push('open'),
    generateStudyNotes: () => events.push('generate'),
  })
  assert.deepEqual(events, ['stop'])
  finishStop(true)
  await entered
  assert.equal(persisted.transcript[0].text, 'Final caption')
  assert.equal(persisted.bookmarks.length, 1)
  assert.equal(persisted.catchUps.length, 1)
  assert.equal(persisted.notes, 'My own notes')
  assert.deepEqual(events, ['stop', 'set-saved', 'save'])
  finishSave(true)
  assert.equal(await run, true)
  assert.deepEqual(events, ['stop', 'set-saved', 'save', 'open', 'generate'])
})

test('failed finalization or storage never starts study notes', async () => {
  for (const stopResult of [false, true]) {
    let current = lesson()
    const events = []
    const result = await finishClassSession({
      stopListening: async () => stopResult,
      getCurrent: () => current,
      setCurrent: (next) => {
        current = next
      },
      persist: async () => {
        events.push('save')
        return false
      },
      openSaved: () => events.push('open'),
      generateStudyNotes: () => events.push('generate'),
    })
    assert.equal(result, false)
    assert.equal(current.status, 'live')
    assert.deepEqual(events, stopResult ? ['save'] : [])
  }
})

test('a session update during saving is retained when notes generation starts', async () => {
  let current = lesson()
  let opened
  let generated
  await finishClassSession({
    stopListening: async () => true,
    getCurrent: () => current,
    setCurrent: (next) => {
      current = next
    },
    persist: async () => {
      current = {
        ...current,
        catchUps: [...current.catchUps, { id: 'catch-2', text: 'Late recap' }],
      }
      return true
    },
    openSaved: (next) => {
      opened = next
    },
    generateStudyNotes: (next) => {
      generated = next
    },
  })
  assert.equal(opened.catchUps.length, 2)
  assert.equal(generated.catchUps.length, 2)
  assert.equal(generated.notes, 'My own notes')
})
