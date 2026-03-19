import './App.css'

type Player = 'blue' | 'orange'

type Piece = {
  x: number
  y: number
  player: Player
  stems: Array<'up' | 'down' | 'left' | 'right'>
}

const gridSize = 10

const pieces: Piece[] = [
  { x: 2, y: 2, player: 'blue', stems: ['up', 'right'] },
  { x: 4, y: 2, player: 'orange', stems: ['left', 'down'] },
  { x: 6, y: 3, player: 'blue', stems: ['left', 'right', 'down'] },
  { x: 3, y: 5, player: 'orange', stems: ['up'] },
  { x: 7, y: 6, player: 'blue', stems: [] },
  { x: 5, y: 7, player: 'orange', stems: ['up', 'left', 'right'] },
]

const cells = Array.from({ length: gridSize * gridSize }, (_, index) => {
  const x = index % gridSize
  const y = Math.floor(index / gridSize)
  return { x, y }
})

function App() {
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
              Blue <span className="dot blue" />
            </p>
          </div>
          <div>
            <p className="label">Phase</p>
            <p className="value">Select a square</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="board-panel">
          <div className="score-bar">
            <div className="score blue">
              <span className="dot" />
              <span>Blue</span>
              <strong>18</strong>
            </div>
            <div className="score orange">
              <span className="dot" />
              <span>Orange</span>
              <strong>22</strong>
            </div>
          </div>

          <div className="board" style={{ ['--size' as string]: gridSize }}>
            {cells.map((cell) => {
              const piece = pieces.find((p) => p.x === cell.x && p.y === cell.y)
              return (
                <div className="cell" key={`${cell.x}-${cell.y}`}>
                  {piece && (
                    <div className={`piece ${piece.player}`}>
                      <div className="core" />
                      <div className="score-dot" />
                      {piece.stems.map((stem) => (
                        <span key={`${stem}-stem`} className={`stem ${stem}`} />
                      ))}
                      {piece.stems.map((stem) => (
                        <span key={`${stem}-node`} className={`node ${stem}`} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="action-row">
            <button className="btn primary">Confirm Move</button>
            <button className="btn ghost">Undo</button>
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
              <li>Implement selection + placement flow</li>
              <li>Port scoring + capture rules</li>
              <li>Add stem animations on placement</li>
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

export default App
