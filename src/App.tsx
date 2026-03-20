import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import './App.css'

type Player = 'blue' | 'orange'

type Direction = 'up' | 'down' | 'left' | 'right'
type SkillLevel = 'basic' | 'advanced'

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

const oppositeOffsetPairs: [Offset, Offset][] = [
  [
    { dx: -1, dy: 1 },
    { dx: 1, dy: -1 },
  ],
  [
    { dx: -1, dy: -1 },
    { dx: 1, dy: 1 },
  ],
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
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('basic')

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
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [anchors, activePlayer, isOver, nextId])

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
            <h2>Automaton</h2>
            <div className="toggle-row">
              <button
                className={`btn ${skillLevel === 'basic' ? 'primary' : 'secondary'}`}
                onClick={() => setSkillLevel('basic')}
              >
                Basic
              </button>
              <button
                className={`btn ${skillLevel === 'advanced' ? 'primary' : 'secondary'}`}
                onClick={() => setSkillLevel('advanced')}
              >
                Advanced
              </button>
            </div>
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

function chooseAutomatonMove(
  anchors: Anchor[],
  player: Player,
  skillLevel: SkillLevel
): Position | null {
  return findAutomatonMove(anchors, player, skillLevel)
}

function findAutomatonMove(anchors: Anchor[], player: Player, skillLevel: SkillLevel): Position | null {
  const openPositions = getOpenPositions(anchors)
  if (openPositions.length === 0) return null
  const decisiveMove = getDecisiveMove(anchors, player, openPositions)
  if (decisiveMove) return decisiveMove
  let candidates = moveCandidates(anchors, player, openPositions)
  if (candidates.length === 0) return null
  candidates = filterCapturableMoves(anchors, player, candidates)
  candidates = filterRecapturableMoves(anchors, player, candidates)
  candidates = prioritizeCaptureBlockingMoves(anchors, player, candidates)
  candidates = filterLowScoreMoves(skillLevel, candidates)
  return randomElement(candidates)?.position ?? null
}

function getDecisiveMove(
  anchors: Anchor[],
  player: Player,
  openPositions: Position[]
): Position | null {
  if (openPositions.length >= 15) return null
  const candidates: Array<{ position: Position; scoreDiff: number }> = []
  for (const position of openPositions) {
    const minRef = { value: Number.POSITIVE_INFINITY }
    verifyDecisiveMove(
      anchors,
      player,
      position,
      player,
      minRef,
      [{ x: position.x, y: position.y }],
      (scoreDiff) => {
        minRef.value = Math.min(minRef.value, scoreDiff)
      }
    )
    if (minRef.value < 0) continue
    candidates.push({ position, scoreDiff: minRef.value })
    if (minRef.value > 0) break
  }
  const decisive = candidates.find((candidate) => candidate.scoreDiff > 0) ?? candidates[0]
  return decisive?.position ?? null
}

function verifyDecisiveMove(
  anchors: Anchor[],
  rootPlayer: Player,
  position: Position,
  currentPlayer: Player,
  minRef: { value: number },
  path: Position[],
  updateMin: (scoreDiff: number) => void
) {
  if (minRef.value < 0) return
  const nextId = getNextId(anchors)
  const updated = applyMove(anchors, position, currentPlayer, nextId).anchors
  const openPositions = getOpenPositions(updated)
  if (openPositions.length === 0) {
    updateMin(getScoreDiff(updated, rootPlayer))
    return
  }
  const nextPlayer = currentPlayer === 'blue' ? 'orange' : 'blue'
  openPositions.forEach((next) => {
    verifyDecisiveMove(updated, rootPlayer, next, nextPlayer, minRef, [...path, next], updateMin)
  })
}

function moveCandidates(anchors: Anchor[], player: Player, openPositions: Position[]) {
  const candidates: Array<{ position: Position; scoreDiff: number }> = []
  const nextId = getNextId(anchors)
  openPositions.forEach((position, index) => {
    const simulated = applyMove(anchors, position, player, nextId + index).anchors
    candidates.push({ position, scoreDiff: getScoreDiff(simulated, player) })
  })
  return candidates
}

function filterLowScoreMoves(
  skillLevel: SkillLevel,
  candidates: Array<{ position: Position; scoreDiff: number }>
) {
  let maxScoreDiff = Number.NEGATIVE_INFINITY
  candidates.forEach((candidate) => {
    if (candidate.scoreDiff > maxScoreDiff) {
      maxScoreDiff = candidate.scoreDiff
    }
  })
  const adjustment = skillLevel === 'basic' ? 1 : 0
  const threshold = maxScoreDiff - adjustment
  return candidates.filter((candidate) => candidate.scoreDiff >= threshold)
}

function filterRecapturableMoves(
  anchors: Anchor[],
  player: Player,
  candidates: Array<{ position: Position; scoreDiff: number }>
) {
  const nonrecapturable = candidates.filter((candidate) => {
    const nextId = getNextId(anchors)
    const updated = applyMove(anchors, candidate.position, player, nextId).anchors
    return !isRecapturablePosition(anchors, updated, candidate.position, player)
  })
  return nonrecapturable.length === 0 ? candidates : nonrecapturable
}

function isRecapturablePosition(
  original: Anchor[],
  updated: Anchor[],
  position: Position,
  player: Player
) {
  for (const offset of diagonals) {
    const x = position.x + offset.dx
    const y = position.y + offset.dy
    const currentAnchor = getAnchorAt(original, x, y)
    const updatedAnchor = getAnchorAt(updated, x, y)
    if (!currentAnchor || !updatedAnchor) continue
    if (currentAnchor.player === updatedAnchor.player) continue
    if (isCapturable(updatedAnchor, updated)) return true
  }
  return false
}

function filterCapturableMoves(
  anchors: Anchor[],
  player: Player,
  candidates: Array<{ position: Position; scoreDiff: number }>
) {
  const noncapturable = candidates.filter(
    (candidate) => !anchorCouldBeCaptured(candidate.position, player, anchors)
  )
  return noncapturable.length === 0 ? candidates : noncapturable
}

function anchorCouldBeCaptured(position: Position, player: Player, anchors: Anchor[]) {
  for (const offsets of oppositeOffsetPairs) {
    const capturingAnchor = getCapturingAnchor(position, player, anchors, offsets)
    if (!capturingAnchor) continue
    if (!newAnchorWouldCapture(position, player, anchors, capturingAnchor)) return true
  }
  return false
}

function getCapturingAnchor(
  position: Position,
  player: Player,
  anchors: Anchor[],
  offsets: [Offset, Offset]
): Anchor | null {
  const pos1 = { x: position.x + offsets[0].dx, y: position.y + offsets[0].dy }
  const pos2 = { x: position.x + offsets[1].dx, y: position.y + offsets[1].dy }
  if (!inBounds(pos1.x, pos1.y) || !inBounds(pos2.x, pos2.y)) return null
  const pieces = [getPieceAt(anchors, pos1), getPieceAt(anchors, pos2)].filter(Boolean) as Array<
    { type: 'anchor'; anchor: Anchor } | { type: 'stem' }
  >
  if (pieces.length !== 1) return null
  const piece = pieces[0]
  if (piece.type !== 'anchor') return null
  const opponent = player === 'blue' ? 'orange' : 'blue'
  return piece.anchor.player === opponent ? piece.anchor : null
}

function newAnchorWouldCapture(
  position: Position,
  player: Player,
  anchors: Anchor[],
  existingAnchor: Anchor
) {
  const offset = diagonals.find(
    (diag) => position.x + diag.dx === existingAnchor.x && position.y + diag.dy === existingAnchor.y
  )
  if (!offset) return false
  const capturePos = { x: existingAnchor.x + offset.dx, y: existingAnchor.y + offset.dy }
  const captureCandidate = getAnchorAt(anchors, capturePos.x, capturePos.y)
  return captureCandidate?.player === player
}

function isCapturable(anchor: Anchor, anchors: Anchor[]) {
  return oppositeOffsetPairs.some(
    (offsets) => getCapturingAnchor({ x: anchor.x, y: anchor.y }, anchor.player, anchors, offsets) !== null
  )
}

function prioritizeCaptureBlockingMoves(
  anchors: Anchor[],
  player: Player,
  candidates: Array<{ position: Position; scoreDiff: number }>
) {
  const threatPairs: Array<{ anchor: Anchor; offset: Offset }> = []
  const captureBlocking = getCaptureBlockingMoves(anchors, player, candidates, threatPairs)
  const blockByCapture = getBlockByCaptureMoves(anchors, player, threatPairs, candidates)
  const combined = [...captureBlocking, ...blockByCapture]
  return combined.length === 0 ? candidates : combined
}

function getCaptureBlockingMoves(
  anchors: Anchor[],
  player: Player,
  candidates: Array<{ position: Position; scoreDiff: number }>,
  threatPairs: Array<{ anchor: Anchor; offset: Offset }>
) {
  const results: Array<{ position: Position; scoreDiff: number }> = []
  candidates.forEach((candidate) => {
    const nextId = getNextId(anchors)
    const updated = applyMove(anchors, candidate.position, player, nextId).anchors
    const anchorCandidate = getAnchorAt(updated, candidate.position.x, candidate.position.y)
    if (!anchorCandidate) return
    const pieces = getAnchorPieces(anchorCandidate)
    let wouldBlock = false
    pieces.forEach((piece) => {
      diagonals.forEach((offset) => {
        const anchorPos1 = { x: piece.x + offset.dx, y: piece.y + offset.dy }
        const anchor1 = getAnchorAt(anchors, anchorPos1.x, anchorPos1.y)
        if (!anchor1 || anchor1.player !== player) return
        const anchorPos2 = { x: anchor1.x + offset.dx, y: anchor1.y + offset.dy }
        const anchor2 = getAnchorAt(anchors, anchorPos2.x, anchorPos2.y)
        const opponent = player === 'blue' ? 'orange' : 'blue'
        if (!anchor2 || anchor2.player !== opponent) return
        threatPairs.push({ anchor: anchor2, offset })
        wouldBlock = true
      })
    })
    if (wouldBlock) results.push(candidate)
  })
  return results
}

function getBlockByCaptureMoves(
  anchors: Anchor[],
  player: Player,
  threatPairs: Array<{ anchor: Anchor; offset: Offset }>,
  candidates: Array<{ position: Position; scoreDiff: number }>
) {
  const results: Array<{ position: Position; scoreDiff: number }> = []
  threatPairs.forEach((pair) => {
    const position = { x: pair.anchor.x + pair.offset.dx, y: pair.anchor.y + pair.offset.dy }
    const candidate = candidates.find(
      (item) => item.position.x === position.x && item.position.y === position.y
    )
    if (!candidate) return
    if (anchorCouldBeCaptured(position, player, anchors)) return
    results.push(candidate)
  })
  return results
}

function getScoreDiff(anchors: Anchor[], player: Player) {
  const score = scoreAnchors(anchors)
  return player === 'blue' ? score.blue - score.orange : score.orange - score.blue
}

function getOpenPositions(anchors: Anchor[]) {
  const occupancy = buildOccupancy(anchors)
  return cells.filter((cell) => !occupancy.has(keyFor(cell.x, cell.y)))
}

function getAnchorPieces(anchor: Anchor): Array<{ x: number; y: number }> {
  const pieces = [{ x: anchor.x, y: anchor.y }]
  anchor.stems.forEach((stem) => {
    const offset = directions.find((dir) => dir.dir === stem)
    if (!offset) return
    const x = anchor.x + offset.dx
    const y = anchor.y + offset.dy
    if (inBounds(x, y)) pieces.push({ x, y })
  })
  return pieces
}

function getPieceAt(
  anchors: Anchor[],
  position: Position
): { type: 'anchor'; anchor: Anchor } | { type: 'stem' } | null {
  const anchor = getAnchorAt(anchors, position.x, position.y)
  if (anchor) return { type: 'anchor', anchor }
  for (const candidate of anchors) {
    for (const stem of candidate.stems) {
      const offset = directions.find((dir) => dir.dir === stem)
      if (!offset) continue
      const x = candidate.x + offset.dx
      const y = candidate.y + offset.dy
      if (x === position.x && y === position.y) return { type: 'stem' }
    }
  }
  return null
}

function randomElement<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(Math.random() * items.length)]
}

function getAnchorAt(anchors: Anchor[], x: number, y: number): Anchor | undefined {
  return anchors.find((anchor) => anchor.x === x && anchor.y === y)
}

function getNextId(anchors: Anchor[]): number {
  return anchors.reduce((max, anchor) => Math.max(max, anchor.id), 0) + 1
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
