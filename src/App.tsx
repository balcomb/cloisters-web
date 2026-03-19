import { useMemo, useState, type CSSProperties } from 'react'
import './App.css'

type Player = 'blue' | 'orange'

type Direction = 'up' | 'down' | 'left' | 'right'

type Anchor = {
  id: number
  x: number
  y: number
  player: Player
  stems: Direction[]
}

type Position = {
  x: number
  y: number
}

type Offset = {
  dx: number
  dy: number
  dir?: Direction
}

const gridSize = 10

const directions: Offset[] = [
  { dx: 0, dy: -1, dir: 'up' },
  { dx: 0, dy: 1, dir: 'down' },
  { dx: -1, dy: 0, dir: 'left' },
  { dx: 1, dy: 0, dir: 'right' },
]

const diagonals: Offset[] = [
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: 1 },
]

const cells = Array.from({ length: gridSize * gridSize }, (_, index) => {
  const x = index % gridSize
  const y = Math.floor(index / gridSize)
  return { x, y }
})

const initialAnchors: Anchor[] = []

function App() {
  const [anchors, setAnchors] = useState<Anchor[]>(initialAnchors)
  const [nextId, setNextId] = useState(1)
  const [activePlayer, setActivePlayer] = useState<Player>('blue')
  const [selected, setSelected] = useState<Position | null>(null)

  const occupancy = useMemo(() => buildOccupancy(anchors), [anchors])
  const openCount = gridSize * gridSize - occupancy.size
  const isOver = openCount === 0
  const scores = useMemo(() => scoreAnchors(anchors), [anchors])

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
  }

  const handleUndo = () => {
    setSelected(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Cloisters</p>
          <h1>Local Match</h1>
          <p className="subhead">Draft UI for a web-first version of the board.</p>
        </div>
        <div className="status-card">
          <div>
            <p className="label">Active Player</p>
            <p className="value">
              {activePlayer === 'blue' ? 'Blue' : 'Orange'}
              <span className={`dot ${activePlayer}`} />
            </p>
          </div>
          <div>
            <p className="label">Phase</p>
            <p className="value">{isOver ? 'Game Over' : selected ? 'Confirm move' : 'Select a square'}</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="board-panel">
          <div className="score-bar">
            <div className="score blue">
              <span className="dot" />
              <span>Blue</span>
              <strong>{scores.blue}</strong>
            </div>
            <div className="score orange">
              <span className="dot" />
              <span>Orange</span>
              <strong>{scores.orange}</strong>
            </div>
          </div>

          <div className="board" style={{ ['--size' as string]: gridSize }}>
            {cells.map((cell) => {
              const piece = anchors.find((p) => p.x === cell.x && p.y === cell.y)
              const isSelected = selected && selected.x === cell.x && selected.y === cell.y
              const isOccupied = !isOpen(cell, occupancy)
              return (
                <div
                  className={`cell${isSelected ? ' selected' : ''}${isOccupied ? ' occupied' : ''}`}
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
        </section>

        <aside className="side-panel">
          <div className="panel">
            <h2>Game Mode</h2>
            <p>Local two-player match. Online and bots coming later.</p>
            <div className="pill-row">
              <span className="pill">Hot Seat</span>
              <span className="pill">10x10</span>
              <span className="pill">Captures On</span>
            </div>
          </div>

          <div className="panel">
            <h2>Next Steps</h2>
            <ul className="list">
              <li>Implement capture + scoring rules (in progress)</li>
              <li>Add turn indicator + end game modal</li>
              <li>Port bot logic</li>
            </ul>
          </div>

          <div className="panel">
            <h2>Controls</h2>
            <button className="btn secondary">Restart</button>
            <button className="btn ghost">How to Play</button>
          </div>
        </aside>
      </main>
    </div>
  )
}

function applyMove(
  anchors: Anchor[],
  position: Position,
  player: Player,
  nextId: number
): { anchors: Anchor[]; nextId: number } {
  const updated = anchors.map((anchor) => ({ ...anchor, stems: [...anchor.stems] }))

  const capturePairs: Array<{ capturedId: number; capturingId: number }> = []
  diagonals.forEach((offset) => {
    const first = getAnchorAt(updated, position.x + offset.dx, position.y + offset.dy)
    if (!first || first.player === player) return
    const second = getAnchorAt(updated, first.x + offset.dx, first.y + offset.dy)
    if (!second || second.player !== player) return
    capturePairs.push({ capturedId: first.id, capturingId: second.id })
  })

  capturePairs.forEach(({ capturedId, capturingId }) => {
    const captured = updated.find((anchor) => anchor.id === capturedId)
    if (captured) {
      captured.player = captured.player === 'blue' ? 'orange' : 'blue'
      captured.stems = []
    }
    const capturing = updated.find((anchor) => anchor.id === capturingId)
    if (capturing) {
      capturing.stems = []
    }
  })

  const occupancyAfterCapture = buildOccupancy(updated)
  capturePairs.forEach(({ capturingId }) => {
    const capturing = updated.find((anchor) => anchor.id === capturingId)
    if (!capturing) return
    const available = getAvailableStems(capturing, occupancyAfterCapture)
    capturing.stems = available
  })

  const occupancyBeforeNew = buildOccupancy(updated)
  const stems = getAvailableStems({ x: position.x, y: position.y }, occupancyBeforeNew)
  updated.push({ id: nextId, x: position.x, y: position.y, player, stems })

  return { anchors: updated, nextId: nextId + 1 }
}

function buildOccupancy(anchors: Anchor[]): Set<string> {
  const occupied = new Set<string>()
  anchors.forEach((anchor) => {
    occupied.add(keyFor(anchor.x, anchor.y))
    anchor.stems.forEach((stem) => {
      const offset = directions.find((dir) => dir.dir === stem)
      if (!offset) return
      const x = anchor.x + offset.dx
      const y = anchor.y + offset.dy
      if (inBounds(x, y)) {
        occupied.add(keyFor(x, y))
      }
    })
  })
  return occupied
}

function getAvailableStems(anchor: { x: number; y: number }, occupancy: Set<string>): Direction[] {
  const stems: Direction[] = []
  directions.forEach((offset) => {
    const x = anchor.x + offset.dx
    const y = anchor.y + offset.dy
    if (!offset.dir || !inBounds(x, y)) return
    if (!occupancy.has(keyFor(x, y))) {
      stems.push(offset.dir)
    }
  })
  return stems
}

function scoreAnchors(anchors: Anchor[]): { blue: number; orange: number } {
  return anchors.reduce(
    (acc, anchor) => {
      const value = 4 - anchor.stems.length
      if (anchor.player === 'blue') acc.blue += value
      else acc.orange += value
      return acc
    },
    { blue: 0, orange: 0 }
  )
}

function getAnchorAt(anchors: Anchor[], x: number, y: number): Anchor | undefined {
  return anchors.find((anchor) => anchor.x === x && anchor.y === y)
}

function isOpen(cell: Position, occupancy: Set<string>): boolean {
  return !occupancy.has(keyFor(cell.x, cell.y))
}

function keyFor(x: number, y: number): string {
  return `${x},${y}`
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < gridSize && y >= 0 && y < gridSize
}

export default App
