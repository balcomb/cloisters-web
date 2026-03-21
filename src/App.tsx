import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  applyMove,
  buildOccupancy,
  cells,
  chooseAutomatonMove,
  getCoveredPositions,
  gridSize,
  isOpen,
  scoreAnchors,
  type Anchor,
  type Player,
  type Position,
  type SkillLevel,
} from './game/game'
import { loadBotGame, saveBotGame, type BotGameState } from './services/botGameStore'
import { signInWithGoogle, signOutUser, subscribeToAuth } from './services/auth'
import type { User } from 'firebase/auth'
import './App.css'

const initialAnchors: Anchor[] = []

function App() {
  const [screen, setScreen] = useState<'home' | 'game'>('home')
  const [anchors, setAnchors] = useState<Anchor[]>(initialAnchors)
  const [nextId, setNextId] = useState(1)
  const [activePlayer, setActivePlayer] = useState<Player>('blue')
  const [selected, setSelected] = useState<Position | null>(null)
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('basic')
  const [lastMove, setLastMove] = useState<Position | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [resumePrompt, setResumePrompt] = useState<SkillLevel | null>(null)
  const [savedGames, setSavedGames] = useState<Record<SkillLevel, BotGameState | null>>({
    basic: null,
    advanced: null,
  })
  const [savedBySkill, setSavedBySkill] = useState<Record<SkillLevel, boolean>>({
    basic: false,
    advanced: false,
  })
  const [loadedBySkill, setLoadedBySkill] = useState<Record<SkillLevel, boolean>>({
    basic: false,
    advanced: false,
  })

  const occupancy = useMemo(() => buildOccupancy(anchors), [anchors])
  const openCount = gridSize * gridSize - occupancy.size
  const isOver = openCount === 0
  const scores = useMemo(() => scoreAnchors(anchors), [anchors])
  const lastMoveKeys = useMemo(() => {
    if (!lastMove) return new Set<string>()
    const anchor = anchors.find((item) => item.x === lastMove.x && item.y === lastMove.y)
    if (!anchor) return new Set<string>()
    return new Set(getCoveredPositions(anchor).map((pos) => `${pos.x},${pos.y}`))
  }, [anchors, lastMove])

  useEffect(() => {
    return subscribeToAuth((state) => {
      setUser(state.user)
      setAuthLoading(state.loading)
      if (!state.user) {
        setSavedGames({ basic: null, advanced: null })
        setSavedBySkill({ basic: false, advanced: false })
        setLoadedBySkill({ basic: false, advanced: false })
      }
    })
  }, [])

  useEffect(() => {
    if (!user) return
    const levels: SkillLevel[] = ['basic', 'advanced']
    levels.forEach((level) => {
      loadBotGame(user.uid, level)
        .then((saved) => {
          setSavedGames((current) => ({ ...current, [level]: saved }))
          const hasMoves = Array.isArray(saved?.anchors) && saved.anchors.length > 0
          setSavedBySkill((current) => ({ ...current, [level]: hasMoves }))
        })
        .catch((error) => {
          console.error('Failed to load saved game', error)
        })
        .finally(() => {
          setLoadedBySkill((current) => ({ ...current, [level]: true }))
        })
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    if (!loadedBySkill[skillLevel]) return
    if (screen !== 'game') return
    const state: BotGameState = {
      skillLevel,
      anchors,
      nextId,
      activePlayer,
    }
    saveBotGame(user.uid, state).catch((error) => {
      console.error('Failed to save game', error)
    })
    setSavedGames((current) => ({ ...current, [skillLevel]: state }))
    const hasMoves = anchors.length > 0
    setSavedBySkill((current) => ({ ...current, [skillLevel]: hasMoves }))
  }, [anchors, nextId, activePlayer, skillLevel, user, loadedBySkill, screen])

  const handleCellClick = (cell: Position) => {
    if (isOver) return
    if (!isOpen(cell, occupancy)) return
    setSelected(cell)
  }

  const handleConfirm = () => {
    if (!selected || isOver) return
    const updated = applyMove(anchors, selected, activePlayer, nextId)
    setAnchors(updated.anchors)
    setNextId(updated.nextId)
    setSelected(null)
    setActivePlayer(activePlayer === 'blue' ? 'orange' : 'blue')
    setLastMove(selected)
  }

  const handleUndo = () => {
    setSelected(null)
  }

  const handleRestart = () => {
    setAnchors([])
    setNextId(1)
    setActivePlayer('blue')
    setSelected(null)
    setLastMove(null)
  }

  const handleStartBot = (level: SkillLevel) => {
    if (user && savedBySkill[level]) {
      setResumePrompt(level)
      return
    }
    setSkillLevel(level)
    handleRestart()
    setScreen('game')
  }

  const handleResume = () => {
    if (!resumePrompt) return
    setSkillLevel(resumePrompt)
    const saved = savedGames[resumePrompt]
    if (saved) {
      setAnchors(saved.anchors ?? [])
      setNextId(saved.nextId ?? 1)
      setActivePlayer(saved.activePlayer ?? 'blue')
      setSelected(null)
      setLastMove(null)
    } else {
      handleRestart()
    }
    setScreen('game')
    setResumePrompt(null)
  }

  const handleStartNew = () => {
    if (!resumePrompt) return
    setSkillLevel(resumePrompt)
    handleRestart()
    setScreen('game')
    setResumePrompt(null)
  }

  const handleHome = () => {
    setScreen('home')
  }

  useEffect(() => {
    if (isOver || activePlayer !== 'orange') return
    const timeout = window.setTimeout(() => {
      const move = chooseAutomatonMove(anchors, activePlayer, skillLevel)
      if (!move) return
      const updated = applyMove(anchors, move, activePlayer, nextId)
      setAnchors(updated.anchors)
      setNextId(updated.nextId)
      setSelected(null)
      setActivePlayer('blue')
      setLastMove(move)
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [anchors, activePlayer, isOver, nextId, skillLevel])

  const gameView = (
    <div className="game-shell">
      <header className="game-header">
        <p className="eyebrow">Local Match</p>
        <button className="btn ghost close-btn" onClick={handleHome} aria-label="Close game">
          Close
        </button>
      </header>

      <div className="score-bar">
        <div className={`score blue${activePlayer === 'blue' ? ' active' : ''}`}>
          <span className="dot" />
          <strong>{scores.blue}</strong>
        </div>
        <div className={`score orange${activePlayer === 'orange' ? ' active' : ''}`}>
          <span className="dot" />
          <strong>{scores.orange}</strong>
        </div>
      </div>

      <div className="board" style={{ ['--size' as string]: gridSize }}>
        {cells.map((cell) => {
          const piece = anchors.find((p) => p.x === cell.x && p.y === cell.y)
          const isSelected = selected && selected.x === cell.x && selected.y === cell.y
          const isOccupied = !isOpen(cell, occupancy)
          const isLastMove = lastMoveKeys.has(`${cell.x},${cell.y}`)
          return (
            <div
              className={`cell${isSelected ? ' selected' : ''}${isOccupied ? ' occupied' : ''}${
                isLastMove ? ' last-move' : ''
              }`}
              key={`${cell.x}-${cell.y}`}
              onClick={() => handleCellClick(cell)}
            >
              {piece && (
                <div className={`piece ${piece.player}`}>
                  <div className="core" />
                  <div
                    className="score-dot"
                    style={
                      {
                        ['--score-opacity' as string]: (4 - piece.stems.length) / 4,
                      } as CSSProperties
                    }
                  />
                  {piece.stems.map((stem) => (
                    <span key={`${piece.id}-${stem}-stem`} className={`stem ${stem}`} />
                  ))}
                  {piece.stems.map((stem) => (
                    <span key={`${piece.id}-${stem}-node`} className={`node ${stem}`} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="action-row">
        <button className="btn primary" disabled={!selected || isOver} onClick={handleConfirm}>
          Confirm Move
        </button>
        <button className="btn ghost" onClick={handleUndo}>
          Clear Selection
        </button>
      </div>
    </div>
  )

  return (
    <div className="app home">
      <header className="toolbar">
        <div className="toolbar-left">
          <span className="brand">Cloisters</span>
          <span className="toolbar-sep" />
          <button className="toolbar-link" onClick={handleHome}>
            Home
          </button>
        </div>
        <div className="toolbar-right">
          {authLoading ? (
            <span className="auth-status">Checking sign-in...</span>
          ) : user ? (
            <>
              <span className="auth-status">
                {user.photoURL ? (
                  <img
                    className="avatar"
                    src={user.photoURL}
                    alt={user.displayName ? `${user.displayName} avatar` : 'User avatar'}
                  />
                ) : (
                  <span className="avatar avatar-fallback">{getInitials(user.displayName)}</span>
                )}
              </span>
              <button className="btn ghost" onClick={() => signOutUser()}>
                Sign out
              </button>
            </>
          ) : (
            <button className="btn ghost" onClick={() => signInWithGoogle()}>
              Sign in with Google
            </button>
          )}
        </div>
      </header>

      <div className="home-content">
        <header className="home-header">
          <div>
            <p className="eyebrow">Cloisters</p>
            <h1>Play the modern classic.</h1>
            <p className="subhead">
              A web-first take on the original strategy game. Local matches now, online soon.
            </p>
            <div className="home-actions">
              <button className="btn primary" onClick={() => handleStartBot('basic')}>
                Play Bot (Basic)
                {savedBySkill.basic && <BookmarkIcon />}
              </button>
              <button className="btn secondary" onClick={() => handleStartBot('advanced')}>
                Play Bot (Advanced)
                {savedBySkill.advanced && <BookmarkIcon />}
              </button>
              <button className="btn ghost">How to Play</button>
            </div>
          </div>
          <div className="home-preview">
            <div className="panel home-card">
              <h2>Hot Seat Ready</h2>
              <p>Pass-and-play mode is live. Bots and online matches are next.</p>
            </div>
          </div>
        </header>

        <main className="home-main">
          <div className="panel home-card">
            <h2>Local Match</h2>
            <p>Play on a single device with alternating turns.</p>
          </div>
          <div className="panel home-card">
            <h2>Automaton</h2>
            <p>Basic and advanced difficulty are ready for practice.</p>
          </div>
          <div className="panel home-card">
            <h2>Captures</h2>
            <p>Diagonal capture rules and scoring are active.</p>
          </div>
        </main>
      </div>

      {screen === 'game' && (
        <div className="game-overlay" role="dialog" aria-modal="true">
          <div className="game-overlay-backdrop" onClick={handleHome} />
          <div className="game-overlay-panel">{gameView}</div>
        </div>
      )}

      {resumePrompt && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-backdrop" onClick={() => setResumePrompt(null)} />
          <div className="modal-card">
            <h2>Resume saved game?</h2>
            <p>
              You have a saved {resumePrompt} bot game. Would you like to resume it or start a
              new one?
            </p>
            <div className="modal-actions">
              <button className="btn primary" onClick={handleResume}>
                Resume
              </button>
              <button className="btn secondary" onClick={handleStartNew}>
                Start New
              </button>
              <button className="btn ghost" onClick={() => setResumePrompt(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getInitials(name?: string | null) {
  if (!name) return 'P'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

function BookmarkIcon() {
  return (
    <span className="icon bookmark" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="presentation">
        <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1Z" />
      </svg>
    </span>
  )
}

export default App
