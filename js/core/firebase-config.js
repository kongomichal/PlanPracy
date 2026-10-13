/* Konfiguracja Firebase dla Muraven – plan pracy */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCAKE8sMACsYMvuFzwTPSIe7FFOJKDiniM",
  authDomain: "muraven-plan-pracy.firebaseapp.com",
  projectId: "muraven-plan-pracy",
  storageBucket: "muraven-plan-pracy.firebasestorage.app",
  messagingSenderId: "585410877097",
  appId: "1:585410877097:web:002a14b9d8faab65c0fbb8"
};

const CLOUD_ENABLED = !FIREBASE_CONFIG.apiKey.startsWith('WKLEJ') && typeof firebase !== 'undefined';
if (CLOUD_ENABLED) {
  firebase.initializeApp(FIREBASE_CONFIG);
}
