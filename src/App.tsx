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

  const handleStartLocal = () => {
    handleRestart()
    setScreen('game')
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
      <header className="home-header">
        <div>
          <p className="eyebrow">Cloisters</p>
          <h1>Play the modern classic.</h1>
          <p className="subhead">
            A web-first take on the original strategy game. Local matches now, online soon.
          </p>
          <div className="home-actions">
            <button className="btn primary" onClick={handleStartLocal}>
              Play Local
            </button>
            <button className="btn secondary">How to Play</button>
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

      {screen === 'game' && (
        <div className="game-overlay" role="dialog" aria-modal="true">
          <div className="game-overlay-backdrop" onClick={handleHome} />
          <div className="game-overlay-panel">{gameView}</div>
        </div>
      )}
    </div>
  )
}

export default App
