import { initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";

import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "firebase/auth";
import type { Auth, User } from "firebase/auth";


interface SignInResult {
  user: User;
  token: string;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY!,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN!,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID!,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID!,
  appId: import.meta.env.VITE_FIREBASE_APP_ID!,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID!
};


const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const provider = new GoogleAuthProvider();

const signInWithGoogle = async (): Promise<SignInResult> => {
  const result = await signInWithPopup(auth, provider);
  const token = await result.user.getIdToken(); // JWT for backend auth
  return { user: result.user, token };
};



export const signInWithGoogleRedirect = async () => {
  await signInWithRedirect(auth, provider);
};

export const handleRedirectLogin = async () => {
  const result = await getRedirectResult(auth);
  if (!result) return null; // user has not returned yet

  const token = await result.user.getIdToken();
  return { user: result.user, token };
};


export { auth, signInWithGoogle };


