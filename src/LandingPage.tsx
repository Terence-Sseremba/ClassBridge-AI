import { useEffect, useRef } from 'react'
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  Bookmark,
  Check,
  Clock3,
  Mic,
  Sparkles,
} from 'lucide-react'
import './LandingPage.css'

interface LandingPageProps {
  onEnterWorkspace: () => void
}

export default function LandingPage({ onEnterWorkspace }: LandingPageProps) {
  const page = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (
      !page.current ||
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('landing-revealed')
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.12 },
    )
    page.current.querySelectorAll('[data-reveal]').forEach((section) => {
      observer.observe(section)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="landing-shell" ref={page}>
      <a className="landing-skip" href="#landing-main">
        Skip to content
      </a>
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <a
            className="landing-brand"
            href="#top"
            aria-label="ClassBridge AI home"
          >
            <span className="landing-brand-icon" aria-hidden="true">
              <AudioLines size={24} strokeWidth={2.4} />
            </span>
            <span>ClassBridge AI</span>
          </a>
          <nav aria-label="Landing page">
            <a href="#how-it-works">How it works</a>
          </nav>
        </div>
      </header>

      <main id="landing-main">
        <section className="landing-hero landing-container" id="top">
          <div className="landing-hero-glow" aria-hidden="true" />
          <div className="landing-hero-content" data-reveal>
            <p className="landing-intro">A clearer way to learn in class</p>
            <h1>
              Make Every Classroom Moment Accessible, Visible, and Memorable.
            </h1>
            <p className="landing-description">
              ClassBridge AI helps deaf and hard-of-hearing students follow
              classroom conversations with captions, catch up on missed moments,
              and revisit what they learned afterward.
            </p>
            <button
              className="landing-primary-action"
              type="button"
              onClick={onEnterWorkspace}
            >
              Try ClassBridge AI <ArrowRight size={20} aria-hidden="true" />
            </button>
            <p className="landing-action-note">
              Explore the workspace first. Your microphone starts only when you
              choose to begin a live class.
            </p>
          </div>
        </section>

        <section
          className="landing-demo landing-container"
          id="how-it-works"
          aria-labelledby="landing-demo-title"
          data-reveal
        >
          <div className="landing-section-heading">
            <p className="landing-section-label">The class journey</p>
            <h2 id="landing-demo-title">Follow. Recover. Remember.</h2>
            <p>
              See how a class moves from live captions to a quick recap and
              saved study notes.
            </p>
          </div>
          <p className="landing-preview-disclosure">
            Illustrative preview only. These are example captions and notes, not
            live microphone data or generated AI output.
          </p>
          <div className="landing-journey">
            <article className="landing-step" data-reveal>
              <div className="landing-step-top">
                <span
                  className="landing-step-icon landing-step-blue"
                  aria-hidden="true"
                >
                  <Mic size={22} />
                </span>
                <span className="landing-step-number">01</span>
              </div>
              <h3>Follow</h3>
              <p>Read finalized classroom captions as the lesson unfolds.</p>
              <div
                className="landing-example"
                aria-label="Example caption preview"
              >
                <span className="landing-example-label">Caption preview</span>
                <p>
                  <span className="landing-example-time">00:12</span> We will
                  review the three steps, then compare what changed.
                </p>
                <p>
                  <span className="landing-example-time">00:27</span> The second
                  step is where we pause and check the result.
                </p>
              </div>
            </article>

            <article className="landing-step" data-reveal>
              <div className="landing-step-top">
                <span
                  className="landing-step-icon landing-step-lavender"
                  aria-hidden="true"
                >
                  <Clock3 size={22} />
                </span>
                <span className="landing-step-number">02</span>
              </div>
              <h3>Recover</h3>
              <p>
                Catch Me Up uses recent finalized captions to recap a missed
                moment.
              </p>
              <div
                className="landing-example landing-recap"
                aria-label="Example recap preview"
              >
                <span className="landing-example-label">
                  <Sparkles size={15} aria-hidden="true" /> Recap preview
                </span>
                <p>
                  The class reviewed three steps and paused at the second step
                  to check the result.
                </p>
              </div>
            </article>

            <article className="landing-step" data-reveal>
              <div className="landing-step-top">
                <span
                  className="landing-step-icon landing-step-mint"
                  aria-hidden="true"
                >
                  <BookOpen size={22} />
                </span>
                <span className="landing-step-number">03</span>
              </div>
              <h3>Remember</h3>
              <p>
                Return to a saved transcript, study notes, and bookmarked
                moments.
              </p>
              <div
                className="landing-example landing-notes"
                aria-label="Example saved study notes preview"
              >
                <span className="landing-example-label">
                  Study notes preview
                </span>
                <p>
                  <Check size={16} aria-hidden="true" /> Overview and key
                  takeaways from the captions
                </p>
                <p>
                  <Bookmark size={16} aria-hidden="true" /> Your saved moments
                  stay with the class
                </p>
              </div>
            </article>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <strong>ClassBridge AI</strong>
          <span>Your saved classes stay on this device.</span>
        </div>
      </footer>
    </div>
  )
}
