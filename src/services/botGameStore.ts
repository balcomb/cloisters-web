import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { Anchor, Player, SkillLevel } from '../game/game'

export type BotGameState = {
  skillLevel: SkillLevel
  updatedAt?: unknown
  anchors: Anchor[]
  nextId: number
  activePlayer: Player
}

export async function loadBotGame(uid: string, skillLevel: SkillLevel): Promise<BotGameState | null> {
  const ref = doc(db, 'users', uid, 'botGames', skillLevel)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return snap.data() as BotGameState
}

export async function saveBotGame(uid: string, state: BotGameState): Promise<void> {
  const ref = doc(db, 'users', uid, 'botGames', state.skillLevel)
  await setDoc(
    ref,
    {
      ...state,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}
