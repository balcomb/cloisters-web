import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  applyMove,
  buildOccupancy,
  getNextId,
  gridSize,
  isOpen,
  scoreAnchors,
  type Anchor,
  type Player,
  type Position,
} from '../game/game'

export type OnlineMatchStatus = 'waiting' | 'active' | 'finished'

export type MatchPlayerProfile = {
  uid: string
  displayName: string | null
  photoURL: string | null
  deleted?: boolean
}

export type OnlineMatchState = {
  id: string
  joinCode: string
  status: OnlineMatchStatus
  bluePlayer: MatchPlayerProfile
  orangePlayer: MatchPlayerProfile | null
  participantIds: string[]
  anchors: Anchor[]
  nextId: number
  activePlayer: Player
  lastMove: Position | null
  winner: Player | 'draw' | null
  resignedBy: Player | null
  createdAt?: unknown
  updatedAt?: unknown
}

type FirebaseUserProfile = {
  uid: string
  displayName: string | null
  photoURL: string | null
}

const matchesCollection = collection(db, 'matches')

export async function createOnlineMatch(
  user: FirebaseUserProfile,
  firstMove: Position
): Promise<string> {
  const ref = doc(matchesCollection)
  const updated = applyMove([], firstMove, 'blue', 1)
  await setDoc(ref, {
    status: 'waiting',
    bluePlayer: toProfile(user),
    orangePlayer: null,
    participantIds: [user.uid],
    anchors: updated.anchors,
    nextId: updated.nextId,
    activePlayer: 'orange',
    lastMove: firstMove,
    winner: null,
    resignedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function joinOnlineMatch(matchId: string, user: FirebaseUserProfile): Promise<void> {
  const matchRef = doc(db, 'matches', matchId)
  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef)
    if (!matchSnap.exists()) {
      throw new Error('Match not found.')
    }
    const match = withId(matchSnap.id, matchSnap.data())
    if (match.bluePlayer.uid === user.uid) {
      throw new Error('You cannot join your own match.')
    }
    if (match.orangePlayer?.uid === user.uid) {
      return
    }
    if (match.status !== 'waiting' || match.orangePlayer) {
      throw new Error('That match is no longer available.')
    }
  })
}

export async function joinOnlineMatchWithMove(
  matchId: string,
  user: FirebaseUserProfile,
  position: Position
): Promise<void> {
  const matchRef = doc(db, 'matches', matchId)
  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef)
    if (!matchSnap.exists()) {
      throw new Error('Match not found.')
    }
    const match = withId(matchSnap.id, matchSnap.data())
    if (match.bluePlayer.uid === user.uid) {
      throw new Error('You cannot join your own match.')
    }
    if (match.orangePlayer?.uid === user.uid) {
      return
    }
    if (match.status !== 'waiting' || match.orangePlayer) {
      throw new Error('That match is no longer available.')
    }

    const occupancy = buildOccupancy(match.anchors)
    if (!isOpen(position, occupancy)) {
      throw new Error('That cell is already occupied.')
    }

    const nextId = match.nextId || getNextId(match.anchors)
    const updated = applyMove(match.anchors, position, 'orange', nextId)
    const updatedOccupancy = buildOccupancy(updated.anchors)
    const boardFull = updatedOccupancy.size === gridSize * gridSize
    const score = scoreAnchors(updated.anchors)
    const winner = boardFull
      ? score.blue === score.orange
        ? 'draw'
        : score.blue > score.orange
          ? 'blue'
          : 'orange'
      : null

    transaction.update(matchRef, {
      orangePlayer: toProfile(user),
      participantIds: [match.bluePlayer.uid, user.uid],
      anchors: updated.anchors,
      nextId: updated.nextId,
      activePlayer: boardFull ? 'orange' : 'blue',
      lastMove: position,
      status: boardFull ? 'finished' : 'active',
      winner,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function submitOnlineMove(
  matchId: string,
  userId: string,
  position: Position
): Promise<void> {
  const matchRef = doc(db, 'matches', matchId)
  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef)
    if (!matchSnap.exists()) {
      throw new Error('Match not found.')
    }

    const match = withId(matchSnap.id, matchSnap.data())
    if (match.status !== 'active') {
      throw new Error('This match is not active.')
    }

    const player = getPlayerForUser(match, userId)
    if (!player) {
      throw new Error('You are not a player in this match.')
    }
    if (player !== match.activePlayer) {
      throw new Error('It is not your turn.')
    }

    const occupancy = buildOccupancy(match.anchors)
    if (!isOpen(position, occupancy)) {
      throw new Error('That cell is already occupied.')
    }

    const nextId = match.nextId || getNextId(match.anchors)
    const updated = applyMove(match.anchors, position, player, nextId)
    const nextActivePlayer: Player = player === 'blue' ? 'orange' : 'blue'
    const updatedOccupancy = buildOccupancy(updated.anchors)
    const boardFull = updatedOccupancy.size === gridSize * gridSize
    const score = scoreAnchors(updated.anchors)
    const winner = boardFull
      ? score.blue === score.orange
        ? 'draw'
        : score.blue > score.orange
          ? 'blue'
          : 'orange'
      : null

    transaction.update(matchRef, {
      anchors: updated.anchors,
      nextId: updated.nextId,
      activePlayer: boardFull ? match.activePlayer : nextActivePlayer,
      lastMove: position,
      status: boardFull ? 'finished' : 'active',
      winner,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function deleteOnlineMatch(matchId: string, userId: string): Promise<void> {
  const matchRef = doc(db, 'matches', matchId)
  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef)
    if (!matchSnap.exists()) {
      throw new Error('Match not found.')
    }

    const match = withId(matchSnap.id, matchSnap.data())
    if (match.status !== 'waiting' || match.orangePlayer) {
      throw new Error('Only open waiting matches can be deleted.')
    }
    if (match.bluePlayer.uid !== userId) {
      throw new Error('Only the match creator can delete this match.')
    }
  })

  await deleteDoc(matchRef)
}

export async function resignOnlineMatch(matchId: string, userId: string): Promise<void> {
  const matchRef = doc(db, 'matches', matchId)
  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef)
    if (!matchSnap.exists()) {
      throw new Error('Match not found.')
    }

    const match = withId(matchSnap.id, matchSnap.data())
    if (match.status === 'finished') {
      return
    }

    const player = getPlayerForUser(match, userId)
    if (!player) {
      throw new Error('You are not a player in this match.')
    }

    const winner =
      match.status === 'active' ? (player === 'blue' ? 'orange' : 'blue') : null

    transaction.update(matchRef, {
      status: 'finished',
      winner,
      resignedBy: player,
      updatedAt: serverTimestamp(),
    })
  })
}

export function subscribeToOnlineMatch(
  matchId: string,
  onValue: (match: OnlineMatchState | null) => void
): Unsubscribe {
  const ref = doc(db, 'matches', matchId)
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onValue(null)
      return
    }
    onValue(withId(snap.id, snap.data()))
  })
}

export function subscribeToUserMatches(
  userId: string,
  onValue: (matches: OnlineMatchState[]) => void
): Unsubscribe {
  const q = query(matchesCollection, where('participantIds', 'array-contains', userId))
  return onSnapshot(q, (snap) => {
    const matches = snap.docs.map((docSnap) => withId(docSnap.id, docSnap.data()))
    matches.sort((left, right) => timestampValue(right.updatedAt) - timestampValue(left.updatedAt))
    onValue(matches)
  })
}

export function subscribeToWaitingMatches(
  onValue: (matches: OnlineMatchState[]) => void
): Unsubscribe {
  const q = query(matchesCollection, where('status', '==', 'waiting'))
  return onSnapshot(q, (snap) => {
    const matches = snap.docs.map((docSnap) => withId(docSnap.id, docSnap.data()))
    matches.sort((left, right) => timestampValue(right.updatedAt) - timestampValue(left.updatedAt))
    onValue(matches)
  })
}

function withId(id: string, data: Record<string, unknown>): OnlineMatchState {
  return {
    id,
    joinCode: typeof data.joinCode === 'string' ? data.joinCode : '',
    status: isMatchStatus(data.status) ? data.status : 'waiting',
    bluePlayer: parseMatchPlayerProfile(data.bluePlayer),
    orangePlayer: data.orangePlayer ? parseMatchPlayerProfile(data.orangePlayer) : null,
    participantIds: Array.isArray(data.participantIds) ? (data.participantIds as string[]) : [],
    anchors: Array.isArray(data.anchors) ? (data.anchors as Anchor[]) : [],
    nextId: typeof data.nextId === 'number' ? data.nextId : 1,
    activePlayer: data.activePlayer === 'orange' ? 'orange' : 'blue',
    lastMove: isPosition(data.lastMove) ? data.lastMove : null,
    winner: isWinner(data.winner) ? data.winner : null,
    resignedBy: isPlayer(data.resignedBy) ? data.resignedBy : null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function timestampValue(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis()
  }
  return 0
}

function getPlayerForUser(match: OnlineMatchState, userId: string): Player | null {
  if (match.bluePlayer.uid === userId) return 'blue'
  if (match.orangePlayer?.uid === userId) return 'orange'
  return null
}

function toProfile(user: FirebaseUserProfile): MatchPlayerProfile {
  return {
    uid: user.uid,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    deleted: false,
  }
}

function parseMatchPlayerProfile(value: unknown): MatchPlayerProfile {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    uid: typeof data.uid === 'string' ? data.uid : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
    deleted: data.deleted === true,
  }
}

function isMatchStatus(value: unknown): value is OnlineMatchStatus {
  return value === 'waiting' || value === 'active' || value === 'finished'
}

function isWinner(value: unknown): value is Player | 'draw' | null {
  return value === 'blue' || value === 'orange' || value === 'draw' || value === null
}

function isPlayer(value: unknown): value is Player {
  return value === 'blue' || value === 'orange'
}

function isPosition(value: unknown): value is Position {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'x' in value &&
      'y' in value &&
      typeof value.x === 'number' &&
      typeof value.y === 'number'
  )
}
