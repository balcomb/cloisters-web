import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { Anchor, Player } from '../game/game'

export type OfflineGameState = {
  updatedAt?: unknown
  anchors: Anchor[]
  nextId: number
  activePlayer: Player
}

export async function loadOfflineGame(uid: string): Promise<OfflineGameState | null> {
  const ref = doc(db, 'users', uid, 'offlineGame', 'active')
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return snap.data() as OfflineGameState
}

export async function saveOfflineGame(uid: string, state: OfflineGameState): Promise<void> {
  const ref = doc(db, 'users', uid, 'offlineGame', 'active')
  await setDoc(
    ref,
    {
      ...state,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}
