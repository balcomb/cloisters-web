import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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
import { loadOfflineGame, saveOfflineGame, type OfflineGameState } from './services/offlineGameStore'
import {
  createOnlineMatch,
  deleteOnlineMatch,
  joinOnlineMatch,
  joinOnlineMatchWithMove,
  resignOnlineMatch,
  submitOnlineMove,
  subscribeToOnlineMatch,
  subscribeToUserMatches,
  subscribeToWaitingMatches,
  type OnlineMatchState,
} from './services/onlineMatchStore'
import {
  subscribeToPublicProfile,
  subscribeToPublicProfiles,
  syncPublicProfileIdentity,
  type PublicProfile,
} from './services/publicProfileStore'
import { resolveRedirectSignIn, signInWithGoogle, signOutUser, subscribeToAuth } from './services/auth'
import type { User } from 'firebase/auth'
import cloistersLogo from './assets/cloisters-logo.svg'
import './App.css'

const initialAnchors: Anchor[] = []
const leaderboardMinimumMatches = 10

type ResumePrompt =
  | { mode: 'bot'; skill: SkillLevel }
  | { mode: 'offline' }
  | null

type GameMode = 'bot' | 'offline' | 'online'
type ProfileTarget =
  | { mode: 'self'; uid: string; name: string | null; photoURL: string | null }
  | { mode: 'opponent'; uid: string; name: string | null; photoURL: string | null }
type HeadToHeadTarget = { uid: string; name: string | null; photoURL: string | null } | null
type AppRoute = { matchId: string | null; privacy: boolean }

function App() {
  const [screen, setScreen] = useState<'home' | 'game'>('home')
  const [gameMode, setGameMode] = useState<GameMode>('bot')
  const [anchors, setAnchors] = useState<Anchor[]>(initialAnchors)
  const [nextId, setNextId] = useState(1)
  const [activePlayer, setActivePlayer] = useState<Player>('blue')
  const [selected, setSelected] = useState<Position | null>(null)
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('basic')
  const [lastMove, setLastMove] = useState<Position | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(() => getAppRoute(window.location.pathname).privacy)
  const [authLoading, setAuthLoading] = useState(true)
  const [resumePrompt, setResumePrompt] = useState<ResumePrompt>(null)
  const [signInPrompt, setSignInPrompt] = useState(false)
  const [signInPromptShown, setSignInPromptShown] = useState(false)
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
  const [savedOffline, setSavedOffline] = useState(false)
  const [offlineLoaded, setOfflineLoaded] = useState(false)
  const [offlineGame, setOfflineGame] = useState<OfflineGameState | null>(null)
  const [boardSize, setBoardSize] = useState<number | null>(null)
  const [onlineMatches, setOnlineMatches] = useState<OnlineMatchState[]>([])
  const [waitingMatches, setWaitingMatches] = useState<OnlineMatchState[]>([])
  const [currentOnlineMatchId, setCurrentOnlineMatchId] = useState<string | null>(null)
  const [currentOnlineMatch, setCurrentOnlineMatch] = useState<OnlineMatchState | null>(null)
  const [onlineError, setOnlineError] = useState<string | null>(null)
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [copiedMatchLink, setCopiedMatchLink] = useState(false)
  const [controlsMenuOpen, setControlsMenuOpen] = useState(false)
  const [resignPrompt, setResignPrompt] = useState(false)
  const [howToOpen, setHowToOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [headToHeadHistoryOpen, setHeadToHeadHistoryOpen] = useState(false)
  const [headToHeadTarget, setHeadToHeadTarget] = useState<HeadToHeadTarget>(null)
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(null)
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null)
  const [leaderboardProfiles, setLeaderboardProfiles] = useState<PublicProfile[]>([])
  const boardWrapRef = useRef<HTMLDivElement | null>(null)
  const controlsMenuRef = useRef<HTMLDivElement | null>(null)

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
    const syncRoute = () => {
      const route = getAppRoute(window.location.pathname)
      setPrivacyOpen(route.privacy)
      if (route.privacy) {
        setCurrentOnlineMatchId(null)
        setCurrentOnlineMatch(null)
        setScreen('home')
        return
      }
      if (!route.matchId) {
        setCurrentOnlineMatchId(null)
        setCurrentOnlineMatch(null)
        if (gameMode === 'online') {
          setScreen('home')
        }
        return
      }
      setGameMode('online')
      setCurrentOnlineMatchId(route.matchId)
      setScreen('game')
    }

    syncRoute()
    window.addEventListener('popstate', syncRoute)
    return () => {
      window.removeEventListener('popstate', syncRoute)
    }
  }, [gameMode])

  useEffect(() => {
    resolveRedirectSignIn().catch((error) => {
      console.error('Failed to resolve redirect sign-in', error)
    })
  }, [])

  useEffect(() => {
    return subscribeToAuth((state) => {
      setUser(state.user)
      setAuthLoading(state.loading)
      if (!state.user) {
        setSavedGames({ basic: null, advanced: null })
        setSavedBySkill({ basic: false, advanced: false })
        setLoadedBySkill({ basic: false, advanced: false })
        setOfflineGame(null)
        setSavedOffline(false)
        setOfflineLoaded(false)
        setOnlineMatches([])
        setWaitingMatches([])
        setCurrentOnlineMatch(null)
        setCurrentOnlineMatchId(null)
        setControlsMenuOpen(false)
        setResignPrompt(false)
        setHowToOpen(false)
        setProfileTarget(null)
        setPublicProfile(null)
      }
    })
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToPublicProfiles(setLeaderboardProfiles)
    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!controlsMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (controlsMenuRef.current?.contains(event.target as Node)) return
      setControlsMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setControlsMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [controlsMenuOpen])

  useEffect(() => {
    if (!user) return
    syncPublicProfileIdentity(user).catch((error) => {
      console.error('Failed to sync public profile', error)
    })
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
    loadOfflineGame(user.uid)
      .then((saved) => {
        if (!saved) return
        setOfflineGame(saved)
        setSavedOffline(Boolean(saved && saved.anchors && saved.anchors.length > 0))
      })
      .catch((error) => {
        console.error('Failed to load offline game', error)
      })
      .finally(() => {
        setOfflineLoaded(true)
      })
    const unsubscribeMatches = subscribeToUserMatches(user.uid, (matches) => {
      setOnlineMatches(matches.filter((match) => match.status !== 'waiting' || match.anchors.length > 0))
    })
    const unsubscribeWaiting = subscribeToWaitingMatches((matches) => {
      setWaitingMatches(
        matches.filter((match) => match.bluePlayer.uid !== user.uid && match.anchors.length > 0)
      )
    })
    return () => {
      unsubscribeMatches()
      unsubscribeWaiting()
    }
  }, [user])

  useEffect(() => {
    if (!profileTarget) return
    const unsubscribe = subscribeToPublicProfile(profileTarget.uid, setPublicProfile)
    return () => {
      unsubscribe()
    }
  }, [profileTarget])

  useEffect(() => {
    if (screen !== 'game') return
    if (gameMode === 'bot') {
      if (!user) return
      if (!loadedBySkill[skillLevel]) return
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
    } else if (gameMode === 'offline') {
      if (!offlineLoaded) return
      const state: OfflineGameState = {
        anchors,
        nextId,
        activePlayer,
      }
      if (user) {
        saveOfflineGame(user.uid, state).catch((error) => {
          console.error('Failed to save offline game', error)
        })
      }
      setOfflineGame(state)
      setSavedOffline(anchors.length > 0)
    }
  }, [anchors, nextId, activePlayer, skillLevel, user, loadedBySkill, screen, gameMode, offlineLoaded])

  useEffect(() => {
    if (gameMode !== 'online' || !currentOnlineMatchId) return
    const unsubscribe = subscribeToOnlineMatch(currentOnlineMatchId, (match) => {
      setCurrentOnlineMatch(match)
      if (!match) {
        setOnlineError('This match is no longer available.')
        navigateHome(true)
        setScreen('home')
        return
      }
      setAnchors(match.anchors ?? [])
      setNextId(match.nextId ?? 1)
      setActivePlayer(match.activePlayer ?? 'blue')
      setSelected(null)
      setLastMove(match.lastMove ?? null)
      if (match.status === 'finished') {
        setResignPrompt(false)
      }
    })
    return () => {
      unsubscribe()
    }
  }, [gameMode, currentOnlineMatchId])

  const isOnlineDraft = gameMode === 'online' && currentOnlineMatchId === null
  const isOnlineJoinDraft =
    gameMode === 'online' &&
    Boolean(
      currentOnlineMatch &&
        currentOnlineMatch.status === 'waiting' &&
        user &&
        currentOnlineMatch.bluePlayer.uid !== user.uid &&
        !currentOnlineMatch.orangePlayer
    )
  const canTakeTurn =
    isOnlineDraft ||
    isOnlineJoinDraft ||
    canPlayTurn(gameMode, activePlayer, currentOnlineMatch, user?.uid ?? null)

  const handleCellClick = (cell: Position) => {
    if (!canTakeTurn || isOver) return
    if (!isOpen(cell, occupancy)) return
    setSelected(cell)
  }

  const handleConfirm = async () => {
    if (!selected || isOver) return
    if (gameMode === 'online') {
      try {
        setOnlineBusy(true)
        setOnlineError(null)
        if (!user) {
          throw new Error('Sign in to play online.')
        }
        if (!currentOnlineMatchId) {
          const matchId = await createOnlineMatch(user, selected)
          setCurrentOnlineMatchId(matchId)
          setCurrentOnlineMatch(null)
          navigateToMatch(matchId)
        } else if (
          currentOnlineMatch?.status === 'waiting' &&
          currentOnlineMatch.bluePlayer.uid !== user.uid &&
          !currentOnlineMatch.orangePlayer
        ) {
          await joinOnlineMatchWithMove(currentOnlineMatchId, user, selected)
        } else {
          await submitOnlineMove(currentOnlineMatchId, user.uid, selected)
        }
        setSelected(null)
      } catch (error) {
        setOnlineError(error instanceof Error ? error.message : 'Failed to submit move.')
      } finally {
        setOnlineBusy(false)
      }
      return
    }
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
      setResumePrompt({ mode: 'bot', skill: level })
      return
    }
    setGameMode('bot')
    setSkillLevel(level)
    handleRestart()
    setScreen('game')
  }

  const handleStartOffline = () => {
    if (savedOffline) {
      setResumePrompt({ mode: 'offline' })
      return
    }
    setGameMode('offline')
    handleRestart()
    setScreen('game')
  }

  const handleCreateOnline = async () => {
    if (!user) {
      setOnlineError('Sign in to create an online match.')
      return
    }
    const existingWaitingMatch = onlineMatches.find(
      (match) => match.status === 'waiting' && match.bluePlayer.uid === user.uid && match.anchors.length > 0
    )
    setOnlineError(null)
    setGameMode('online')
    setCurrentOnlineMatch(existingWaitingMatch ?? null)
    setCurrentOnlineMatchId(existingWaitingMatch?.id ?? null)
    if (!existingWaitingMatch) {
      handleRestart()
      navigateHome(true)
    } else {
      navigateToMatch(existingWaitingMatch.id)
    }
    setScreen('game')
  }

  const handleJoinOnline = async (match: OnlineMatchState) => {
    if (!user) return
    try {
      setOnlineBusy(true)
      setOnlineError(null)
      await joinOnlineMatch(match.id, user)
      setGameMode('online')
      setCurrentOnlineMatchId(match.id)
      setCurrentOnlineMatch(match)
      setSelected(null)
      setControlsMenuOpen(false)
      navigateToMatch(match.id)
      setScreen('game')
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : 'Failed to join match.')
    } finally {
      setOnlineBusy(false)
    }
  }

  const handleOpenOnlineMatch = (match: OnlineMatchState) => {
    setOnlineError(null)
    setControlsMenuOpen(false)
    setResignPrompt(false)
    setGameMode('online')
    setCurrentOnlineMatchId(match.id)
    setCurrentOnlineMatch(match)
    navigateToMatch(match.id)
    setScreen('game')
  }

  const handleResign = async () => {
    if (!user || !currentOnlineMatchId) return
    try {
      setOnlineBusy(true)
      setOnlineError(null)
      setControlsMenuOpen(false)
      if (isWaitingOwnerMatch) {
        await deleteOnlineMatch(currentOnlineMatchId, user.uid)
        setCurrentOnlineMatchId(null)
        setCurrentOnlineMatch(null)
        navigateHome()
        setScreen('home')
      } else {
        await resignOnlineMatch(currentOnlineMatchId, user.uid)
      }
      setResignPrompt(false)
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : 'Failed to resign match.')
    } finally {
      setOnlineBusy(false)
    }
  }

  const handleCopyMatchLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setControlsMenuOpen(false)
      setCopiedMatchLink(true)
      window.setTimeout(() => setCopiedMatchLink(false), 1500)
    } catch (error) {
      console.error('Failed to copy match link', error)
    }
  }

  const handleResume = () => {
    if (!resumePrompt) return
    if (resumePrompt.mode === 'bot') {
      setGameMode('bot')
      setSkillLevel(resumePrompt.skill)
      const saved = savedGames[resumePrompt.skill]
      if (saved) {
        setAnchors(saved.anchors ?? [])
        setNextId(saved.nextId ?? 1)
        setActivePlayer(saved.activePlayer ?? 'blue')
        setSelected(null)
        setLastMove(null)
      } else {
        handleRestart()
      }
    } else {
      setGameMode('offline')
      if (offlineGame) {
        setAnchors(offlineGame.anchors ?? [])
        setNextId(offlineGame.nextId ?? 1)
        setActivePlayer(offlineGame.activePlayer ?? 'blue')
        setSelected(null)
        setLastMove(null)
      } else {
        handleRestart()
      }
    }
    setScreen('game')
    setResumePrompt(null)
  }

  const handleStartNew = () => {
    if (!resumePrompt) return
    if (resumePrompt.mode === 'bot') {
      setGameMode('bot')
      setSkillLevel(resumePrompt.skill)
    } else {
      setGameMode('offline')
    }
    handleRestart()
    setScreen('game')
    setResumePrompt(null)
  }

  const handleHome = () => {
    if (user && gameMode === 'offline' && anchors.length > 0) {
      const state: OfflineGameState = {
        anchors,
        nextId,
        activePlayer,
      }
      saveOfflineGame(user.uid, state).catch((error) => {
        console.error('Failed to save offline game', error)
      })
      setOfflineGame(state)
      setSavedOffline(true)
    }
    if (!user && anchors.length > 0 && !signInPromptShown) {
      setSignInPrompt(true)
      setSignInPromptShown(true)
    }
    setSelected(null)
    setControlsMenuOpen(false)
    setResignPrompt(false)
    if (gameMode === 'online') {
      navigateHome()
    }
    setScreen('home')
  }

  useEffect(() => {
    if (isOver || activePlayer !== 'orange') return
    if (gameMode !== 'bot') return
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
  }, [anchors, activePlayer, isOver, nextId, skillLevel, gameMode])

  useEffect(() => {
    if (screen !== 'game') return
    const element = boardWrapRef.current
    if (!element) return

    const updateBoardSize = () => {
      const parent = element.parentElement
      const availableWidth = parent ? parent.getBoundingClientRect().width : element.getBoundingClientRect().width
      const isCompactViewport = window.innerWidth <= 640
      const safeWidth = Math.floor(availableWidth)

      if (safeWidth < 120) return

      if (isCompactViewport) {
        setBoardSize(Math.max(0, safeWidth))
        return
      }

      const viewportTarget = window.innerHeight * 0.5
      const clampedTarget = Math.min(600, Math.max(400, viewportTarget))
      const nextSize = Math.max(0, Math.floor(Math.min(safeWidth, clampedTarget)))
      setBoardSize(nextSize)
    }

    updateBoardSize()

    const frameOne = window.requestAnimationFrame(updateBoardSize)
    const frameTwo = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(updateBoardSize)
    })
    const timeout = window.setTimeout(updateBoardSize, 60)

    const observer = new ResizeObserver(() => {
      updateBoardSize()
    })
    observer.observe(element)
    window.addEventListener('resize', updateBoardSize)

    return () => {
      window.cancelAnimationFrame(frameOne)
      window.cancelAnimationFrame(frameTwo)
      window.clearTimeout(timeout)
      observer.disconnect()
      window.removeEventListener('resize', updateBoardSize)
    }
  }, [screen])

  const profile = useMemo(() => {
    if (!profileTarget) return null
    if (profileTarget.mode === 'self') {
      return buildPlayerProfile(profileTarget.uid, onlineMatches, publicProfile, 'overall')
    }
    return buildPlayerProfile(profileTarget.uid, onlineMatches, publicProfile, 'shared')
  }, [profileTarget, onlineMatches, publicProfile])
  const currentOpponent =
    currentOnlineMatch && user ? getOpponentProfile(currentOnlineMatch, user.uid) : null
  const finishedMatches = useMemo(
    () => onlineMatches.filter((match) => match.status === 'finished'),
    [onlineMatches]
  )
  const headToHeadHistory = useMemo(() => {
    if (!headToHeadTarget || !user) return []
    return onlineMatches.filter((match) => {
      if (match.status !== 'finished') return false
      return (
        (match.bluePlayer.uid === user.uid && match.orangePlayer?.uid === headToHeadTarget.uid) ||
        (match.orangePlayer?.uid === user.uid && match.bluePlayer.uid === headToHeadTarget.uid)
      )
    })
  }, [headToHeadTarget, onlineMatches, user])
  const availableHeadToHeadHistory = useMemo(() => {
    if (!profileTarget || profileTarget.mode !== 'opponent' || !user) return []
    return onlineMatches.filter((match) => {
      if (match.status !== 'finished') return false
      return (
        (match.bluePlayer.uid === user.uid && match.orangePlayer?.uid === profileTarget.uid) ||
        (match.orangePlayer?.uid === user.uid && match.bluePlayer.uid === profileTarget.uid)
      )
    })
  }, [onlineMatches, profileTarget, user])
  const leaderboard = useMemo(
    () => buildLeaderboard(leaderboardProfiles, leaderboardMinimumMatches),
    [leaderboardProfiles]
  )
  const canConfirm =
    Boolean(selected) &&
    !isOver &&
    !onlineBusy &&
    (isOnlineDraft ||
      isOnlineJoinDraft ||
      canPlayTurn(gameMode, activePlayer, currentOnlineMatch, user?.uid ?? null))
  const moveControlsInactive = !selected
  const canClear = Boolean(selected)
  const matchLabel =
    gameMode === 'bot'
      ? `Bot Match · ${skillLevel === 'basic' ? 'Basic' : 'Advanced'}`
      : gameMode === 'offline'
        ? 'Offline Match'
        : `Online Match${
            currentOnlineMatch?.status === 'waiting' && !isOnlineDraft && !isOnlineJoinDraft
              ? ' · Waiting'
              : ''
          }`
  const canResign =
    gameMode === 'online' &&
    !isOnlineJoinDraft &&
    Boolean(currentOnlineMatchId && currentOnlineMatch && currentOnlineMatch.status !== 'finished')
  const isFinishedOnlineMatch = gameMode === 'online' && currentOnlineMatch?.status === 'finished'
  const finalScoreLabel = `Final score${
    isFinishedOnlineMatch && currentOnlineMatch?.resignedBy
      ? currentOnlineMatch.resignedBy === getOnlinePlayer(currentOnlineMatch, user?.uid ?? null)
        ? ' (You resigned)'
        : ' (They resigned)'
      : ''
  }`
  const isWaitingOwnerMatch =
    gameMode === 'online' &&
    Boolean(
      currentOnlineMatch &&
        currentOnlineMatch.status === 'waiting' &&
        user &&
        currentOnlineMatch.bluePlayer.uid === user.uid &&
        !currentOnlineMatch.orangePlayer
    )
  const showsDeleteAction = isOnlineDraft || isWaitingOwnerMatch

  const gameView = (
    <div className="game-shell">
      <header className="game-header">
        <div className="game-heading">
          <p className="eyebrow">{matchLabel}</p>
          {gameMode === 'online' && (
            <>
              <p className="match-meta">
                {isOnlineDraft && <span>Make the first move to start a match</span>}
                {isOnlineJoinDraft && <span>Make the next move to join</span>}
              </p>
            </>
          )}
        </div>
        <button className="icon-close close-btn" onClick={handleHome} aria-label="Close game">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 5 19 19" />
            <path d="M19 5 5 19" />
          </svg>
        </button>
      </header>

      <div className="board-panel">
        <div className="score-bar">
          <p className={`score-summary-label${isFinishedOnlineMatch ? ' visible' : ''}`}>
            {finalScoreLabel}
          </p>
          {gameMode === 'online' && currentOnlineMatch && (
            <div className="score-player score-player-blue">
              {currentOpponent?.uid === currentOnlineMatch.bluePlayer.uid ? (
                <button
                  className="avatar-button score-avatar-button"
                  aria-label={`Open ${currentOnlineMatch.bluePlayer.displayName ?? 'opponent'} profile`}
                  onClick={() =>
                    setProfileTarget({
                      mode: 'opponent',
                      uid: currentOnlineMatch.bluePlayer.uid,
                      name: currentOnlineMatch.bluePlayer.displayName,
                      photoURL: currentOnlineMatch.bluePlayer.photoURL,
                    })
                  }
                >
                  <AvatarImage
                    className="avatar score-avatar"
                    name={currentOnlineMatch.bluePlayer.displayName}
                    photoURL={currentOnlineMatch.bluePlayer.photoURL}
                  />
                </button>
              ) : (
                <div className="score-avatar-wrap">
                  <AvatarImage
                    className="avatar score-avatar"
                    name={currentOnlineMatch.bluePlayer.displayName}
                    photoURL={currentOnlineMatch.bluePlayer.photoURL}
                  />
                  <span className="score-you-pill">You</span>
                </div>
              )}
            </div>
          )}
          <div className={`score blue${activePlayer === 'blue' && !isFinishedOnlineMatch ? ' active' : ''}`}>
            <span className="dot" />
            <strong>{scores.blue}</strong>
          </div>
          <div className={`score orange${activePlayer === 'orange' && !isFinishedOnlineMatch ? ' active' : ''}`}>
            <span className="dot" />
            <strong>{scores.orange}</strong>
          </div>
          {gameMode === 'online' && currentOnlineMatch?.orangePlayer && (
            <div className="score-player score-player-orange">
              {currentOpponent?.uid === currentOnlineMatch.orangePlayer.uid ? (
                <button
                  className="avatar-button score-avatar-button"
                  aria-label={`Open ${currentOnlineMatch.orangePlayer.displayName ?? 'opponent'} profile`}
                  onClick={() =>
                    setProfileTarget({
                      mode: 'opponent',
                      uid: currentOnlineMatch.orangePlayer!.uid,
                      name: currentOnlineMatch.orangePlayer!.displayName,
                      photoURL: currentOnlineMatch.orangePlayer!.photoURL,
                    })
                  }
                >
                  <AvatarImage
                    className="avatar score-avatar"
                    name={currentOnlineMatch.orangePlayer.displayName}
                    photoURL={currentOnlineMatch.orangePlayer.photoURL}
                  />
                </button>
              ) : (
                <div className="score-avatar-wrap">
                  <AvatarImage
                    className="avatar score-avatar"
                    name={currentOnlineMatch.orangePlayer.displayName}
                    photoURL={currentOnlineMatch.orangePlayer.photoURL}
                  />
                  <span className="score-you-pill">You</span>
                </div>
              )}
            </div>
          )}
          {gameMode === 'online' && currentOnlineMatch && !currentOnlineMatch.orangePlayer && (
            <span className="score-avatar-placeholder" aria-hidden="true" />
          )}
        </div>

        <div className="board-wrap" ref={boardWrapRef}>
          <div
            className="board"
            style={
              {
                ['--size' as string]: gridSize,
                width: boardSize ? `${boardSize}px` : undefined,
                height: boardSize ? `${boardSize}px` : undefined,
              } as CSSProperties
            }
          >
          {cells.map((cell) => {
            const piece = anchors.find((p) => p.x === cell.x && p.y === cell.y)
            const isSelected = selected && selected.x === cell.x && selected.y === cell.y
            const isOccupied = !isOpen(cell, occupancy)
            const isLastMove = lastMoveKeys.has(`${cell.x},${cell.y}`)
            return (
              <div
                className={`cell${isSelected ? ` selected selected-${activePlayer}` : ''}${isOccupied ? ' occupied' : ''}${
                  isLastMove ? ' last-move' : ''
                }${canTakeTurn ? '' : ' disabled'}`}
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
        </div>

        <div className={`action-row${gameMode === 'online' || canResign ? '' : ' centered-actions'}`}>
        <div className="action-row-main">
          <button
            className={`btn icon-action-btn confirm-btn${moveControlsInactive ? ' inactive-action' : ''}`}
            disabled={!canConfirm}
            onClick={() => void handleConfirm()}
            aria-label="Confirm move"
            title="Confirm move"
          >
            <span className="icon action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
          </button>
          <button
            className={`btn icon-action-btn clear-btn${moveControlsInactive ? ' inactive-action' : ''}`}
            disabled={!canClear}
            onClick={handleUndo}
            aria-label="Clear selection"
            title="Clear selection"
          >
            <span className="icon action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M7.5 16.5 16.5 7.5" />
              </svg>
            </span>
          </button>
        </div>

        {(gameMode === 'online' || canResign) && (
          <div className="action-row-controls" ref={controlsMenuRef}>
            <button
              className="btn secondary controls-menu-toggle"
              type="button"
              aria-label="Open game controls"
              aria-expanded={controlsMenuOpen}
              onClick={() => setControlsMenuOpen((open) => !open)}
            >
              <span className="icon controls-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation">
                  <path d="M5 7h14" />
                  <path d="M5 12h14" />
                  <path d="M5 17h14" />
                </svg>
              </span>
            </button>
            {controlsMenuOpen && (
              <div className="controls-menu-sheet">
                {gameMode === 'online' && !isOnlineDraft && (
                  <button className="btn secondary controls-menu-btn" onClick={() => void handleCopyMatchLink()}>
                    {copiedMatchLink ? 'Copied' : 'Copy Link'}
                  </button>
                )}
                <button
                  className="btn secondary controls-menu-btn"
                  disabled={onlineBusy || !canResign}
                  onClick={() => {
                    setControlsMenuOpen(false)
                    setResignPrompt(true)
                  }}
                >
                  {showsDeleteAction ? 'Delete Match' : 'Resign Match'}
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {(gameMode === 'online' || canResign) && (
        <div className="game-footer-actions">
          <div className="game-side-action left">
            {gameMode === 'online' && !isOnlineDraft && (
              <button className="btn secondary copy-link-action" onClick={() => void handleCopyMatchLink()}>
                {copiedMatchLink ? 'Copied' : 'Copy Link'}
              </button>
            )}
          </div>
          <button
            className="btn secondary"
            disabled={onlineBusy || !canResign}
            onClick={() => setResignPrompt(true)}
          >
            {showsDeleteAction ? 'Delete Match' : 'Resign Match'}
          </button>
        </div>
      )}
    </div>
  )

  const privacyView = (
    <div className="home-content">
      <main className="legal-layout">
        <section className="panel legal-card">
          <div className="legal-header">
            <h1>Privacy Policy</h1>
            <p>
              Cloisters keeps privacy simple. This page explains what data the app stores and how
              it is used.
            </p>
          </div>

          <div className="legal-body">
            <section>
              <h2>Information We Store</h2>
              <p>
                If you sign in with Google, Cloisters stores your basic account identity: your
                display name, email address, user ID, and profile photo.
              </p>
              <p>
                Cloisters also stores gameplay data needed to run the app, including saved games,
                online matches, public profile stats, leaderboard records, and match history.
              </p>
            </section>

            <section>
              <h2>How We Use It</h2>
              <p>
                Your data is used only to authenticate you, save progress, enable online play, show
                profiles and leaderboards, and let you resume matches across devices.
              </p>
            </section>

            <section>
              <h2>What We Do Not Do</h2>
              <p>
                Cloisters does not sell your personal information and does not use your Google data
                for advertising.
              </p>
            </section>

            <section>
              <h2>Third-Party Services</h2>
              <p>
                Cloisters uses Google Sign-In and Firebase services from Google to provide
                authentication, data storage, hosting, and app infrastructure.
              </p>
            </section>

            <section>
              <h2>Your Choices</h2>
              <p>
                You can stop using Cloisters at any time. If you want account data removed, contact
                the site operator and include the Google account you used to sign in.
              </p>
            </section>

            <section>
              <h2>Contact</h2>
              <p>
                For privacy questions or data removal requests, contact tokentrap.app@gmail.com.
              </p>
            </section>

            <section>
              <h2>Updates</h2>
              <p>
                This policy may be updated as Cloisters evolves. Material changes will be reflected
                on this page.
              </p>
            </section>
          </div>

          <div className="legal-actions">
            <button className="btn secondary" onClick={() => navigateHome()}>
              Back to Home
            </button>
          </div>
        </section>
      </main>
    </div>
  )

  return (
    <div className="app home">
      <header className="toolbar">
        <div className="toolbar-left">
          <img className="brand-logo toolbar-logo" src={cloistersLogo} alt="Cloisters" />
        </div>
        <div className="toolbar-right">
          {authLoading ? (
            <span className="auth-status">Checking sign-in...</span>
          ) : user ? (
            <>
              <button
                className="avatar-button"
                aria-label="Open profile"
                onClick={() =>
                  setProfileTarget({
                    mode: 'self',
                    uid: user.uid,
                    name: user.displayName,
                    photoURL: user.photoURL,
                  })
                }
              >
                <AvatarImage
                  className="avatar"
                  name={user.displayName}
                  photoURL={user.photoURL}
                />
              </button>
            </>
          ) : (
            <button className="gsi-material-button toolbar-sign-in" onClick={() => signInWithGoogle()}>
              <div className="gsi-material-button-state" />
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                </div>
                <span className="gsi-material-button-contents">Sign in</span>
                <span className="sr-only">Sign in with Google</span>
              </div>
            </button>
          )}
        </div>
      </header>

      {privacyOpen ? (
        privacyView
      ) : (
        <div className="home-content">
          <main className="home-layout">
          <section className="panel action-panel">
            <div className="play-section">
              <div className="play-section-header">
                <h3>Play a Person</h3>
              </div>
              <div className="home-actions stacked">
                <div className="button-with-note">
                  <button
                    className="btn secondary"
                    onClick={() => void handleCreateOnline()}
                    disabled={onlineBusy || !user}
                  >
                    Online
                  </button>
                  {!user && <p className="play-note">Sign in with Google to play online.</p>}
                </div>
                <button className="btn secondary" onClick={handleStartOffline}>
                  Offline
                  {savedOffline && <BookmarkIcon />}
                </button>
              </div>
            </div>
            <div className="play-section">
              <div className="play-section-header">
                <h3>Play a Bot</h3>
              </div>
              <div className="home-actions stacked">
                <button className="btn secondary" onClick={() => handleStartBot('basic')}>
                  Basic
                  {savedBySkill.basic && <BookmarkIcon />}
                </button>
                <button className="btn secondary" onClick={() => handleStartBot('advanced')}>
                  Advanced
                  {savedBySkill.advanced && <BookmarkIcon />}
                </button>
              </div>
            </div>
            <div className="home-actions stacked secondary-actions">
              <button className="btn secondary" onClick={() => setHowToOpen(true)}>
                How to Play
              </button>
            </div>
            {onlineError && <p className="inline-message error">{onlineError}</p>}
          </section>

          <section className="panel matches-panel">
            <div className="matches-header">
              <h2>Matches</h2>
            </div>

            {user ? (
              <>
                <div className="matches-group">
                  <h3>In Progress</h3>
                  {onlineMatches.filter((match) => match.status !== 'finished').length === 0 ? (
                    <p className="note">No active or waiting matches right now.</p>
                  ) : (
                    <div className="match-list compact">
                      {onlineMatches
                        .filter((match) => match.status !== 'finished')
                        .map((match) => (
                          <button
                            key={match.id}
                            className="match-card"
                            onClick={() => handleOpenOnlineMatch(match)}
                          >
                            <span className="match-card-top">
                              <span className="match-card-identity">
                                <AvatarImage
                                  className="avatar match-avatar"
                                  name={getMatchCardName(match, user)}
                                  photoURL={getMatchCardPhotoURL(match, user.uid)}
                                />
                                <strong>{getMatchCardName(match, user)}</strong>
                              </span>
                              <span
                                className={`match-card-status${
                                  getOnlineStatusText(match, user.uid) === 'Your turn' ? ' your-turn' : ''
                                }`}
                              >
                                {getOnlineStatusText(match, user.uid)}
                              </span>
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                <div className="matches-group">
                  <h3>Open</h3>
                  {waitingMatches.length === 0 ? (
                    <p className="note">No matches to join right now.</p>
                  ) : (
                    <div className="match-list compact">
                      {waitingMatches.map((match) => (
                        <button
                          key={match.id}
                          className="match-card"
                          onClick={() => void handleJoinOnline(match)}
                          disabled={onlineBusy}
                        >
                          <span className="match-card-top">
                            <span className="match-card-identity">
                              <AvatarImage
                                className="avatar match-avatar"
                                name={match.bluePlayer.displayName}
                                photoURL={match.bluePlayer.photoURL}
                              />
                              <strong>{match.bluePlayer.displayName ?? 'Blue player'}</strong>
                            </span>
                            <span className="match-card-status">Join now</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="matches-group">
                  <button className="btn secondary" onClick={() => setHistoryOpen(true)}>
                    Your Match History
                  </button>
                </div>

                <div className="matches-group">
                  {leaderboard.length > 0 && (
                    <button className="btn secondary" onClick={() => setLeaderboardOpen(true)}>
                      Leaderboard
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="note">Sign in with Google to view your matches and join waiting games.</p>
            )}
          </section>
          </main>

          <div className="home-fine-print">
            <button className="fine-print-link" onClick={() => navigateToPrivacy()}>
              Privacy Policy
            </button>
          </div>
        </div>
      )}

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
            <h2>Last game saved</h2>
            <p>
              Would you like to resume the saved{' '}
              {resumePrompt.mode === 'bot' ? `${resumePrompt.skill} bot` : 'offline'} game or
              start a new one?
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

      {signInPrompt && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-backdrop" onClick={() => setSignInPrompt(false)} />
          <div className="modal-card">
            <h2>Sign in to save games</h2>
            <p>
              Sign in to keep your games synced across devices and resume them later from any
              browser.
            </p>
            <div className="modal-actions">
              <button className="btn primary" onClick={() => signInWithGoogle()}>
                Sign in with Google
              </button>
              <button className="btn ghost" onClick={() => setSignInPrompt(false)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {resignPrompt && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-backdrop" onClick={() => setResignPrompt(false)} />
          <div className="modal-card">
            <h2>{showsDeleteAction ? 'Delete this match?' : 'Resign this match?'}</h2>
            <p>
              {showsDeleteAction
                ? 'This will remove the waiting match from the open list.'
                : 'This will immediately end the online match. Resigning counts as a loss.'}
            </p>
            <div className="modal-actions">
              <button className="btn secondary" disabled={onlineBusy} onClick={() => void handleResign()}>
                {showsDeleteAction ? 'Delete' : 'Resign'}
              </button>
              <button className="btn ghost" onClick={() => setResignPrompt(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {howToOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-backdrop" onClick={() => setHowToOpen(false)} />
          <div className="modal-card how-to-card">
            <div className="how-to-header">
              <h2>How to Play</h2>
              <button className="icon-close" aria-label="Close how to play" onClick={() => setHowToOpen(false)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 5 19 19" />
                  <path d="M19 5 5 19" />
                </svg>
              </button>
            </div>
            <div className="how-to-body">
              <p>
                <strong><em>Cloisters</em></strong> is a battle of wits where two players take
                turns placing pieces on a grid. When all the positions on the grid are occupied,
                the game ends, and the player with the most points wins.
              </p>

              <h3>Scoring</h3>
              <p>
                In addition to occupying the position where it&apos;s placed, a piece also occupies
                any open, adjacent positions up, down, left, or right with an extending arm. Each
                piece has a point value determined by how many extending arms it has. A piece with
                four arms is worth zero points, and one point is gained for each direction that has
                no arm, with a maximum of four points for a piece with no arms.
              </p>

              <h3>Capturing Pieces</h3>
              <p>
                Opposing pieces can be captured by surrounding them diagonally with two of your own
                pieces. Captured pieces automatically have zero arms and are worth four points,
                following the standard scoring. The player whose piece is captured also loses the
                points the captured piece was worth before being captured.
              </p>
            </div>
          </div>
        </div>
      )}

      {leaderboardOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-backdrop" onClick={() => setLeaderboardOpen(false)} />
          <div className="modal-card how-to-card">
            <div className="how-to-header">
              <h2>Leaderboard</h2>
              <button className="icon-close" aria-label="Close leaderboard" onClick={() => setLeaderboardOpen(false)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 5 19 19" />
                  <path d="M19 5 5 19" />
                </svg>
              </button>
            </div>
            <div className="how-to-body">
              <p>
                Players are ranked by all-time win percentage. To qualify, a player must complete at least{' '}
                {leaderboardMinimumMatches} online matches.
              </p>
              {leaderboard.length === 0 ? (
                <p>No qualified players yet.</p>
              ) : (
                <div className="leaderboard-list">
                  {leaderboard.map((entry, index) => (
                    <button
                      key={entry.uid}
                      className="leaderboard-row leaderboard-button"
                      onClick={() =>
                        setProfileTarget({
                          mode: user?.uid === entry.uid ? 'self' : 'opponent',
                          uid: entry.uid,
                          name: entry.displayName,
                          photoURL: entry.photoURL,
                        })
                      }
                    >
                      <div className="leaderboard-rank">{index + 1}</div>
                      <div className="leaderboard-player">
                        <AvatarImage
                          className="avatar leaderboard-avatar"
                          name={entry.displayName}
                          photoURL={entry.photoURL}
                        />
                        <div>
                          <strong>{entry.displayName ?? 'Player'}</strong>
                          <p>
                            {entry.wins}-{entry.losses}-{entry.draws}
                          </p>
                        </div>
                      </div>
                      <div className="leaderboard-pct">{formatLeaderboardPct(entry.scorePct)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-backdrop" onClick={() => setHistoryOpen(false)} />
          <div className="modal-card history-card">
            <div className="how-to-header">
              <h2>Your Match History</h2>
              <button className="icon-close" aria-label="Close match history" onClick={() => setHistoryOpen(false)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 5 19 19" />
                  <path d="M19 5 5 19" />
                </svg>
              </button>
            </div>
            <div className="how-to-body">
              {finishedMatches.length === 0 ? (
                <p>No completed online matches yet.</p>
              ) : (
                <div className="profile-list">
                  {finishedMatches.map((match) => (
                    <button
                      key={match.id}
                      className="profile-row match-history-row"
                      onClick={() => {
                        setHistoryOpen(false)
                        handleOpenOnlineMatch(match)
                      }}
                    >
                      <div>
                        <strong>vs {describeOpponent(match, user?.uid ?? '')}</strong>
                        <p>{formatMatchHistoryResult(match, user?.uid ?? null)}</p>
                      </div>
                      <div className="profile-row-meta">
                        <span>{formatMatchDate(match.updatedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {profileTarget && profile && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-backdrop" onClick={() => setProfileTarget(null)} />
          <div className="modal-card profile-card">
            <div className="profile-header">
              <div className="profile-identity">
                <AvatarImage
                  className="profile-avatar"
                  name={profileTarget.name}
                  photoURL={profileTarget.photoURL}
                />
                <div>
                  <h2>{profileTarget.name ?? 'Player Profile'}</h2>
                </div>
              </div>
              <button className="icon-close" aria-label="Close profile" onClick={() => setProfileTarget(null)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 5 19 19" />
                  <path d="M19 5 5 19" />
                </svg>
              </button>
            </div>

            <div className="profile-body">
              <section className="profile-section">
                <div className="profile-stats">
                  <div className="profile-stat">
                    <span className="profile-stat-label">All-Time Results</span>
                    <strong>{profile.wins}-{profile.losses}-{profile.draws}</strong>
                  </div>
                </div>
              </section>

              {profileTarget.mode === 'self' ? (
                <>
                  <section className="profile-section">
                    <div className="profile-section-header">
                      <h3>Active Matches</h3>
                    </div>
                    {profile.activeMatchesList.length === 0 ? (
                      <p className="note">No active online matches right now.</p>
                    ) : (
                      <div className="profile-list">
                        {profile.activeMatchesList.map((match) => (
                          <div key={match.id} className="profile-row">
                            <div>
                              <strong>{match.opponentName}</strong>
                              <p>{match.statusText}</p>
                            </div>
                            <div className="profile-row-meta">
                              <span>{match.dateText}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="profile-section profile-actions">
                    <button className="btn ghost" onClick={() => signOutUser()}>
                      Sign out
                    </button>
                  </section>
                </>
              ) : (
                <section className="profile-section">
                  {profile.headToHead.length === 0 ? (
                    <p className="note">No completed matches against this player yet.</p>
                  ) : (
                    <div className="profile-stats">
                      <div className="profile-stat">
                        <span className="profile-stat-label">Your Head-to-Head Results</span>
                        <strong>
                          {profile.headToHead[0].wins}-{profile.headToHead[0].losses}-{profile.headToHead[0].draws}
                        </strong>
                      </div>
                    </div>
                  )}
                  {availableHeadToHeadHistory.length > 0 && (
                    <button
                      className="btn secondary"
                      onClick={() => {
                        setHeadToHeadTarget({
                          uid: profileTarget.uid,
                          name: profileTarget.name,
                          photoURL: profileTarget.photoURL,
                        })
                        setProfileTarget(null)
                        setHeadToHeadHistoryOpen(true)
                      }}
                    >
                      Your Head-to-Head History
                    </button>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {headToHeadHistoryOpen && headToHeadTarget && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div
            className="modal-backdrop"
            onClick={() => {
              setHeadToHeadHistoryOpen(false)
              setHeadToHeadTarget(null)
            }}
          />
          <div className="modal-card history-card">
            <div className="how-to-header">
              <h2>Your Head-to-Head History</h2>
              <button
                className="icon-close"
                aria-label="Close head-to-head history"
                onClick={() => {
                  setHeadToHeadHistoryOpen(false)
                  setHeadToHeadTarget(null)
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 5 19 19" />
                  <path d="M19 5 5 19" />
                </svg>
              </button>
            </div>
            <div className="how-to-body">
              <div className="profile-list">
                {headToHeadHistory.map((match) => (
                  <button
                    key={match.id}
                    className="profile-row match-history-row"
                    onClick={() => {
                      setHeadToHeadHistoryOpen(false)
                      setProfileTarget(null)
                      handleOpenOnlineMatch(match)
                    }}
                  >
                    <div>
                      <strong>vs {describeOpponent(match, user?.uid ?? '')}</strong>
                      <p>{formatMatchHistoryResult(match, user?.uid ?? null)}</p>
                    </div>
                    <div className="profile-row-meta">
                      <span>{formatMatchDate(match.updatedAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
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

function AvatarImage({
  className,
  name,
  photoURL,
}: {
  className: string
  name?: string | null
  photoURL?: string | null
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [photoURL])

  if (!photoURL || failed) {
    return <span className={`${className} avatar-fallback`}>{getInitials(name)}</span>
  }

  return (
    <img
      className={className}
      src={photoURL}
      alt={name ? `${name} avatar` : 'User avatar'}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

function getOnlinePlayer(match: OnlineMatchState, userId: string | null) {
  if (!userId) return null
  if (match.bluePlayer.uid === userId) return 'blue'
  if (match.orangePlayer?.uid === userId) return 'orange'
  return null
}

function canPlayTurn(
  gameMode: GameMode,
  activePlayer: Player,
  match: OnlineMatchState | null,
  userId: string | null
) {
  if (gameMode === 'offline') return true
  if (gameMode === 'bot') return activePlayer === 'blue'
  const onlinePlayer = match ? getOnlinePlayer(match, userId) : null
  return Boolean(match && match.status === 'active' && onlinePlayer === activePlayer)
}

function getOnlineStatusText(match: OnlineMatchState | null, userId: string | null) {
  if (!match) return ''
  if (match.status === 'waiting') return 'Waiting for opponent'
  if (match.status === 'finished') {
    if (match.resignedBy) {
      const player = getOnlinePlayer(match, userId)
      if (player === match.resignedBy) return 'You resigned'
      if (player) return 'Opponent resigned'
      return `${match.resignedBy} resigned`
    }
    if (match.winner === 'draw') return 'Draw'
    if (!match.winner) return 'Finished'
    const player = getOnlinePlayer(match, userId)
    return player === match.winner ? 'You won' : 'You lost'
  }
  const active = match.activePlayer === 'blue' ? match.bluePlayer : match.orangePlayer
  if (!active) return 'Waiting for opponent'
  if (active.uid === userId) return 'Your turn'
  return 'Their turn'
}

function describeOpponent(match: OnlineMatchState, userId: string) {
  const player = getOnlinePlayer(match, userId)
  if (player === 'blue') return match.orangePlayer?.displayName ?? 'Waiting for opponent'
  if (player === 'orange') return match.bluePlayer.displayName ?? 'Blue player'
  return `${match.bluePlayer.displayName ?? 'Blue player'} vs ${match.orangePlayer?.displayName ?? 'Orange player'}`
}

function getMatchCardName(match: OnlineMatchState, user: User | null) {
  if (
    user &&
    match.status === 'waiting' &&
    match.bluePlayer.uid === user.uid &&
    !match.orangePlayer
  ) {
    return 'You'
  }
  return describeOpponent(match, user?.uid ?? '')
}

function getMatchCardPhotoURL(match: OnlineMatchState, userId: string | null) {
  if (
    userId &&
    match.status === 'waiting' &&
    match.bluePlayer.uid === userId &&
    !match.orangePlayer
  ) {
    return match.bluePlayer.photoURL
  }
  return getOpponent(match, userId ?? '')?.photoURL ?? null
}

function buildPlayerProfile(
  userId: string,
  matches: OnlineMatchState[],
  publicProfile: PublicProfile | null,
  mode: 'overall' | 'shared'
) {
  const relevantMatches = matches.filter(
    (match) => match.bluePlayer.uid === userId || match.orangePlayer?.uid === userId
  )
  const completedMatches = relevantMatches.filter(
    (match) => match.status === 'finished' && Boolean(getOpponent(match, userId))
  )
  let wins = 0
  let losses = 0
  let draws = 0

  const headToHead = new Map<
    string,
    {
      uid: string
      name: string
      wins: number
      losses: number
      draws: number
      resignations: number
      winsByResignation: number
      total: number
    }
  >()

  completedMatches.forEach((match) => {
    const player = getOnlinePlayer(match, userId)
    const opponent = getOpponent(match, userId)
    if (!player || !opponent) return

    if (match.winner === player) {
      wins += 1
    } else if (match.winner === 'draw') {
      draws += 1
    } else {
      losses += 1
    }

    const existing = headToHead.get(opponent.uid) ?? {
      uid: opponent.uid,
      name: opponent.displayName ?? 'Opponent',
      wins: 0,
      losses: 0,
      draws: 0,
      resignations: 0,
      winsByResignation: 0,
      total: 0,
    }
    if (match.winner === player) existing.wins += 1
    else if (match.winner === 'draw') existing.draws += 1
    else existing.losses += 1
    if (match.resignedBy === player) existing.resignations += 1
    if (match.resignedBy && match.resignedBy !== player) existing.winsByResignation += 1
    existing.total += 1
    headToHead.set(opponent.uid, existing)
  })

  const aggregateWins = publicProfile?.wins ?? wins
  const aggregateLosses = publicProfile?.losses ?? losses
  const aggregateDraws = publicProfile?.draws ?? draws
  const aggregateCompleted = publicProfile?.completedMatches ?? completedMatches.length
  const activeMatchesList = relevantMatches
    .filter((match) => match.status === 'active')
    .map((match) => ({
      id: match.id,
      opponentName: getOpponent(match, userId)?.displayName ?? 'Opponent',
      statusText: getOnlineStatusText(match, userId),
      dateText: formatMatchDate(match.updatedAt),
    }))

  return {
    summaryLabel:
      mode === 'overall'
        ? `${aggregateCompleted} completed online matches`
        : `${aggregateCompleted} all-time completed matches`,
    completedMatches: aggregateCompleted,
    wins: aggregateWins,
    losses: aggregateLosses,
    draws: aggregateDraws,
    activeMatchesList,
    headToHead: Array.from(headToHead.values())
      .sort((left, right) => right.total - left.total || right.wins - left.wins)
      .map((entry) => ({
        ...entry,
        resignationSummary:
          entry.resignations > 0 || entry.winsByResignation > 0
            ? `${entry.winsByResignation} won by resignation, ${entry.resignations} resigned`
            : 'No resignations',
      })),
  }
}

function getOpponentProfile(match: OnlineMatchState, userId: string) {
  if (match.bluePlayer.uid === userId) return match.orangePlayer
  if (match.orangePlayer?.uid === userId) return match.bluePlayer
  return null
}

function getOpponent(match: OnlineMatchState, userId: string) {
  if (match.bluePlayer.uid === userId) return match.orangePlayer
  if (match.orangePlayer?.uid === userId) return match.bluePlayer
  return null
}

function formatMatchDate(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(value.toDate())
  }
  return 'Recent'
}

function getAppRoute(pathname: string): AppRoute {
  if (pathname === '/privacy') return { matchId: null, privacy: true }
  const match = pathname.match(/^\/match\/([^/]+)$/)
  return { matchId: match ? decodeURIComponent(match[1]) : null, privacy: false }
}

function navigateToPrivacy(replace = false) {
  if (window.location.pathname === '/privacy') return
  window.history[replace ? 'replaceState' : 'pushState']({}, '', '/privacy')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function navigateToMatch(matchId: string, replace = false) {
  const nextUrl = `/match/${encodeURIComponent(matchId)}`
  if (window.location.pathname === nextUrl) return
  window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl)
}

function navigateHome(replace = false) {
  if (window.location.pathname === '/') return
  window.history[replace ? 'replaceState' : 'pushState']({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function formatMatchHistoryResult(match: OnlineMatchState, userId: string | null) {
  const player = getOnlinePlayer(match, userId)
  const score = scoreAnchors(match.anchors)
  const playerScore =
    player === 'blue' ? score.blue : player === 'orange' ? score.orange : score.blue
  const opponentScore =
    player === 'blue' ? score.orange : player === 'orange' ? score.blue : score.orange

  if (match.winner === 'draw' || !player) {
    return `Tie ${playerScore}-${opponentScore}${formatResignationSuffix(match, player)}`
  }

  return `${match.winner === player ? 'Win' : 'Loss'} ${playerScore}-${opponentScore}${formatResignationSuffix(match, player)}`
}

function formatResignationSuffix(match: OnlineMatchState, player: Player | null) {
  if (!match.resignedBy || !player) return ''
  return match.resignedBy === player ? ' (you resigned)' : ' (they resigned)'
}

function buildLeaderboard(profiles: PublicProfile[], minimumMatches: number) {
  return profiles
    .map((profile) => {
      const wins = profile.wins ?? 0
      const losses = profile.losses ?? 0
      const draws = profile.draws ?? 0
      const completedMatches = profile.completedMatches ?? wins + losses + draws
      const scorePct = completedMatches > 0 ? (wins + draws * 0.5) / completedMatches : 0
      return {
        uid: profile.uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        wins,
        losses,
        draws,
        completedMatches,
        scorePct,
      }
    })
    .filter((profile) => profile.completedMatches >= minimumMatches)
    .sort((left, right) => {
      if (right.scorePct !== left.scorePct) return right.scorePct - left.scorePct
      if (right.wins !== left.wins) return right.wins - left.wins
      return left.losses - right.losses
    })
}

function formatLeaderboardPct(value: number) {
  return `${(value * 100).toFixed(1)}%`
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
