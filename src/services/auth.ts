import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'

export type AuthState = {
  user: User | null
  loading: boolean
}

export function subscribeToAuth(callback: (state: AuthState) => void) {
  callback({ user: auth.currentUser, loading: true })
  return onAuthStateChanged(auth, (user) => {
    callback({ user, loading: false })
  })
}

export async function signInWithGoogle() {
  await signInWithPopup(auth, googleProvider)
}

export async function signOutUser() {
  await signOut(auth)
}

export { GoogleAuthProvider }
