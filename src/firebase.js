import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCNhSsbEVlkFHHMx0vTAatbpG2LalNqcpk",
  authDomain: "shda-6245c.firebaseapp.com",
  databaseURL: "https://shda-6245c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "shda-6245c",
  storageBucket: "shda-6245c.firebasestorage.app",
  messagingSenderId: "1093266444152",
  appId: "1:1093266444152:web:7fda9d93651391f6d2428d",
  measurementId: "G-WFEGGYC8KM"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);

// Export Database and Auth so our Login screen can use them
export const db = getDatabase(app);
export const auth = getAuth(app);
