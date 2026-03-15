import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
 apiKey: "AIzaSyBEOvyX_kVNTp3QoWZSWPRNeGypic1aaZ4",
  authDomain: "lecture-ai-cff79.firebaseapp.com",
  projectId: "lecture-ai-cff79",
  storageBucket: "lecture-ai-cff79.firebasestorage.app",
  messagingSenderId: "956566308054",
  appId: "1:956566308054:web:a5b76d37d519584f29f577",
  measurementId: "G-NYLMEM1C7L"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);