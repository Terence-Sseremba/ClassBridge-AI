import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(
  new URL('../src/services/reasoning.ts', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const { selectStudyNotesContext, hasEnoughStudyNotesContext } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)

function segment(
  index,
  text = 'Finalized classroom discussion with enough useful detail to support study notes.',
) {
  return { id: `segment-${index}`, atSeconds: index, speaker: 'Speaker', text }
}

test('study context uses the latest captions in chronological order and marks partial coverage', () => {
  const transcript = Array.from({ length: 81 }, (_, index) => segment(index))
  const selection = selectStudyNotesContext(transcript)
  assert.equal(selection.segments.length, 80)
  assert.equal(selection.segments[0].id, 'segment-1')
  assert.equal(selection.segments.at(-1).id, 'segment-80')
  assert.equal(selection.coversFullTranscript, false)
  assert.equal(
    selectStudyNotesContext(transcript.slice(0, 2)).coversFullTranscript,
    true,
  )

  const byCharacters = selectStudyNotesContext([
    segment(0, 'a'.repeat(5000)),
    segment(1, 'b'.repeat(5000)),
    segment(2, 'c'.repeat(5000)),
  ])
  assert.deepEqual(
    byCharacters.segments.map((item) => item.id),
    ['segment-1', 'segment-2'],
  )
  assert.equal(byCharacters.coversFullTranscript, false)
  assert.equal(selectStudyNotesContext([]).emptyReason, 'no-finalized-captions')
  assert.equal(
    selectStudyNotesContext([segment(0, 'x'.repeat(12001))]).emptyReason,
    'oversized-segment',
  )
  assert.equal(hasEnoughStudyNotesContext([segment(0, 'short')]), false)
})

process.env.MODEL_API_KEY = 'test-only-key'
process.env.CLASSBRIDGE_SERVER_PORT = '0'
const nativeFetch = globalThis.fetch
const { server } = await import('../server/index.mjs')
if (!server.listening) await once(server, 'listening')
const url = `http://127.0.0.1:${server.address().port}/api/study-notes`
after(() => {
  globalThis.fetch = nativeFetch
  server.close()
})

async function request(segments, origin = 'http://localhost:5173') {
  const response = await nativeFetch(url, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ segments }),
  })
  return { status: response.status, body: await response.json() }
}

const validSegments = [
  segment(
    0,
    'The speaker explained a classroom idea with enough detail to support notes. The class then discussed how that idea works in practice and why it matters.',
  ),
]
const validNotes = {
  overview: 'The class discussed an idea and its practical use.',
  concepts: [
    {
      title: 'Classroom idea',
      explanation: 'The speaker explained how it works.',
    },
  ],
  takeaways: ['The idea has a practical use.'],
}

test('endpoint rejects unsafe or insufficient requests before calling Meta', async () => {
  globalThis.fetch = () => {
    throw new Error('Meta should not be called')
  }
  assert.equal((await request([], 'http://evil.example')).status, 403)
  assert.equal((await request([])).body.code, 'NO_FINALIZED_CAPTIONS')
  assert.equal(
    (await request([segment(0, 'too short')])).body.code,
    'INSUFFICIENT_CONTEXT',
  )
  assert.equal(
    (await request([segment(0, 'x'.repeat(12001))])).body.code,
    'OVERSIZED_SEGMENT',
  )
})

test('endpoint validates completed structured model output and request grounding', async () => {
  let modelRequest
  globalThis.fetch = async (_url, options) => {
    modelRequest = JSON.parse(options.body)
    return new Response(
      JSON.stringify({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: JSON.stringify(validNotes) },
            ],
          },
        ],
      }),
      { status: 200 },
    )
  }
  const result = await request(validSegments)
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, validNotes)
  assert.equal(modelRequest.model, 'muse-spark-1.3')
  assert.equal(modelRequest.reasoning.effort, 'low')
  assert.equal(modelRequest.max_output_tokens, 2200)
  assert.equal(modelRequest.input.includes('class title'), false)
  assert.equal(modelRequest.input.includes(validSegments[0].text), true)
})

test('endpoint returns safe errors for malformed, incomplete, oversized, and timed-out model output', async () => {
  for (const modelResponse of [
    {
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: '{bad json' }],
        },
      ],
    },
    {
      status: 'incomplete',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(validNotes) }],
        },
      ],
    },
    {
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                ...validNotes,
                overview: 'x'.repeat(501),
              }),
            },
          ],
        },
      ],
    },
  ]) {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(modelResponse), { status: 200 })
    const result = await request(validSegments)
    assert.equal(result.status, 502)
    assert.equal(JSON.stringify(result.body).includes('test-only-key'), false)
  }
  globalThis.fetch = async () => {
    throw new DOMException('Timed out', 'TimeoutError')
  }
  assert.equal((await request(validSegments)).status, 502)
})
