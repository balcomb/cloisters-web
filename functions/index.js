const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const { Timestamp, getFirestore } = require('firebase-admin/firestore')

initializeApp()

const db = getFirestore()

exports.syncPublicProfilesOnMatchFinished = onDocumentWritten('matches/{matchId}', async (event) => {
  const beforeData = event.data?.before.exists ? event.data.before.data() : null
  const afterData = event.data?.after.exists ? event.data.after.data() : null

  if (!afterData) return
  if (beforeData?.status === 'finished' || afterData.status !== 'finished') return
  if (!afterData.bluePlayer || !afterData.orangePlayer) return

  const matchId = event.params.matchId
  const playedAt = afterData.updatedAt instanceof Timestamp ? afterData.updatedAt : Timestamp.now()

  const blueResult = buildPlayerResult(matchId, 'blue', afterData, playedAt)
  const orangeResult = buildPlayerResult(matchId, 'orange', afterData, playedAt)

  await db.runTransaction(async (transaction) => {
    await applyProfileResult(transaction, blueResult)
    await applyProfileResult(transaction, orangeResult)
  })
})

function buildPlayerResult(matchId, player, match, playedAt) {
  const profile = player === 'blue' ? match.bluePlayer : match.orangePlayer
  const opponent = player === 'blue' ? match.orangePlayer : match.bluePlayer
  return {
    matchId,
    player,
    profile,
    opponent,
    playedAt,
    outcome: getOutcomeForPlayer(player, match.winner),
    method: match.resignedBy ? 'resigned' : 'completed',
    didResign: match.resignedBy === player,
    opponentResigned: Boolean(match.resignedBy && match.resignedBy !== player),
  }
}

async function applyProfileResult(transaction, result) {
  const profileRef = db.doc(`publicProfiles/${result.profile.uid}`)
  const markerRef = profileRef.collection('processedMatches').doc(result.matchId)

  const markerSnap = await transaction.get(markerRef)
  if (markerSnap.exists) return

  const profileSnap = await transaction.get(profileRef)
  const current = profileSnap.exists ? getStoredPublicProfile(profileSnap.data()) : getEmptyPublicProfile(result.profile)
  const recentResult = {
    matchId: result.matchId,
    opponentUid: result.opponent.uid,
    opponentName: result.opponent.displayName || 'Opponent',
    outcome: result.outcome,
    method: result.method,
    playedAt: result.playedAt,
  }

  transaction.set(
    profileRef,
    {
      uid: result.profile.uid,
      displayName: result.profile.displayName ?? current.displayName ?? null,
      photoURL: result.profile.photoURL ?? current.photoURL ?? null,
      wins: current.wins + (result.outcome === 'win' ? 1 : 0),
      losses: current.losses + (result.outcome === 'loss' ? 1 : 0),
      draws: current.draws + (result.outcome === 'draw' ? 1 : 0),
      resignations: current.resignations + (result.didResign ? 1 : 0),
      winsByResignation: current.winsByResignation + (result.opponentResigned ? 1 : 0),
      completedMatches: current.completedMatches + 1,
      recentResults: [recentResult, ...current.recentResults].slice(0, 10),
    },
    { merge: true }
  )
  transaction.set(markerRef, { processedAt: Timestamp.now() })
}

function getOutcomeForPlayer(player, winner) {
  if (winner === 'draw' || winner == null) return 'draw'
  return winner === player ? 'win' : 'loss'
}

function getStoredPublicProfile(data) {
  return {
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
    wins: typeof data.wins === 'number' ? data.wins : 0,
    losses: typeof data.losses === 'number' ? data.losses : 0,
    draws: typeof data.draws === 'number' ? data.draws : 0,
    resignations: typeof data.resignations === 'number' ? data.resignations : 0,
    winsByResignation: typeof data.winsByResignation === 'number' ? data.winsByResignation : 0,
    completedMatches: typeof data.completedMatches === 'number' ? data.completedMatches : 0,
    recentResults: Array.isArray(data.recentResults) ? data.recentResults : [],
  }
}

function getEmptyPublicProfile(profile) {
  return {
    displayName: profile.displayName ?? null,
    photoURL: profile.photoURL ?? null,
    wins: 0,
    losses: 0,
    draws: 0,
    resignations: 0,
    winsByResignation: 0,
    completedMatches: 0,
    recentResults: [],
  }
}
