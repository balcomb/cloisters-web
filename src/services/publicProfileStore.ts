import {
  Timestamp,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase'

export type PublicProfileResult = {
  matchId: string
  opponentUid: string
  opponentName: string
  outcome: 'win' | 'loss' | 'draw'
  method: 'completed' | 'resigned'
  playedAt: Timestamp
}

export type PublicProfile = {
  uid: string
  displayName: string | null
  photoURL: string | null
  wins?: number
  losses?: number
  draws?: number
  resignations?: number
  winsByResignation?: number
  completedMatches?: number
  joinedAt?: unknown
  updatedAt?: unknown
  recentResults: PublicProfileResult[]
}

type FirebaseUserProfile = {
  uid: string
  displayName: string | null
  photoURL: string | null
}

export async function syncPublicProfileIdentity(user: FirebaseUserProfile): Promise<void> {
  const ref = doc(db, 'publicProfiles', user.uid)
  await setDoc(
    ref,
    {
      uid: user.uid,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      updatedAt: serverTimestamp(),
      joinedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

export function subscribeToPublicProfile(
  uid: string,
  onValue: (profile: PublicProfile | null) => void
): Unsubscribe {
  const ref = doc(db, 'publicProfiles', uid)
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onValue(null)
      return
    }
    const data = snap.data()
    onValue({
      uid,
      displayName: typeof data.displayName === 'string' ? data.displayName : null,
      photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
      wins: typeof data.wins === 'number' ? data.wins : undefined,
      losses: typeof data.losses === 'number' ? data.losses : undefined,
      draws: typeof data.draws === 'number' ? data.draws : undefined,
      resignations: typeof data.resignations === 'number' ? data.resignations : undefined,
      winsByResignation: typeof data.winsByResignation === 'number' ? data.winsByResignation : undefined,
      completedMatches: typeof data.completedMatches === 'number' ? data.completedMatches : undefined,
      joinedAt: data.joinedAt,
      updatedAt: data.updatedAt,
      recentResults: Array.isArray(data.recentResults)
        ? (data.recentResults.filter(isPublicProfileResult) as PublicProfileResult[])
        : [],
    })
  })
}

function isPublicProfileResult(value: unknown): value is PublicProfileResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'matchId' in value &&
      'opponentUid' in value &&
      'opponentName' in value &&
      'outcome' in value &&
      'method' in value &&
      'playedAt' in value
  )
}
