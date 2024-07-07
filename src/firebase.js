import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyDubsiExI4tIJ6xAPbZtA3Ttix8yh4KPAU",
    authDomain: "react-vsco.firebaseapp.com",
    projectId: "react-vsco",
    storageBucket: "react-vsco.appspot.com",
    messagingSenderId: "915299192234",
    appId: "1:915299192234:web:bb1f7e3bb9b1d599a46fd3"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);