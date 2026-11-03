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
  Volume2,
  X,
} from 'lucide-react'
import { lessonStorage } from './storage/lessons'
import { mockReasoningService } from './services/reasoning'
import { mockTranscriptionService } from './services/transcription'
import { startMuseTranscription } from './services/museTranscription'
import type { MuseSession, MuseStatus } from './services/museTranscription'
import type { LessonSession, TranscriptSegment } from './types/lesson'
import { formatTime } from './types/lesson'

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
    title: title.trim() || 'Untitled class',
    date: now,
    updatedAt: now,
    status: 'live',
    transcript: [],
    concepts: [
      {
        id: 'photosynthesis',
        title: 'Photosynthesis',
        description: 'How plants turn light into stored chemical energy.',
      },
      {
        id: 'calvin-cycle',
        title: 'Calvin cycle',
        description: 'A stage that uses carbon dioxide to build sugars.',
      },
    ],
    bookmarks: [],
    catchUps: [],
    studyMessages: [],
    notes: '',
  }
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [lessons, setLessons] = useState<LessonSession[]>([])
  const [active, setActive] = useState<LessonSession | null>(null)
  const [title, setTitle] = useState('Introduction to Photosynthesis')
  const [playing, setPlaying] = useState(true)
  const [transcriptionMode, setTranscriptionMode] = useState<
    'sample' | 'microphone'
  >('sample')
  const [listening, setListening] = useState(false)
  const [museStatus, setMuseStatus] = useState<MuseStatus>('stopped')
  const [interimCaption, setInterimCaption] = useState('')
  const [microphoneError, setMicrophoneError] = useState('')
  const [question, setQuestion] = useState('')
  const [storageError, setStorageError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const captionEnd = useRef<HTMLDivElement>(null)
  const microphone = useRef<MuseSession | null>(null)
  const microphoneStart = useRef<Promise<MuseSession> | null>(null)
  const activeRef = useRef<LessonSession | null>(null)

  useEffect(() => {
    return () => {
      void microphone.current?.stop()
    }
  }, [])

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    lessonStorage
      .list()
      .then(setLessons)
      .catch(() =>
        setStorageError(
          'Local storage is unavailable. Sessions cannot be saved in this browser.',
        ),
      )
  }, [])

  useEffect(() => {
    if (
      page !== 'live' ||
      !active ||
      !playing ||
      transcriptionMode !== 'sample' ||
      active.status !== 'live'
    )
      return
    const timer = window.setInterval(() => {
      setActive((current) => {
        if (!current || current.status !== 'live') return current
        const next = mockTranscriptionService.nextSegment(
          current.transcript.length,
        )
        if (!next) {
          window.clearInterval(timer)
          return current
        }
        return {
          ...current,
          transcript: [...current.transcript, next],
          updatedAt: new Date().toISOString(),
        }
      })
    }, 3600)
    return () => window.clearInterval(timer)
  }, [page, active, playing, transcriptionMode])

  useEffect(() => {
    captionEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [active?.transcript.length, interimCaption])

  async function startListening() {
    setMicrophoneError('')
    setInterimCaption('')
    try {
      const pending = startMuseTranscription(
        ({ text, final }) => {
          if (!final) {
            setInterimCaption(text)
            return
          }
          setInterimCaption('')
          const current = activeRef.current
          if (!current || current.status !== 'live') return
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
          setMuseStatus(status)
          setListening(status === 'listening')
        },
        setMicrophoneError,
      )
      microphoneStart.current = pending
      microphone.current = await pending
      microphoneStart.current = null
    } catch (error) {
      microphoneStart.current = null
      setMicrophoneError(
        error instanceof Error
          ? error.message
          : 'Could not start Muse transcription.',
      )
      setListening(false)
      setMuseStatus('stopped')
    }
  }

  async function stopListening(): Promise<boolean> {
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
  }

  function navigate(next: Page) {
    setMenuOpen(false)
    if (
      page === 'live' &&
      next !== 'live' &&
      transcriptionMode === 'microphone'
    ) {
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

  function beginClass() {
    void stopListening()
    const lesson = createLesson(title)
    activeRef.current = lesson
    setActive(lesson)
    setPlaying(true)
    setPage('live')
    if (transcriptionMode === 'microphone') void startListening()
  }

  async function persist(lesson: LessonSession): Promise<boolean> {
    try {
      await lessonStorage.save(lesson)
      setLessons(await lessonStorage.list())
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
    if (!active) return
    if (transcriptionMode === 'microphone' && !(await stopListening())) return
    const saved = {
      ...(activeRef.current ?? active),
      status: 'saved' as const,
      updatedAt: new Date().toISOString(),
    }
    if (await persist(saved)) {
      activeRef.current = saved
      setActive(saved)
      setPlaying(false)
      setPage('study')
    }
  }

  async function openLesson(id: string) {
    try {
      const lesson = await lessonStorage.get(id)
      if (lesson) {
        setActive(lesson)
        setPage('study')
        setStorageError('')
      }
    } catch {
      setStorageError('Could not open this session from local storage.')
    }
  }

  function bookmark(segment: TranscriptSegment) {
    if (!active) return
    const exists = active.bookmarks.some(
      (item) => item.segmentId === segment.id,
    )
    setActive({
      ...active,
      bookmarks: exists
        ? active.bookmarks.filter((item) => item.segmentId !== segment.id)
        : [
            ...active.bookmarks,
            { id: crypto.randomUUID(), segmentId: segment.id, note: '' },
          ],
    })
  }

  async function catchUp() {
    if (!active) return
    const explanation = await mockReasoningService.catchUp(active)
    setActive({ ...active, catchUps: [...active.catchUps, explanation] })
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
    const updated = {
      ...active,
      studyMessages: [...active.studyMessages, studentMessage, reply],
      updatedAt: new Date().toISOString(),
    }
    setActive(updated)
    setQuestion('')
    await persist(updated)
  }

  async function updateNotes(notes: string) {
    if (!active) return
    const updated = { ...active, notes, updatedAt: new Date().toISOString() }
    setActive(updated)
    await persist(updated)
  }

  return (
    <div className="app-shell">
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
          <div className="sidebar-footer">
            <span className="status-dot" /> Foundation prototype{' '}
            <span>v0.1</span>
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
          <div className="topbar-right">
            <span className="prototype-pill">
              <span className="status-dot" /> FOUNDATION PROTOTYPE
            </span>
            <div className="avatar" aria-hidden="true">
              CB
            </div>
          </div>
        </header>
        {storageError && (
          <div className="error-banner" role="alert">
            {storageError}
          </div>
        )}
        <main id="main-content">
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
                    {transcriptionMode === 'sample' ? (
                      <AudioLines size={23} />
                    ) : (
                      <Mic size={23} />
                    )}
                  </div>
                  <h3>Start a live class</h3>
                  <p>
                    Follow sample captions or transcribe speech from your
                    microphone.
                  </p>
                  <fieldset className="mode-choice">
                    <legend>Caption source</legend>
                    <label>
                      <input
                        type="radio"
                        name="caption-source"
                        checked={transcriptionMode === 'sample'}
                        onChange={() => setTranscriptionMode('sample')}
                      />{' '}
                      Sample class
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="caption-source"
                        checked={transcriptionMode === 'microphone'}
                        onChange={() => setTranscriptionMode('microphone')}
                      />{' '}
                      Microphone
                    </label>
                  </fieldset>
                  <label htmlFor="class-title">Class title</label>
                  <div className="start-form">
                    <input
                      id="class-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="e.g. Biology 101"
                    />
                    <button className="button button-dark" onClick={beginClass}>
                      Start class <ArrowRight size={17} />
                    </button>
                  </div>
                  <span className="fine-print">
                    <CircleHelp size={14} />{' '}
                    {transcriptionMode === 'sample'
                      ? 'Sample class uses simulated captions.'
                      : 'Muse Voice captions require microphone permission and the local ClassBridge server.'}
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
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" /> LIVE CLASSROOM
                  </div>
                  <h1>{active.title}</h1>
                  <p>
                    {shortDate(active.date)}{' '}
                    <span className="separator">·</span>{' '}
                    {transcriptionMode === 'sample'
                      ? 'Simulated classroom session'
                      : 'Microphone session'}
                  </p>
                </div>
                <button className="button button-outline" onClick={saveClass}>
                  <Check size={17} /> Save & finish
                </button>
              </div>
              <div className="live-layout">
                <section className="caption-card">
                  <div className="card-top">
                    <div>
                      <span className="live-indicator">
                        <span />{' '}
                        {transcriptionMode === 'sample'
                          ? 'SIMULATED LIVE'
                          : museStatus === 'listening'
                            ? 'MUSE VOICE LIVE'
                            : museStatus === 'connecting'
                              ? 'CONNECTING TO MUSE'
                              : museStatus === 'finishing'
                                ? 'FINISHING TRANSCRIPT'
                                : 'MICROPHONE PAUSED'}
                      </span>
                      <h2>Live captions</h2>
                    </div>
                    <button
                      className="icon-button playback"
                      onClick={() => {
                        if (transcriptionMode === 'sample') setPlaying(!playing)
                        else if (listening) void stopListening()
                        else void startListening()
                      }}
                      disabled={
                        museStatus === 'connecting' ||
                        museStatus === 'finishing'
                      }
                      aria-label={
                        transcriptionMode === 'microphone'
                          ? listening
                            ? 'Pause microphone transcription'
                            : 'Resume microphone transcription'
                          : playing
                            ? 'Pause simulated captions'
                            : 'Resume simulated captions'
                      }
                    >
                      {(
                        transcriptionMode === 'microphone' ? listening : playing
                      ) ? (
                        <Pause size={19} />
                      ) : (
                        <Play size={19} />
                      )}
                    </button>
                  </div>
                  <div
                    className="caption-scroll"
                    role="log"
                    aria-label={
                      transcriptionMode === 'sample'
                        ? 'Simulated live captions'
                        : 'Microphone live captions'
                    }
                    aria-live="polite"
                  >
                    {active.transcript.length ? (
                      active.transcript.map((segment) => (
                        <div className="caption-line" key={segment.id}>
                          <span className="caption-time">
                            {formatTime(segment.atSeconds)}
                          </span>
                          <div>
                            <strong>{segment.speaker}</strong>
                            <p>{segment.text}</p>
                          </div>
                          <button
                            className={`bookmark-button ${active.bookmarks.some((item) => item.segmentId === segment.id) ? 'bookmarked' : ''}`}
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
                          {transcriptionMode === 'sample'
                            ? 'Captions are starting...'
                            : listening
                              ? 'Listening for speech...'
                              : museStatus === 'connecting'
                                ? 'Connecting to Muse Voice...'
                                : 'Microphone is paused'}
                        </strong>
                        <span>
                          {transcriptionMode === 'sample'
                            ? 'Sample classroom dialogue will appear in a moment.'
                            : 'Recognized speech will appear here.'}
                        </span>
                      </div>
                    )}
                    {interimCaption && transcriptionMode === 'microphone' && (
                      <p className="interim-caption">{interimCaption}</p>
                    )}
                    <div ref={captionEnd} />
                  </div>
                  {microphoneError && transcriptionMode === 'microphone' && (
                    <div className="microphone-error" role="alert">
                      {microphoneError}
                    </div>
                  )}
                  <div className="caption-footer">
                    <span>
                      <span className="status-dot" />{' '}
                      {transcriptionMode === 'sample'
                        ? playing
                          ? 'Sample playback running'
                          : 'Sample playback paused'
                        : museStatus === 'listening'
                          ? 'Muse Voice listening'
                          : museStatus === 'connecting'
                            ? 'Connecting to Muse Voice'
                            : museStatus === 'finishing'
                              ? 'Finalizing captions'
                              : 'Microphone paused'}
                    </span>
                    <span>{active.transcript.length} caption segments</span>
                  </div>
                </section>
                <aside className="live-side">
                  <section className="catch-card">
                    <div className="card-icon coral">
                      <Sparkles size={22} />
                    </div>
                    <h2>Missed a moment?</h2>
                    <p>Get a quick recap of the most recent captions.</p>
                    <button
                      className="button button-dark full"
                      onClick={catchUp}
                    >
                      Catch me up <ArrowRight size={17} />
                    </button>
                    <span className="mock-note">
                      Mock recap · based on visible captions
                    </span>
                    {active.catchUps.length > 0 && (
                      <div className="catch-result" role="status">
                        <strong>Mock catch-up</strong>
                        <p>{active.catchUps.at(-1)?.text}</p>
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
                  <h1>My sessions</h1>
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
                    <button
                      className="session-row"
                      key={lesson.id}
                      onClick={() => openLesson(lesson.id)}
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
                  ))}
                </div>
              ) : (
                <div className="sessions-empty">
                  <div className="card-icon lilac">
                    <BookOpen size={26} />
                  </div>
                  <h2>No saved sessions yet</h2>
                  <p>
                    Start a sample class, then save it to build your study
                    library.
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
                  <Check size={15} /> Saved locally
                </span>
              </div>
              <div className="study-layout">
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
                        No captions were recorded in this sample session.
                      </p>
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
                        setActive({ ...active, notes: event.target.value })
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
              </div>
            </div>
          )}
        </main>
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
