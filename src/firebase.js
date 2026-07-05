import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCgjC4oUR_-RLCZPeW95J3VGg7U4-Ui8bk",
  authDomain: "ints-cst.firebaseapp.com",
  projectId: "ints-cst",
  storageBucket: "ints-cst.firebasestorage.app",
  messagingSenderId: "418459474599",
  appId: "1:418459474599:web:c881ce32f72afa3dc15982"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
