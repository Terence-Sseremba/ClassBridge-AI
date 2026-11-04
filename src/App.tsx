/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  Bookmark,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  GraduationCap,
  Home,
  Menu,
  MessageCircle,
  Mic,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import { lessonStorage } from './storage/lessons'
import { finishClassSession } from './services/sessionFlow'
import { deleteSavedSession } from './services/sessionDeletion'
import { generateAndSaveStudyNotes } from './services/studyNotesFlow'
import {
  CatchUpRequestError,
  catchUpCharacterCount,
  hasEnoughCatchUpContext,
  mockReasoningService,
  museCatchUp,
  museStudyNotes,
  hasEnoughStudyNotesContext,
  sampleStudyNotes,
  selectCatchUpContext,
  selectStudyNotesContext,
  StudyNotesRequestError,
} from './services/reasoning'
import { startMuseTranscription } from './services/museTranscription'
import type { MuseSession, MuseStatus } from './services/museTranscription'
import type { LessonSession, TranscriptSegment } from './types/lesson'
import { formatTime } from './types/lesson'
import LandingPage from './LandingPage'

type Page = 'home' | 'live' | 'sessions' | 'study'

const navigation = [
  { page: 'home', label: 'Home', icon: Home },
  { page: 'live', label: 'Live class', icon: AudioLines },
  { page: 'sessions', label: 'My sessions', icon: BookOpen },
] as const

function shortDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function createLesson(title: string): LessonSession {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    transcriptSource: 'muse',
    title: title.trim() || 'Untitled class',
    date: now,
    updatedAt: now,
    status: 'live',
    transcript: [],
    concepts: [],
    bookmarks: [],
    catchUps: [],
    studyMessages: [],
    notes: '',
  }
}

function App() {
  const [workspaceEntered, setWorkspaceEntered] = useState(false)
  const [page, setPage] = useState<Page>('home')
  const [lessons, setLessons] = useState<LessonSession[]>([])
  const [active, setActive] = useState<LessonSession | null>(null)
  const [title, setTitle] = useState('')
  const [listening, setListening] = useState(false)
  const [museStatus, setMuseStatus] = useState<MuseStatus>('stopped')
  const [interimCaption, setInterimCaption] = useState('')
  const [microphoneError, setMicrophoneError] = useState('')
  const [catchUpLoading, setCatchUpLoading] = useState(false)
  const [catchUpNotice, setCatchUpNotice] = useState('')
  const [question, setQuestion] = useState('')
  const [storageError, setStorageError] = useState('')
  const [studyNotesLoading, setStudyNotesLoading] = useState(false)
  const [studyNotesNotice, setStudyNotesNotice] = useState('')
  const [studyNotesCanRetry, setStudyNotesCanRetry] = useState(false)
  const [savingClass, setSavingClass] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    title: string
  } | null>(null)
  const [deletingSession, setDeletingSession] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const captionEnd = useRef<HTMLDivElement>(null)
  const deleteDialog = useRef<HTMLDialogElement>(null)
  const microphone = useRef<MuseSession | null>(null)
  const microphoneStart = useRef<Promise<MuseSession> | null>(null)
  const microphoneStop = useRef<Promise<boolean> | null>(null)
  const activeRef = useRef<LessonSession | null>(null)
  const catchUpPending = useRef(false)
  const studyNotesPending = useRef(new Set<string>())
  const savePending = useRef(false)
  const beginPending = useRef(false)
  const persistQueue = useRef<Promise<void>>(Promise.resolve())
  const deletionPending = useRef(new Set<string>())
  const deletedSessionIds = useRef(new Set<string>())

  useEffect(() => {
    return () => {
      void microphone.current?.stop()
    }
  }, [])

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    if (workspaceEntered) document.getElementById('main-content')?.focus()
  }, [workspaceEntered])

  useEffect(() => {
    lessonStorage
      .list()
      .then((items) =>
        setLessons(
          items.filter((item) => !deletedSessionIds.current.has(item.id)),
        ),
      )
      .catch(() =>
        setStorageError(
          'Local storage is unavailable. Sessions cannot be saved in this browser.',
        ),
      )
  }, [])

  useEffect(() => {
    if (deleteTarget && !deleteDialog.current?.open)
      deleteDialog.current?.showModal()
  }, [deleteTarget])

  useEffect(() => {
    captionEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [active?.transcript.length, interimCaption])

  async function startListening() {
    setMicrophoneError('')
    setInterimCaption('')
    const lessonId = activeRef.current?.id
    try {
      const pending = startMuseTranscription(
        ({ text, final }) => {
          const current = activeRef.current
          if (!current || current.id !== lessonId || current.status !== 'live')
            return
          if (!final) {
            setInterimCaption(text)
            return
          }
          setInterimCaption('')
          const next = {
            ...current,
            transcript: [
              ...current.transcript,
              {
                id: crypto.randomUUID(),
                atSeconds: Math.max(
                  0,
                  Math.floor(
                    (Date.now() - new Date(current.date).getTime()) / 1000,
                  ),
                ),
                speaker: 'Speaker',
                text,
              },
            ],
            updatedAt: new Date().toISOString(),
          }
          activeRef.current = next
          setActive(next)
        },
        (status) => {
          if (activeRef.current?.id !== lessonId) return
          setMuseStatus(status)
          setListening(status === 'listening')
        },
        (message) => {
          if (activeRef.current?.id === lessonId) setMicrophoneError(message)
        },
      )
      microphoneStart.current = pending
      microphone.current = await pending
      microphoneStart.current = null
    } catch (error) {
      microphoneStart.current = null
      if (activeRef.current?.id === lessonId) {
        setMicrophoneError(
          error instanceof Error
            ? error.message
            : 'Could not start Muse transcription.',
        )
        setListening(false)
        setMuseStatus('stopped')
      }
    }
  }

  async function stopListening(): Promise<boolean> {
    if (microphoneStop.current) return microphoneStop.current
    const finishing = (async () => {
      const pending = microphoneStart.current
      const current = pending
        ? await pending.catch(() => null)
        : microphone.current
      microphoneStart.current = null
      microphone.current = null
      if (current) {
        try {
          await current.stop()
        } catch (error) {
          setMicrophoneError(
            error instanceof Error
              ? error.message
              : 'Could not finish transcription.',
          )
          setListening(false)
          setInterimCaption('')
          return false
        }
      }
      setListening(false)
      setInterimCaption('')
      return true
    })()
    microphoneStop.current = finishing
    try {
      return await finishing
    } finally {
      if (microphoneStop.current === finishing) microphoneStop.current = null
    }
  }

  function navigate(next: Page) {
    if (savePending.current) return
    setMenuOpen(false)
    if (page === 'live' && next !== 'live') {
      void stopListening()
    }
    if (next === 'live' && (!active || active.status !== 'live')) {
      setPage('home')
      window.setTimeout(
        () => document.getElementById('class-title')?.focus(),
        0,
      )
      return
    }
    setPage(next)
  }

  async function beginClass() {
    if (beginPending.current) return
    beginPending.current = true
    try {
      if (!(await stopListening())) return
      const lesson = createLesson(title)
      setCatchUpNotice('')
      activeRef.current = lesson
      setActive(lesson)
      setPage('live')
      await startListening()
    } finally {
      beginPending.current = false
    }
  }

  function serializeStorage<T>(action: () => Promise<T>): Promise<T> {
    const result = persistQueue.current.catch(() => undefined).then(action)
    persistQueue.current = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async function refreshLessons(): Promise<void> {
    const items = await lessonStorage.list()
    setLessons(items.filter((item) => !deletedSessionIds.current.has(item.id)))
  }

  async function persist(lesson: LessonSession): Promise<boolean> {
    try {
      const saved = await serializeStorage(async () => {
        if (deletedSessionIds.current.has(lesson.id)) return false
        await lessonStorage.save(lesson)
        return true
      })
      if (!saved) return false
      await refreshLessons()
      setStorageError('')
      return true
    } catch {
      setStorageError(
        'Could not save this session. Check browser storage settings and try again.',
      )
      return false
    }
  }

  async function saveClass() {
    if (!active || savePending.current) return
    savePending.current = true
    setSavingClass(true)
    try {
      await finishClassSession({
        stopListening,
        getCurrent: () => activeRef.current,
        setCurrent: (lesson) => {
          activeRef.current = lesson
          setActive(lesson)
        },
        persist,
        openSaved: (lesson) => {
          setActive(lesson)
          setPage('study')
        },
        generateStudyNotes: (lesson) => void generateStudyNotes(lesson),
      })
    } finally {
      savePending.current = false
      setSavingClass(false)
    }
  }

  async function openLesson(id: string) {
    try {
      await persistQueue.current.catch(() => undefined)
      const lesson = await lessonStorage.get(id)
      if (lesson && !deletedSessionIds.current.has(id)) {
        activeRef.current = lesson
        setActive(lesson)
        setStudyNotesLoading(studyNotesPending.current.has(lesson.id))
        setStudyNotesNotice('')
        setStudyNotesCanRetry(false)
        setPage('study')
        setStorageError('')
      }
    } catch {
      setStorageError('Could not open this session from local storage.')
    }
  }

  function requestDelete(lesson: LessonSession) {
    if (deletionPending.current.has(lesson.id)) return
    setDeleteError('')
    setDeleteTarget({ id: lesson.id, title: lesson.title })
  }

  function cancelDelete() {
    if (
      deletingSession ||
      (deleteTarget && deletionPending.current.has(deleteTarget.id))
    )
      return
    setDeleteTarget(null)
    setDeleteError('')
  }

  async function confirmDelete() {
    const target = deleteTarget
    if (!target || deletionPending.current.has(target.id)) return
    setDeletingSession(true)
    setDeleteError('')
    try {
      const result = await deleteSavedSession({
        lessonId: target.id,
        pending: deletionPending.current,
        deleted: deletedSessionIds.current,
        serialize: serializeStorage,
        storage: lessonStorage,
      })
      if (result === 'missing') {
        setDeleteError('This session is no longer in local storage.')
        return
      }
      if (result !== 'deleted') return
      setLessons((items) => items.filter((item) => item.id !== target.id))
      if (activeRef.current?.id === target.id) {
        activeRef.current = null
        setActive(null)
        setPage('sessions')
      }
      setDeleteTarget(null)
      window.setTimeout(
        () => document.getElementById('sessions-heading')?.focus(),
        0,
      )
      try {
        await refreshLessons()
        setStorageError('')
      } catch {
        setStorageError(
          'Session deleted, but the session list could not be refreshed.',
        )
      }
    } catch {
      setDeleteError('Could not delete this session. Please try again.')
    } finally {
      setDeletingSession(false)
    }
  }

  function bookmark(segment: TranscriptSegment) {
    if (savePending.current) return
    const current = activeRef.current ?? active
    if (!current) return
    const exists = current.bookmarks.some(
      (item) => item.segmentId === segment.id,
    )
    const updated = {
      ...current,
      bookmarks: exists
        ? current.bookmarks.filter((item) => item.segmentId !== segment.id)
        : [
            ...current.bookmarks,
            { id: crypto.randomUUID(), segmentId: segment.id, note: '' },
          ],
    }
    activeRef.current = updated
    setActive(updated)
  }

  async function catchUp() {
    const lesson = activeRef.current ?? active
    if (!lesson || catchUpPending.current) return
    const selection = selectCatchUpContext(
      lesson.transcript,
      Math.max(
        0,
        Math.floor((Date.now() - new Date(lesson.date).getTime()) / 1000),
      ),
    )
    const context = selection.segments
    const contextNotice =
      selection.emptyReason === 'no-finalized-captions'
        ? 'No finalized captions yet. Try again after speech is finalized.'
        : selection.emptyReason === 'no-recent-captions'
          ? 'No finalized captions from the last five minutes. Try again after more speech.'
          : selection.emptyReason === 'oversized-segment'
            ? 'A caption segment is too large for a recap. Try again after another finalized segment.'
            : !hasEnoughCatchUpContext(context)
              ? 'A little more finalized speech is needed for a recap.'
              : ''
    if (import.meta.env.DEV) {
      console.info('catch_up_context', {
        finalizedSegmentsAvailable: lesson.transcript.length,
        segmentsSelected: context.length,
        selectedWordCount: context.reduce(
          (words, segment) => words + segment.text.trim().split(/\s+/).length,
          0,
        ),
        selectedCharacterCount: context.reduce(
          (characters, segment) => characters + segment.text.length,
          0,
        ),
        selectedNonWhitespaceCharacterCount: catchUpCharacterCount(context),
        requestSent: !contextNotice,
      })
    }
    if (contextNotice) {
      setCatchUpNotice(contextNotice)
      return
    }
    catchUpPending.current = true
    setCatchUpLoading(true)
    setCatchUpNotice('')
    try {
      const explanation = await museCatchUp(context)
      const current = activeRef.current
      if (!current || current.id !== lesson.id) return
      const updated = {
        ...current,
        catchUps: [...current.catchUps, explanation],
        updatedAt: new Date().toISOString(),
      }
      activeRef.current = updated
      setActive(updated)
      if (updated.status === 'saved') await persist(updated)
    } catch (error) {
      if (activeRef.current?.id === lesson.id)
        setCatchUpNotice(
          error instanceof CatchUpRequestError
            ? error.message
            : 'Could not reach Muse Spark. Please try again.',
        )
    } finally {
      catchUpPending.current = false
      setCatchUpLoading(false)
    }
  }

  async function sendQuestion(event: React.FormEvent) {
    event.preventDefault()
    if (!active || !question.trim()) return
    const asked = question.trim()
    const studentMessage = {
      id: crypto.randomUUID(),
      role: 'student' as const,
      text: asked,
      createdAt: new Date().toISOString(),
    }
    const reply = await mockReasoningService.answer(active, asked)
    const current = activeRef.current
    if (!current || current.id !== active.id) return
    const updated = {
      ...current,
      studyMessages: [...current.studyMessages, studentMessage, reply],
      updatedAt: new Date().toISOString(),
    }
    activeRef.current = updated
    setActive(updated)
    setQuestion('')
    await persist(updated)
  }

  async function updateNotes(notes: string) {
    const current = activeRef.current
    if (!active || !current || current.id !== active.id) return
    const updated = { ...current, notes, updatedAt: new Date().toISOString() }
    activeRef.current = updated
    setActive(updated)
    await persist(updated)
  }

  async function generateStudyNotes(lesson = activeRef.current ?? active) {
    if (
      !lesson ||
      lesson.status !== 'saved' ||
      lesson.studyNotes ||
      studyNotesPending.current.has(lesson.id)
    )
      return
    const isSample =
      lesson.transcriptSource === 'sample' ||
      (!lesson.transcriptSource &&
        lesson.transcript.length > 0 &&
        lesson.transcript.every((segment) => segment.id.startsWith('sample-')))
    const selection = selectStudyNotesContext(lesson.transcript)
    if (
      selection.emptyReason ||
      !hasEnoughStudyNotesContext(selection.segments)
    ) {
      setStudyNotesNotice(
        selection.emptyReason === 'oversized-segment'
          ? 'The latest caption is too large for study notes.'
          : 'More finalized captions are needed for study notes.',
      )
      setStudyNotesCanRetry(false)
      return
    }
    setStudyNotesLoading(true)
    setStudyNotesNotice('')
    setStudyNotesCanRetry(false)
    try {
      const result = await generateAndSaveStudyNotes({
        lessonId: lesson.id,
        pending: studyNotesPending.current,
        serialize: serializeStorage,
        storage: lessonStorage,
        generate: async () => {
          const content = isSample
            ? sampleStudyNotes(lesson, selection.segments)
            : await museStudyNotes(selection.segments)
          return {
            ...content,
            createdAt: new Date().toISOString(),
            source: isSample ? 'sample' : 'muse',
            throughSegmentId: selection.segments.at(-1)?.id ?? '',
            coversFullTranscript: selection.coversFullTranscript,
          }
        },
      })
      if (result.status === 'saved' || result.status === 'existing') {
        if (activeRef.current?.id === lesson.id) {
          const current = activeRef.current
          const updated = {
            ...current,
            studyNotes: current.studyNotes ?? result.lesson.studyNotes,
          }
          activeRef.current = updated
          setActive(updated)
          setStorageError('')
        }
        try {
          await refreshLessons()
        } catch {
          setStorageError('Could not refresh the saved sessions list.')
        }
      }
    } catch (error) {
      if (activeRef.current?.id === lesson.id) {
        setStudyNotesNotice(
          error instanceof StudyNotesRequestError
            ? error.message
            : 'Could not generate study notes. Please try again.',
        )
        setStudyNotesCanRetry(true)
      }
    } finally {
      studyNotesPending.current.delete(lesson.id)
      if (activeRef.current?.id === lesson.id) {
        setStudyNotesLoading(false)
      }
    }
  }

  const isSampleSession = Boolean(
    active &&
    (active.transcriptSource === 'sample' ||
      (!active.transcriptSource &&
        active.transcript.length > 0 &&
        active.transcript.every((segment) =>
          segment.id.startsWith('sample-'),
        ))),
  )
  const latestCatchUp = active?.catchUps
    .filter((item) => item.source === (isSampleSession ? 'mock' : 'muse'))
    .at(-1)

  if (!workspaceEntered) {
    return <LandingPage onEnterWorkspace={() => setWorkspaceEntered(true)} />
  }

  return (
    <div className={`app-shell ${page === 'live' ? 'live-workspace' : ''}`}>
      <aside
        className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}
        aria-label="Main navigation"
      >
        <button
          className="brand"
          onClick={() => navigate('home')}
          aria-label="ClassBridge AI home"
        >
          <span className="brand-mark">
            <AudioLines size={25} strokeWidth={2.5} />
          </span>
          <span>
            classbridge<span className="brand-ai">ai</span>
            <small>LEARNING WITHOUT BARRIERS</small>
          </span>
        </button>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Primary">
          {navigation.map((item) => (
            <button
              key={item.page}
              className={`nav-item ${page === item.page ? 'active' : ''}`}
              onClick={() => navigate(item.page)}
              aria-current={page === item.page ? 'page' : undefined}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {page === item.page && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-info">
            <div className="side-info-icon">
              <Sparkles size={18} />
            </div>
            <strong>Built for every learner</strong>
            <p>Follow along, catch up, and make every class count.</p>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            className="menu-button icon-button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <div className="mobile-brand">
            classbridge<span>ai</span>
          </div>
          <span className="workspace-label">Student workspace</span>
        </header>
        {storageError && (
          <div className="error-banner" role="alert">
            {storageError}
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          {page === 'home' && (
            <div className="page-wrap home-page">
              <div className="eyebrow">
                <span className="eyebrow-line" /> YOUR LEARNING SPACE
              </div>
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-kicker">
                    <Sparkles size={15} /> A CLEARER WAY TO LEARN
                  </span>
                  <h1>
                    Every word matters.
                    <br />
                    <em>Stay in the moment.</em>
                  </h1>
                  <p>
                    Follow classroom conversations with readable captions, save
                    what matters, and revisit it at your own pace.
                  </p>
                  <a href="#start-class" className="button button-light">
                    Start a class <ArrowRight size={18} />
                  </a>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="art-card">
                    <span className="art-live">
                      <span /> LIVE CAPTIONS
                    </span>
                    <div className="art-wave">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <p>
                      “The most recent discussion is right here, whenever you
                      need it.”
                    </p>
                    <div className="art-card-bottom">
                      <span>00:42</span>
                      <span>● ● ●</span>
                    </div>
                  </div>
                  <div className="art-sparkle">✳</div>
                </div>
              </section>
              <div className="section-header">
                <div>
                  <div className="eyebrow">GET STARTED</div>
                  <h2>Your classroom, your pace.</h2>
                </div>
              </div>
              <div className="home-grid">
                <section className="start-card" id="start-class">
                  <div className="card-icon teal">
                    <Mic size={23} />
                  </div>
                  <h3>Start a live class</h3>
                  <p>Follow your class with live microphone captions.</p>
                  <label htmlFor="class-title">Class title</label>
                  <div className="start-form">
                    <input
                      id="class-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="e.g. Biology 101"
                    />
                    <button
                      className="button button-dark"
                      onClick={() => void beginClass()}
                    >
                      Start class <ArrowRight size={17} />
                    </button>
                  </div>
                  <span className="fine-print">
                    <CircleHelp size={14} /> Muse Voice captions require
                    microphone permission and the local ClassBridge server.
                  </span>
                </section>
                <section className="sessions-card">
                  <div className="card-icon lilac">
                    <BookOpen size={23} />
                  </div>
                  <h3>Pick up where you left off</h3>
                  <p>
                    Your saved sessions stay on this device for easy review.
                  </p>
                  {lessons.length ? (
                    <div className="recent-list">
                      {lessons.slice(0, 2).map((lesson) => (
                        <button
                          key={lesson.id}
                          className="recent-item"
                          onClick={() => openLesson(lesson.id)}
                        >
                          <span className="recent-icon">
                            <FileText size={18} />
                          </span>
                          <span>
                            <strong>{lesson.title}</strong>
                            <small>
                              {shortDate(lesson.date)} ·{' '}
                              {lesson.transcript.length} captions
                            </small>
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-recent">
                      <FileText size={24} />
                      <span>
                        No saved sessions yet.
                        <br />
                        Your first class will appear here.
                      </span>
                    </div>
                  )}
                  <button
                    className="text-link"
                    onClick={() => navigate('sessions')}
                  >
                    View all sessions <ArrowRight size={17} />
                  </button>
                </section>
              </div>
              <div className="feature-strip">
                <div>
                  <Volume2 size={21} />
                  <span>Readable captions</span>
                </div>
                <div>
                  <Clock3 size={21} />
                  <span>Catch up anytime</span>
                </div>
                <div>
                  <Bookmark size={21} />
                  <span>Save key moments</span>
                </div>
              </div>
            </div>
          )}

          {page === 'live' && active && (
            <div className="page-wrap live-page">
              <div className="page-heading live-page-heading">
                <div>
                  <span
                    className={`live-page-status live-page-status-${microphoneError && museStatus === 'stopped' ? 'error' : museStatus}`}
                    role="status"
                  >
                    <span aria-hidden="true" />
                    {museStatus === 'listening'
                      ? 'Microphone listening'
                      : museStatus === 'connecting'
                        ? 'Connecting to Muse Voice'
                        : museStatus === 'finishing'
                          ? 'Finalizing captions'
                          : microphoneError
                            ? 'Microphone unavailable'
                            : 'Microphone paused'}
                  </span>
                  <h1>{active.title}</h1>
                  <p>
                    {shortDate(active.date)}{' '}
                    <span className="separator">·</span> Live class
                  </p>
                </div>
                <button
                  type="button"
                  className="button button-dark live-save-button"
                  onClick={() => void saveClass()}
                  disabled={savingClass}
                  aria-busy={savingClass}
                >
                  <Check size={17} />{' '}
                  {savingClass ? 'Finalizing and saving...' : 'Save & finish'}
                </button>
              </div>
              <div className="live-layout">
                <section className="caption-card">
                  <div className="card-top">
                    <div>
                      <h2>Live captions</h2>
                      <p>
                        Finalized speech appears here as the class continues.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="live-microphone-control"
                      onClick={() => {
                        if (listening) void stopListening()
                        else void startListening()
                      }}
                      disabled={
                        savingClass ||
                        museStatus === 'connecting' ||
                        museStatus === 'finishing'
                      }
                      aria-label={
                        museStatus === 'connecting'
                          ? 'Connecting to Muse Voice'
                          : museStatus === 'finishing'
                            ? 'Finalizing microphone transcription'
                            : listening
                              ? 'Pause microphone transcription'
                              : 'Resume microphone transcription'
                      }
                    >
                      {listening ? <Pause size={19} /> : <Play size={19} />}
                      <span>
                        {museStatus === 'connecting'
                          ? 'Connecting...'
                          : museStatus === 'finishing'
                            ? 'Finishing...'
                            : listening
                              ? 'Pause microphone'
                              : 'Resume microphone'}
                      </span>
                    </button>
                  </div>
                  <div
                    className="caption-scroll"
                    role="log"
                    aria-label="Microphone live captions"
                    aria-live="polite"
                  >
                    {active.transcript.length ? (
                      active.transcript.map((segment) => (
                        <div className="caption-line" key={segment.id}>
                          <span className="caption-time">
                            {formatTime(segment.atSeconds)}
                          </span>
                          <div>
                            <p>{segment.text}</p>
                          </div>
                          <button
                            className={`bookmark-button ${active.bookmarks.some((item) => item.segmentId === segment.id) ? 'bookmarked' : ''}`}
                            disabled={savingClass}
                            aria-label={
                              active.bookmarks.some(
                                (item) => item.segmentId === segment.id,
                              )
                                ? `Remove bookmark at ${formatTime(segment.atSeconds)}`
                                : `Bookmark caption at ${formatTime(segment.atSeconds)}`
                            }
                            onClick={() => bookmark(segment)}
                          >
                            <Bookmark
                              size={18}
                              fill={
                                active.bookmarks.some(
                                  (item) => item.segmentId === segment.id,
                                )
                                  ? 'currentColor'
                                  : 'none'
                              }
                            />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="waiting">
                        <AudioLines size={34} />
                        <strong>
                          {listening
                            ? 'Listening for speech...'
                            : museStatus === 'connecting'
                              ? 'Connecting to Muse Voice...'
                              : museStatus === 'finishing'
                                ? 'Finalizing captions...'
                                : 'Microphone is paused'}
                        </strong>
                        <span>Recognized speech will appear here.</span>
                      </div>
                    )}
                    {interimCaption && (
                      <p className="interim-caption">
                        <span className="interim-label">In progress</span>
                        {interimCaption}
                      </p>
                    )}
                    <div ref={captionEnd} />
                  </div>
                  {microphoneError && (
                    <div className="microphone-error" role="alert">
                      {microphoneError}
                    </div>
                  )}
                  <div
                    className={`caption-footer caption-footer-${microphoneError && museStatus === 'stopped' ? 'error' : museStatus}`}
                  >
                    <span>
                      <span className="status-dot" />{' '}
                      {museStatus === 'listening'
                        ? 'Muse Voice listening'
                        : museStatus === 'connecting'
                          ? 'Connecting to Muse Voice'
                          : museStatus === 'finishing'
                            ? 'Finalizing captions'
                            : microphoneError
                              ? 'Microphone unavailable'
                              : 'Microphone paused'}
                    </span>
                    <span>{active.transcript.length} caption segments</span>
                  </div>
                </section>
                <aside className="live-side">
                  <section className="catch-card">
                    <div className="card-icon lilac">
                      <Sparkles size={22} />
                    </div>
                    <h2>Missed a moment?</h2>
                    <p>Get a quick recap of the most recent captions.</p>
                    <button
                      type="button"
                      className="button button-dark full live-catch-button"
                      onClick={catchUp}
                      disabled={catchUpLoading || savingClass}
                    >
                      {catchUpLoading ? 'Generating recap...' : 'Catch me up'}{' '}
                      <ArrowRight size={17} />
                    </button>
                    <span className="recap-source">
                      Muse Spark recap · based on finalized captions
                    </span>
                    {catchUpNotice && (
                      <div className="catch-notice" role="status">
                        {catchUpNotice}
                      </div>
                    )}
                    {latestCatchUp && (
                      <div className="catch-result" role="status">
                        <strong>Muse Spark catch-up</strong>
                        <p>{latestCatchUp.text}</p>
                      </div>
                    )}
                  </section>
                  <section className="tip-card">
                    <Bookmark size={19} />
                    <div>
                      <strong>Save the important parts</strong>
                      <p>
                        Use the bookmark icon beside any caption to find it
                        later.
                      </p>
                    </div>
                  </section>
                </aside>
              </div>
            </div>
          )}

          {page === 'sessions' && (
            <div className="page-wrap sessions-page">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" /> YOUR LIBRARY
                  </div>
                  <h1 id="sessions-heading" tabIndex={-1}>
                    My sessions
                  </h1>
                  <p>Lectures you saved on this device, ready when you are.</p>
                </div>
                <button
                  className="button button-dark"
                  onClick={() => navigate('home')}
                >
                  <Plus size={18} /> New class
                </button>
              </div>
              {lessons.length ? (
                <div className="session-list">
                  {lessons.map((lesson) => (
                    <div className="session-row" key={lesson.id}>
                      <button
                        type="button"
                        className="session-row-open"
                        onClick={() => void openLesson(lesson.id)}
                        aria-label={`Open ${lesson.title}`}
                      >
                        <span className="session-icon">
                          <FileText size={23} />
                        </span>
                        <span className="session-details">
                          <strong>{lesson.title}</strong>
                          <small>
                            {shortDate(lesson.date)} <span>·</span>{' '}
                            {lesson.transcript.length} captions <span>·</span>{' '}
                            {lesson.bookmarks.length} bookmarks
                          </small>
                        </span>
                        <span className="session-open">
                          Open session <ArrowRight size={17} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="session-delete"
                        onClick={() => requestDelete(lesson)}
                        aria-label={`Delete ${lesson.title}`}
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sessions-empty">
                  <div className="card-icon lilac">
                    <BookOpen size={26} />
                  </div>
                  <h2>No saved sessions yet</h2>
                  <p>
                    Start a class, then save it to build your study library.
                  </p>
                  <button
                    className="button button-dark"
                    onClick={() => navigate('home')}
                  >
                    Start a class <ArrowRight size={17} />
                  </button>
                </div>
              )}
            </div>
          )}

          {page === 'study' && active && (
            <div className="page-wrap study-page">
              <button
                className="back-link"
                onClick={() => navigate('sessions')}
              >
                <ArrowLeft size={17} /> My sessions
              </button>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" /> STUDY SESSION
                  </div>
                  <h1>{active.title}</h1>
                  <p>
                    {shortDate(active.date)}{' '}
                    <span className="separator">·</span>{' '}
                    {active.transcript.length} transcript segments
                  </p>
                </div>
                <span className="saved-pill">
                  <Check size={15} />{' '}
                  {isSampleSession
                    ? 'Sample session · Saved locally'
                    : 'Saved locally'}
                </span>
              </div>
              <div
                className={`study-layout ${isSampleSession ? '' : 'study-layout-full'}`}
              >
                <div className="study-main">
                  <section className="study-card">
                    <div className="study-card-heading">
                      <div className="card-icon teal">
                        <FileText size={21} />
                      </div>
                      <div>
                        <h2>Class transcript</h2>
                        <p>Review what was said, in order.</p>
                      </div>
                    </div>
                    {active.transcript.length ? (
                      <div className="study-transcript">
                        {active.transcript.map((segment) => (
                          <div className="study-line" key={segment.id}>
                            <time>{formatTime(segment.atSeconds)}</time>
                            <div>
                              <strong>{segment.speaker}</strong>
                              <p>{segment.text}</p>
                            </div>
                            {active.bookmarks.some(
                              (item) => item.segmentId === segment.id,
                            ) && (
                              <Bookmark
                                size={16}
                                fill="currentColor"
                                className="saved-bookmark"
                                aria-label="Bookmarked"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-text">
                        {isSampleSession
                          ? 'No captions were recorded in this sample session.'
                          : 'No finalized captions were recorded in this session.'}
                      </p>
                    )}
                  </section>
                  <section className="study-card">
                    <div className="study-card-heading">
                      <div className="card-icon lilac">
                        <Sparkles size={21} />
                      </div>
                      <div>
                        <h2>Study notes</h2>
                        <p>Based on finalized class captions.</p>
                      </div>
                    </div>
                    {active.studyNotes && (
                      <div className="generated-notes">
                        <p className="fine-print">
                          {active.studyNotes.source === 'sample'
                            ? 'Sample study notes · based on simulated captions, not AI output'
                            : 'Muse Spark study notes · based on finalized captions'}
                        </p>
                        {!active.studyNotes.coversFullTranscript && (
                          <p className="coverage-notice">
                            Notes cover the latest part of this class.
                          </p>
                        )}
                        <h3>Overview</h3>
                        <p>{active.studyNotes.overview}</p>
                        <h3>Key concepts</h3>
                        {active.studyNotes.concepts.length ? (
                          <ul>
                            {active.studyNotes.concepts.map(
                              (concept, index) => (
                                <li key={`${concept.title}-${index}`}>
                                  <strong>{concept.title}</strong> —{' '}
                                  {concept.explanation}
                                </li>
                              ),
                            )}
                          </ul>
                        ) : (
                          <p>
                            No concepts could be identified from these captions.
                          </p>
                        )}
                        <h3>Important takeaways</h3>
                        <ul>
                          {active.studyNotes.takeaways.map(
                            (takeaway, index) => (
                              <li key={index}>{takeaway}</li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                    {studyNotesNotice && (
                      <p className="empty-text" role="status">
                        {studyNotesNotice}
                      </p>
                    )}
                    {studyNotesLoading && (
                      <p className="empty-text" role="status">
                        Generating study notes...
                      </p>
                    )}
                    {(studyNotesCanRetry ||
                      (!active.studyNotes &&
                        !studyNotesLoading &&
                        !studyNotesNotice)) && (
                      <button
                        type="button"
                        className="button button-dark"
                        onClick={() => void generateStudyNotes()}
                      >
                        <Sparkles size={16} />
                        {studyNotesCanRetry
                          ? 'Retry Study Notes'
                          : 'Generate Study Notes'}
                      </button>
                    )}
                  </section>
                  <section className="study-card">
                    <div className="study-card-heading">
                      <div className="card-icon coral">
                        <Bookmark size={21} />
                      </div>
                      <div>
                        <h2>Bookmarked moments</h2>
                        <p>Saved moments from the transcript.</p>
                      </div>
                    </div>
                    {active.bookmarks.length ? (
                      active.bookmarks.map((bookmark) => {
                        const segment = active.transcript.find(
                          (item) => item.id === bookmark.segmentId,
                        )
                        return segment ? (
                          <div className="study-line" key={bookmark.id}>
                            <time>{formatTime(segment.atSeconds)}</time>
                            <div>
                              <strong>{segment.speaker}</strong>
                              <p>{segment.text}</p>
                            </div>
                          </div>
                        ) : null
                      })
                    ) : (
                      <p className="empty-text">No bookmarked moments yet.</p>
                    )}
                  </section>
                  <section className="study-card notes-card">
                    <div className="study-card-heading">
                      <div className="card-icon lilac">
                        <FileText size={21} />
                      </div>
                      <div>
                        <h2>My notes</h2>
                        <p>
                          Write down what you want to remember. Notes save on
                          this device.
                        </p>
                      </div>
                    </div>
                    <label className="sr-only" htmlFor="lesson-notes">
                      Your notes
                    </label>
                    <textarea
                      id="lesson-notes"
                      value={active.notes}
                      onChange={(event) => {
                        const current =
                          activeRef.current?.id === active.id
                            ? activeRef.current
                            : active
                        const updated = {
                          ...current,
                          notes: event.target.value,
                        }
                        activeRef.current = updated
                        setActive(updated)
                      }}
                      onBlur={(event) => updateNotes(event.target.value)}
                      placeholder="Add your thoughts, questions, or key takeaways..."
                      rows={5}
                    />
                    <span className="fine-print">
                      Saved when you leave the notes field.
                    </span>
                  </section>
                </div>
                {isSampleSession && (
                  <aside className="study-side">
                    <section className="study-card concepts-card">
                      <div className="study-card-heading">
                        <div className="card-icon coral">
                          <GraduationCap size={21} />
                        </div>
                        <div>
                          <h2>Key concepts</h2>
                          <p>Sample topics from this lesson</p>
                        </div>
                      </div>
                      {active.concepts.map((concept) => (
                        <div className="concept" key={concept.id}>
                          <span className="concept-dot" />
                          <div>
                            <strong>{concept.title}</strong>
                            <p>{concept.description}</p>
                          </div>
                        </div>
                      ))}
                    </section>
                    <section className="study-card ask-card">
                      <div className="study-card-heading">
                        <div className="card-icon teal">
                          <MessageCircle size={21} />
                        </div>
                        <div>
                          <h2>Study helper</h2>
                          <p>Try the mock study interface</p>
                        </div>
                      </div>
                      <div className="mock-banner">
                        <Sparkles size={16} />
                        <span>
                          MOCK AI RESPONSES — no AI service is connected.
                        </span>
                      </div>
                      <div
                        className="chat-messages"
                        role="log"
                        aria-label="Study conversation"
                      >
                        {active.studyMessages.length ? (
                          active.studyMessages.map((message) => (
                            <div
                              key={message.id}
                              className={`chat-bubble ${message.role}`}
                            >
                              {message.role === 'assistant' && (
                                <strong>Mock study helper</strong>
                              )}
                              <p>{message.text}</p>
                            </div>
                          ))
                        ) : (
                          <div className="chat-empty">
                            <Sparkles size={22} />
                            <p>
                              Ask a question about this lesson to see how study
                              support will work.
                            </p>
                          </div>
                        )}
                      </div>
                      <form className="ask-form" onSubmit={sendQuestion}>
                        <label className="sr-only" htmlFor="study-question">
                          Ask about this lesson
                        </label>
                        <input
                          id="study-question"
                          value={question}
                          onChange={(event) => setQuestion(event.target.value)}
                          placeholder="Ask about this lesson..."
                        />
                        <button
                          type="submit"
                          aria-label="Send question"
                          disabled={!question.trim()}
                        >
                          <Send size={18} />
                        </button>
                      </form>
                    </section>
                  </aside>
                )}
              </div>
            </div>
          )}
        </main>
        {deleteTarget && (
          <dialog
            ref={deleteDialog}
            className="delete-dialog"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            onCancel={(event) => {
              if (
                deletingSession ||
                deletionPending.current.has(deleteTarget.id)
              )
                event.preventDefault()
              else cancelDelete()
            }}
          >
            <h2 id="delete-dialog-title">Delete “{deleteTarget.title}”?</h2>
            <p id="delete-dialog-description">
              This permanently deletes this saved session and all its captions,
              bookmarks, Study Notes, and personal notes. This cannot be undone.
            </p>
            {deleteError && (
              <p className="delete-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="delete-dialog-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={cancelDelete}
                disabled={deletingSession}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={() => void confirmDelete()}
                disabled={deletingSession}
              >
                {deletingSession ? 'Deleting...' : 'Delete session'}
              </button>
            </div>
          </dialog>
        )}
        <footer className="mobile-nav" aria-label="Mobile navigation">
          {navigation.map((item) => (
            <button
              key={item.page}
              className={page === item.page ? 'active' : ''}
              onClick={() => navigate(item.page)}
              aria-current={page === item.page ? 'page' : undefined}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </footer>
      </div>
    </div>
  )
}

export default App
