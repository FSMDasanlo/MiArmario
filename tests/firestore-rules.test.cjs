const assert = require('node:assert/strict');
const test = require('node:test');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInAnonymously } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, getDoc, serverTimestamp } = require('firebase/firestore/lite');

test('las reglas permiten el precio válido y rechazan datos o usuarios incorrectos', async () => {
  const app = initializeApp({ projectId: 'demo-miarmario', apiKey: 'demo-key' }, 'rules-test');
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  try {
    const { user } = await signInAnonymously(auth);
    const ref = doc(db, 'users', user.uid, 'garments', 'garment-1');
    const payload = {
      name: 'Camiseta', category: 'camisetas', color: 'azul', price: 25.5,
      season: ['verano'], style: ['casual'],
      imagePath: `users/${user.uid}/garments/garment-1/photo`,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    assert.equal((await getDoc(ref)).data().price, 25.5);
    await updateDoc(ref, { price: 0, updatedAt: serverTimestamp() });
    assert.equal((await getDoc(ref)).data().price, 0);
    await assert.rejects(updateDoc(ref, { price: -1 }), { code: 'permission-denied' });
    const { price: _price, imagePath: _imagePath, ...withoutPrice } = payload;
    await assert.rejects(setDoc(doc(db, 'users', user.uid, 'garments', 'no-price'), withoutPrice), { code: 'permission-denied' });
    await assert.rejects(setDoc(doc(db, 'users', user.uid, 'garments', 'wrong-image'), payload), { code: 'permission-denied' });
    await assert.rejects(getDoc(doc(db, 'users', 'other-user', 'garments', 'garment-1')), { code: 'permission-denied' });
    const usage = doc(db, 'virtualTryOnDailyUsage', `2026-11-24_${user.uid}`);
    await assert.rejects(getDoc(usage), { code: 'permission-denied' });
    await assert.rejects(setDoc(usage, { day: '2026-11-24', uid: user.uid, count: 1 }), { code: 'permission-denied' });
  } finally {
    await deleteApp(app);
  }
});
