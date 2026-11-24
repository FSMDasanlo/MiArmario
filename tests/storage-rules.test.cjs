const assert = require('node:assert/strict');
const test = require('node:test');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInAnonymously } = require('firebase/auth');
const { getStorage, connectStorageEmulator, ref, getBytes, uploadBytes, deleteObject } = require('firebase/storage');
const { createRequire } = require('node:module');
const functionsRequire = createRequire(require('node:path').join(__dirname, '..', 'functions', 'package.json'));
const adminApp = functionsRequire('firebase-admin/app');
const { getStorage: getAdminStorage } = functionsRequire('firebase-admin/storage');

test('fotos y resultados privados solo permiten leer y borrar al propietario', async () => {
  const projectId = 'demo-miarmario';
  const bucket = `${projectId}.appspot.com`;
  const apps = ['owner', 'other', 'anonymous'].map((name) => initializeApp({ projectId, apiKey: 'demo-key', storageBucket: bucket }, name));
  const admin = adminApp.initializeApp({ projectId, storageBucket: bucket }, 'storage-rules-admin');
  process.env.STORAGE_EMULATOR_HOST = 'http://127.0.0.1:9199';
  try {
    const users = await Promise.all(apps.slice(0, 2).map(async (app) => {
      const auth = getAuth(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      const { user } = await signInAnonymously(auth);
      const storage = getStorage(app);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      return { user, storage };
    }));
    const unauthenticated = getStorage(apps[2]);
    connectStorageEmulator(unauthenticated, '127.0.0.1', 9199);
    for (const name of ['photo', 'result']) {
      const filePath = `users/${users[0].user.uid}/virtualTryOn/${name}`;
      await getAdminStorage(admin).bucket().file(filePath).save(Buffer.from('test'), { resumable: false });
      assert.equal(Buffer.from(await getBytes(ref(users[0].storage, filePath))).toString(), 'test');
      await assert.rejects(getBytes(ref(unauthenticated, filePath)), { code: 'storage/unauthorized' });
      await assert.rejects(getBytes(ref(users[1].storage, filePath)), { code: 'storage/unauthorized' });
      await assert.rejects(deleteObject(ref(users[1].storage, filePath)), { code: 'storage/unauthorized' });
      await assert.rejects(uploadBytes(ref(users[0].storage, filePath), new Uint8Array([1])), { code: 'storage/unauthorized' });
      await deleteObject(ref(users[0].storage, filePath));
    }
    await assert.rejects(uploadBytes(ref(users[0].storage, `users/${users[0].user.uid}/virtualTryOn/other`), new Uint8Array([1])), { code: 'storage/unauthorized' });
  } finally {
    await Promise.all(apps.map(deleteApp));
    await adminApp.deleteApp(admin);
    delete process.env.STORAGE_EMULATOR_HOST;
  }
});
