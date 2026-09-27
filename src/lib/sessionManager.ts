import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp, 
  getDocs,
  Unsubscribe 
} from "firebase/firestore";
import { db } from "./firebase";

export interface UserSessionDoc {
  sessionId: string;
  id: string; // backwards compatibility with UI
  userId: string;
  deviceName: string;
  deviceType: "mobile" | "tablet" | "desktop";
  platform: string; // e.g. "Web", "Android", "Android (Capacitor)", "iOS", "Windows", "macOS"
  browser: string;
  os: string;
  loginAt: string;
  lastActivityAt: string;
  lastActive: string; // backwards compatibility with UI
  status: "active" | "ended";
  fcmToken: string | null;
  endedAt?: string;
  isCurrent?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

const SESSION_STORAGE_KEY = "acc_device_session_id";
const LAST_TOUCH_KEY = "acc_last_session_touch";
const MIN_TOUCH_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes throttle for Firestore write conservation

/**
 * Retrieve or generate a persistent, unique sessionId for this specific browser/device.
 * Stored in localStorage so it remains constant across page reloads and re-renders,
 * but differs across different devices and browsers.
 */
export function getOrCreateCurrentSessionId(): string {
  if (typeof window === "undefined") {
    return "sess_fallback";
  }
  try {
    let currentId = localStorage.getItem(SESSION_STORAGE_KEY);
    // Enforce Firestore ID validity: length <= 128, matching ^[a-zA-Z0-9_\-]+$
    if (!currentId || !/^[a-zA-Z0-9_-]{12,64}$/.test(currentId)) {
      currentId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem(SESSION_STORAGE_KEY, currentId);
    }
    return currentId;
  } catch {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}

/**
 * Clear the current device session ID from storage (e.g. on manual logout so next login creates fresh session)
 */
export function resetCurrentSessionId(): string {
  try {
    const nextId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem(SESSION_STORAGE_KEY, nextId);
    return nextId;
  } catch {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}

/**
 * Accurately detect device, browser, operating system, and platform (including Capacitor Android APK)
 */
export function detectPlatformAndDevice() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isCapacitor =
    typeof window !== "undefined" &&
    (typeof (window as any).Capacitor !== "undefined" || !!(window as any).Capacitor?.isNativePlatform?.());

  const capacitorPlatform =
    typeof window !== "undefined" ? (window as any).Capacitor?.getPlatform?.() : undefined;

  let platform = "Web";
  let os = "Windows PC";
  let deviceType: "mobile" | "tablet" | "desktop" = "desktop";

  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isIPad =
    /iPad/i.test(ua) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isTablet = isIPad || /tablet|playbook|silk|(android(?!.*mobile))/i.test(ua);

  if (isCapacitor) {
    if (capacitorPlatform === "android" || isAndroid) {
      platform = "Android (Capacitor)";
      os = "Android APK";
      deviceType = isTablet ? "tablet" : "mobile";
    } else if (capacitorPlatform === "ios" || isIOS) {
      platform = "iOS (Capacitor)";
      os = "iOS App";
      deviceType = isTablet ? "tablet" : "mobile";
    } else {
      platform = "Capacitor App";
      os = "تطبيق Capacitor";
      deviceType = isTablet ? "tablet" : "mobile";
    }
  } else if (isAndroid) {
    platform = "Android";
    os = "Android";
    deviceType = isTablet ? "tablet" : "mobile";
  } else if (isIOS) {
    platform = isIPad ? "iPadOS" : "iOS";
    os = isIPad ? "iPadOS" : "iOS";
    deviceType = isTablet ? "tablet" : "mobile";
  } else if (/Mac OS/i.test(ua)) {
    platform = "macOS";
    os = "macOS";
    deviceType = "desktop";
  } else if (/Windows/i.test(ua)) {
    platform = "Windows";
    os = "Windows";
    deviceType = "desktop";
  } else if (/Linux/i.test(ua)) {
    platform = "Linux";
    os = "Linux";
    deviceType = "desktop";
  }

  // Detect Browser
  let browser = "Google Chrome";
  if (isCapacitor) {
    browser = "تطبيق أندرويد (Capacitor)";
  } else if (/Edg/i.test(ua)) {
    browser = "Microsoft Edge";
  } else if (/Firefox/i.test(ua)) {
    browser = "Mozilla Firefox";
  } else if (/OPR|Opera/i.test(ua)) {
    browser = "Opera";
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = "Samsung Internet";
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = "Apple Safari";
  } else if (/Chrome/i.test(ua)) {
    browser = "Google Chrome";
  } else {
    browser = "متصفح الويب";
  }

  // Friendly Arabic Device Name
  let deviceName = `${os} - ${browser}`;
  if (isAndroid) {
    const match = ua.match(/Android[^;]+;\s*([^;)]+)\)/i);
    if (match && match[1]) {
      const cleanModel = match[1].split(" Build/")[0].trim();
      if (cleanModel && !cleanModel.toLowerCase().includes("wv") && cleanModel.length < 32) {
        deviceName = isCapacitor ? `${cleanModel} (تطبيق أندرويد)` : `${cleanModel} (${browser})`;
      } else {
        deviceName = isCapacitor ? "هاتف أندرويد (تطبيق APK)" : `هاتف أندرويد (${browser})`;
      }
    } else {
      deviceName = isCapacitor ? "هاتف أندرويد (تطبيق APK)" : `هاتف أندرويد (${browser})`;
    }
  } else if (isIPad) {
    deviceName = `جهاز iPad (${browser})`;
  } else if (isIOS) {
    deviceName = `هاتف iPhone (${browser})`;
  } else if (os === "Windows") {
    deviceName = `كمبيوتر Windows (${browser})`;
  } else if (os === "macOS") {
    deviceName = `جهاز Mac (${browser})`;
  } else if (os === "Linux") {
    deviceName = `جهاز Linux (${browser})`;
  }

  return {
    platform,
    os,
    deviceType,
    browser,
    deviceName,
  };
}

/**
 * Initialize or update the current session in Firestore:
 * - Creates the session doc once on login under `users/{userId}/sessions/{sessionId}`
 * - If already exists, updates status to 'active' and records latest activity without duplicating
 */
export async function initializeOrUpdateCurrentSession(
  userId: string,
  fcmToken?: string | null
): Promise<UserSessionDoc> {
  const sessionId = getOrCreateCurrentSessionId();
  const info = detectPlatformAndDevice();
  const nowIso = new Date().toISOString();

  const sessionDocRef = doc(db, "users", userId, "sessions", sessionId);
  const snap = await getDoc(sessionDocRef).catch(() => null);

  let sessionData: UserSessionDoc;

  if (snap && snap.exists()) {
    const existing = snap.data() as Partial<UserSessionDoc>;
    sessionData = {
      sessionId,
      id: sessionId,
      userId,
      deviceName: info.deviceName,
      deviceType: info.deviceType,
      platform: info.platform,
      browser: info.browser,
      os: info.os,
      loginAt: existing.loginAt || nowIso,
      lastActivityAt: nowIso,
      lastActive: nowIso,
      status: "active",
      fcmToken: fcmToken !== undefined ? fcmToken : existing.fcmToken || null,
      isCurrent: true,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(sessionDocRef, {
      status: "active",
      deviceName: info.deviceName,
      deviceType: info.deviceType,
      platform: info.platform,
      browser: info.browser,
      os: info.os,
      lastActivityAt: nowIso,
      lastActive: nowIso,
      ...(fcmToken ? { fcmToken } : {}),
      updatedAt: serverTimestamp(),
    }).catch((e) => console.warn("Could not update existing session in Firestore:", e));
  } else {
    sessionData = {
      sessionId,
      id: sessionId,
      userId,
      deviceName: info.deviceName,
      deviceType: info.deviceType,
      platform: info.platform,
      browser: info.browser,
      os: info.os,
      loginAt: nowIso,
      lastActivityAt: nowIso,
      lastActive: nowIso,
      status: "active",
      fcmToken: fcmToken || null,
      isCurrent: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(sessionDocRef, sessionData).catch((e) =>
      console.warn("Could not create new session in Firestore:", e)
    );
  }

  try {
    localStorage.setItem(LAST_TOUCH_KEY, String(Date.now()));
  } catch {}

  return sessionData;
}

/**
 * Throttled update of `lastActivityAt` in Firestore.
 * Does NOT spam Firestore on every re-render or small event. Only writes if at least 3 minutes passed.
 */
let inMemoryLastTouch = 0;
export async function touchSessionActivity(
  userId: string,
  sessionId?: string,
  force: boolean = false
): Promise<void> {
  if (!userId) return;
  const targetId = sessionId || getOrCreateCurrentSessionId();
  const now = Date.now();

  if (!force && now - inMemoryLastTouch < MIN_TOUCH_INTERVAL_MS) {
    return;
  }
  inMemoryLastTouch = now;

  try {
    const sessionDocRef = doc(db, "users", userId, "sessions", targetId);
    const nowIso = new Date().toISOString();
    await updateDoc(sessionDocRef, {
      lastActivityAt: nowIso,
      lastActive: nowIso,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Suppress non-critical background activity touch errors
  }
}

/**
 * Update FCM token on the current session document without creating a new session
 */
export async function linkFcmTokenToSession(
  userId: string,
  sessionId: string,
  fcmToken: string
): Promise<void> {
  if (!userId || !sessionId || !fcmToken) return;
  try {
    const sessionDocRef = doc(db, "users", userId, "sessions", sessionId);
    await updateDoc(sessionDocRef, {
      fcmToken,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Could not link FCM token to session:", err);
  }
}

/**
 * Real-time subscription to all user sessions under `users/{userId}/sessions`
 */
export function subscribeToUserSessions(
  userId: string,
  currentSessionId: string,
  callback: (sessions: UserSessionDoc[]) => void
): Unsubscribe {
  const sessionsCol = collection(db, "users", userId, "sessions");

  return onSnapshot(
    sessionsCol,
    (snapshot) => {
      const items: UserSessionDoc[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserSessionDoc;
        const sId = docSnap.id;
        items.push({
          ...data,
          id: sId,
          sessionId: data.sessionId || sId,
          isCurrent: sId === currentSessionId,
          lastActive: data.lastActivityAt || data.lastActive || new Date().toISOString(),
          status: data.status || "active",
        });
      });

      // Sort: current session first, then active sessions by lastActivityAt descending, then ended sessions
      items.sort((a, b) => {
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        if (a.status === "active" && b.status !== "active") return -1;
        if (a.status !== "active" && b.status === "active") return 1;
        const timeA = new Date(a.lastActivityAt || a.lastActive || 0).getTime();
        const timeB = new Date(b.lastActivityAt || b.lastActive || 0).getTime();
        return timeB - timeA;
      });

      callback(items);
    },
    (error) => {
      console.warn("Error subscribing to user sessions:", error);
    }
  );
}

/**
 * Listen to the current session document status.
 * If another device marks this session as 'ended', trigger callback so the client can log out cleanly.
 */
export function subscribeToCurrentSessionStatus(
  userId: string,
  currentSessionId: string,
  onEnded: () => void
): Unsubscribe {
  const sessionDocRef = doc(db, "users", userId, "sessions", currentSessionId);
  return onSnapshot(
    sessionDocRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<UserSessionDoc>;
        if (data.status === "ended") {
          onEnded();
        }
      }
    },
    (err) => {
      // Gracefully ignore offline/connection glitches for session termination watcher
      console.warn("Session status subscription notice:", err?.message || err);
    }
  );
}

/**
 * Terminate a single specific session (changes status to 'ended' in Firestore)
 */
export async function terminateSession(userId: string, targetSessionId: string): Promise<void> {
  if (!userId || !targetSessionId) return;
  const sessionDocRef = doc(db, "users", userId, "sessions", targetSessionId);
  const nowIso = new Date().toISOString();
  await updateDoc(sessionDocRef, {
    status: "ended",
    endedAt: nowIso,
    lastActivityAt: nowIso,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Terminate all sessions except the current one (changes their status to 'ended' in Firestore)
 */
export async function terminateAllOtherSessions(
  userId: string,
  currentSessionId: string
): Promise<void> {
  if (!userId) return;
  const sessionsCol = collection(db, "users", userId, "sessions");
  const snaps = await getDocs(sessionsCol);
  const nowIso = new Date().toISOString();

  const updates: Promise<void>[] = [];
  snaps.forEach((s) => {
    if (s.id !== currentSessionId) {
      const data = s.data() as Partial<UserSessionDoc>;
      if (data.status !== "ended") {
        updates.push(
          updateDoc(doc(db, "users", userId, "sessions", s.id), {
            status: "ended",
            endedAt: nowIso,
            lastActivityAt: nowIso,
            updatedAt: serverTimestamp(),
          })
        );
      }
    }
  });

  await Promise.all(updates);
}
