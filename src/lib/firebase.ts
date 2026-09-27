import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  FacebookAuthProvider, 
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  memoryLocalCache,
  CACHE_SIZE_UNLIMITED,
  enableNetwork,
  disableNetwork,
  waitForPendingWrites,
  doc, 
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { 
  getStorage, 
  ref as storageRef, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firestore with robust multi-tab offline persistence & fallbacks on the correct database ID
const targetDatabaseId = firebaseConfig.firestoreDatabaseId || undefined;

function createFirestoreInstance() {
  // 1. First priority: Multi-tab persistent local cache with unlimited cache size
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      }),
      experimentalForceLongPolling: true,
    }, targetDatabaseId);
  } catch (errMultiTab) {
    console.warn("Firestore multi-tab persistence notice, trying single-tab fallback:", errMultiTab);
  }

  // 2. Second priority: Single-tab persistent local cache with unlimited cache size
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({}),
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      }),
      experimentalForceLongPolling: true,
    }, targetDatabaseId);
  } catch (errSingleTab) {
    console.warn("Firestore single-tab persistence fallback notice:", errSingleTab);
  }

  // 3. Fallback: Memory cache if IndexedDB is blocked or unavailable
  try {
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
      experimentalForceLongPolling: true,
    }, targetDatabaseId);
  } catch (errMemory) {
    // 4. Fallback if instance was already initialized
    try {
      return getFirestore(app, targetDatabaseId);
    } catch {
      return getFirestore(app);
    }
  }
}

export const db = createFirestoreInstance();

// Export network synchronization utilities
export { enableNetwork, disableNetwork, waitForPendingWrites };

// Automatically manage Firestore network connection on browser online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    enableNetwork(db).catch(() => {
      // Ignored: already enabled or auto-reconnected
    });
  });

  window.addEventListener('offline', () => {
    disableNetwork(db).catch(() => {
      // Ignored: already disabled
    });
  });
}

// Initialize Authentication
export const auth = getAuth(app);

// Initialize Firebase Storage
export const storage = getStorage(app);

// Firebase Storage helpers for documents/images
export async function uploadUserFile(userId: string, folder: string, fileName: string, file: Blob | File): Promise<string> {
  const fileRef = storageRef(storage, `users/${userId}/${folder}/${Date.now()}_${fileName}`);
  const snapshot = await uploadBytes(fileRef, file);
  return await getDownloadURL(snapshot.ref);
}

export async function deleteUserFileByUrl(fileUrl: string): Promise<void> {
  try {
    const fileRef = storageRef(storage, fileUrl);
    await deleteObject(fileRef);
  } catch (e) {
    console.warn("Could not delete storage file:", e);
  }
}

// Authentication Providers
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});
export const facebookProvider = new FacebookAuthProvider();
export const microsoftProvider = new OAuthProvider('microsoft.com');

// Error handling types for Firestore ABAC & Debugging
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
