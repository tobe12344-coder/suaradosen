import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  projectId: "suaradosen-app-pbd",
  appId: "1:772933075977:web:14114d50b7a2e5e397e4d8",
  storageBucket: "suaradosen-app-pbd.firebasestorage.app",
  apiKey: "AIzaSyDylCz9LwRe4n-zQ-Wp1oRiAp6LwlJnEfc",
  authDomain: "suaradosen-app-pbd.firebaseapp.com",
  messagingSenderId: "772933075977",
  databaseURL: "https://suaradosen-app-pbd-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
