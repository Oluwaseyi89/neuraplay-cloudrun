import { initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";

import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import type { Auth, User } from "firebase/auth";


interface SignInResult {
  user: User;
  token: string;
}




const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY!,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN!,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID!,
};

const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);

const signInWithGoogle = async (): Promise<SignInResult> => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const token = await result.user.getIdToken(); // JWT for backend auth
  return { user: result.user, token };
};

export { auth, signInWithGoogle };


