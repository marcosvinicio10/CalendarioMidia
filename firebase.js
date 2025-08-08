(function initFirebase() {
  if (!window.firebase || !window.firebaseConfig) {
    console.warn('Firebase SDK ou configuração ausente. Edite firebase-config.js.');
    return;
  }
  try {
    const app = firebase.initializeApp(window.firebaseConfig);
    const db = firebase.firestore();

    // Otimizações simples de cache (persistência apenas se suportado)
    if (db && db.enablePersistence) {
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    }

    window.firebaseApp = app;
    window.db = db;
  } catch (err) {
    console.error('Falha ao inicializar Firebase:', err);
  }
})();

