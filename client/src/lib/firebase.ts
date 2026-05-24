import { initializeApp, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";

// Read env once so we can decide whether Firebase is actually configured.
// If the required VITE_FIREBASE_* vars are missing at build time, we MUST
// NOT call initializeApp + getDatabase — getDatabase() throws a fatal error
// when databaseURL is empty, which crashes the entire React mount (white
// screen of death). Instead, log a warning and export null-ish stubs so any
// consumer code that imports `database` can defensively no-op.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

const isConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let _database: Database | null = null;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    _database = getDatabase(app);
  } catch (err) {
    console.warn("[Firebase] init failed — app will run without Firebase:", err);
    app = null;
    _database = null;
  }
} else {
  console.warn(
    "[Firebase] Not configured — missing one of VITE_FIREBASE_API_KEY / VITE_FIREBASE_DATABASE_URL / VITE_FIREBASE_PROJECT_ID. " +
    "Firebase-dependent features (presence, success stories, live activity) will be inert."
  );
}

export const database = _database as Database;  // null-safe consumers check before using
export const rtdb = _database as Database;
export default app as FirebaseApp;