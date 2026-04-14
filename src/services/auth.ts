import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions, googleProvider } from '../firebase'

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

function prefersRedirectAuth() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export async function resolveRedirectSignIn() {
  await getRedirectResult(auth)
}

export async function signInWithGoogle() {
  if (prefersRedirectAuth()) {
    await signInWithRedirect(auth, googleProvider)
    return
  }

  await signInWithPopup(auth, googleProvider)
}

export async function deleteAccountAndData() {
  const deleteCallable = httpsCallable(functions, 'deleteAccountAndData')
  await deleteCallable()
  await signOut(auth)
}

export async function signOutUser() {
  await signOut(auth)
}

export { GoogleAuthProvider }
