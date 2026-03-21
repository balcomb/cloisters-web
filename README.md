# Cloisters Web

Web adaptation of the Cloisters strategy game.

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

Create a `.env` file in the project root with the following values:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## Firestore Rules

Use `firestore.rules` to restrict access to per-user bot game data:

```bash
firebase deploy --only firestore:rules
```

## Scripts

```bash
npm run dev
npm run build
npm run lint
```
