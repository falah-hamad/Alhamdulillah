import { getMessaging, getToken, onMessage, isSupported, Messaging } from "firebase/messaging";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { app, db, auth } from "./firebase";
import { AppNotification, NotificationCategory } from "../types";
import { linkFcmTokenToSession, getOrCreateCurrentSessionId } from "./sessionManager";
import { ensureNativeNotificationChannel, isNativeAndroid, registerNativePushToken, requestNativePushPermissionDetailed } from "./native";
import { sendAccountingPushNotificationServer } from "./cloudFunctions";

let messagingInstance: Messaging | null = null;
let messagingSupported: boolean | null = null;

function generateSecureId(prefix: string) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now()}_${suffix}`;
}

/**
 * Check if the current browser and context support Firebase Cloud Messaging (FCM)
 */
export async function isFCMSupported(): Promise<boolean> {
  if (messagingSupported !== null) return messagingSupported;
  if (isNativeAndroid()) {
    messagingSupported = true;
    return true;
  }
  try {
    messagingSupported = typeof window !== "undefined" && "Notification" in window && (await isSupported());
    return messagingSupported;
  } catch {
    messagingSupported = false;
    return false;
  }
}

/**
 * Get or initialize the Firebase Messaging instance safely
 */
export async function getFCMInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  const supported = await isFCMSupported();
  if (supported) {
    try {
      messagingInstance = getMessaging(app);
      return messagingInstance;
    } catch (e) {
      console.warn("Notice: Could not initialize Firebase Messaging in this context:", e);
      return null;
    }
  }
  return null;
}

/**
 * Register the dedicated Firebase Messaging Service Worker
 */
export async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    // Check if sw is already registered
    const existing = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    if (existing) {
      return existing;
    }
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    return registration;
  } catch (err) {
    console.warn("FCM Service Worker registration notice:", err);
    return null;
  }
}

async function syncWebTokenWithGrantedPermission(userId?: string): Promise<string | null> {
  const messaging = await getFCMInstance();
  const swRegistration = await registerMessagingServiceWorker();

  const vapidKey = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || undefined;
  const tokenOptions: { serviceWorkerRegistration?: ServiceWorkerRegistration; vapidKey?: string } = {};
  if (swRegistration) {
    tokenOptions.serviceWorkerRegistration = swRegistration;
  }
  if (vapidKey && typeof vapidKey === "string" && vapidKey.trim().length > 0) {
    tokenOptions.vapidKey = vapidKey.trim();
  }

  let currentToken: string | null = null;
  if (messaging) {
    currentToken = await getToken(messaging, tokenOptions).catch((err) => {
      console.info("FCM getToken notice (VAPID key / origin context):", err);
      return null;
    });
  }

  const targetUid = userId || auth.currentUser?.uid;
  if (currentToken && targetUid) {
    const tokenId = btoa(currentToken.slice(-36)).replace(/[/+=]/g, "_");
    const tokenRef = doc(db, "users", targetUid, "tokens", tokenId);

    const isAndroid = /android/i.test(navigator.userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const platformName = isAndroid ? "android" : isIOS ? "ios" : "web";

    await setDoc(tokenRef, {
      id: tokenId,
      userId: targetUid,
      token: currentToken,
      platform: platformName,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "web-browser",
      lastActiveAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    try {
      const currentSessionId = getOrCreateCurrentSessionId();
      await linkFcmTokenToSession(targetUid, currentSessionId, currentToken);
    } catch (sessErr) {
      console.warn("Could not link token to session:", sessErr);
    }
  }

  return currentToken;
}

export type NotificationPermissionResult = {
  status: "granted" | "denied" | "unsupported" | "dismissed";
  token?: string | null;
  message?: string;
};

/**
 * Request notification permissions and register device FCM token in Firestore.
 * Supports multiple devices per user without replacing other devices.
 */
export async function requestNotificationPermissionDetailed(userId?: string): Promise<NotificationPermissionResult> {
  if (isNativeAndroid()) {
    try {
      await ensureNativeNotificationChannel();
      const nativeResult = await requestNativePushPermissionDetailed();
      if (nativeResult.status !== "granted" || !nativeResult.token) {
        return {
          status: nativeResult.status,
          token: nativeResult.token || null,
          message: nativeResult.message,
        };
      }

      const targetUid = userId || auth.currentUser?.uid;
      if (targetUid) {
        const tokenId = btoa(nativeResult.token.slice(-36)).replace(/[/+=]/g, "_");
        const tokenRef = doc(db, "users", targetUid, "tokens", tokenId);

        await setDoc(tokenRef, {
          id: tokenId,
          userId: targetUid,
          token: nativeResult.token,
          platform: "android",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "android-native",
          lastActiveAt: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        }, { merge: true });

        try {
          const currentSessionId = getOrCreateCurrentSessionId();
          await linkFcmTokenToSession(targetUid, currentSessionId, nativeResult.token);
        } catch (sessErr) {
          console.warn("Could not link token to session:", sessErr);
        }
      }

      return {
        status: "granted",
        token: nativeResult.token,
        message: "تم تفعيل إشعارات Android الأصلية وتسجيل الجهاز بنجاح.",
      };
    } catch (err: any) {
      return {
        status: "unsupported",
        message: err?.message || "تعذر تفعيل إشعارات Android الأصلية.",
      };
    }
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return {
      status: "unsupported",
      message: "متصفحك الحالي أو بيئة التشغيل لا تدعم استقبال إشعارات الويب المباشرة.",
    };
  }

  try {
    let currentPermission = Notification.permission;
    if (currentPermission === "denied") {
      return {
        status: "denied",
        message: "تم حظر إشعارات المتصفح مسبقاً. يمكنك تفعيلها يدوياً من إعدادات المتصفح وقفل الموقع (Site Settings).",
      };
    }

    if (currentPermission === "default") {
      currentPermission = await Notification.requestPermission();
    }

    if (currentPermission !== "granted") {
      return {
        status: "denied",
        message: "لم يتم منح إذن الإشعارات. يمكنك السماح بالإشعارات في أي وقت من إعدادات المتصفح.",
      };
    }

    const currentToken = await syncWebTokenWithGrantedPermission(userId);

    return {
      status: "granted",
      token: currentToken,
      message: "تم تفعيل وتأكيد استلام الإشعارات بنجاح على هذا الجهاز!",
    };
  } catch (err: any) {
    console.warn("Notice: Notification permission / token process:", err);
    return {
      status: "unsupported",
      message: err?.message || "حدثت مشكلة غير متوقعة أثناء طلب صلاحية الإشعارات.",
    };
  }
}

export async function requestNotificationPermission(userId?: string): Promise<string | null> {
  const res = await requestNotificationPermissionDetailed(userId);
  return res.token || null;
}

export async function syncNotificationTokenIfPermitted(userId?: string): Promise<string | null> {
  if (isNativeAndroid()) {
    try {
      await ensureNativeNotificationChannel();
      const permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted") return null;
      const nativeResult = await registerNativePushToken();
      if (nativeResult.status !== "granted") return null;

      const token = nativeResult.token || null;
      const targetUid = userId || auth.currentUser?.uid;
      if (token && targetUid) {
        const tokenId = btoa(token.slice(-36)).replace(/[/+=]/g, "_");
        const tokenRef = doc(db, "users", targetUid, "tokens", tokenId);
        await setDoc(tokenRef, {
          id: tokenId,
          userId: targetUid,
          token,
          platform: "android",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "android-native",
          lastActiveAt: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      return token;
    } catch {
      return null;
    }
  }

  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return null;
  }

  return syncWebTokenWithGrantedPermission(userId);
}

export const registerDeviceToken = requestNotificationPermission;

/**
 * Display a local notification if granted.
 * On Native Android: Uses LocalNotifications to display real Android System Notifications
 * (heads-up banner, sound, vibration, notification shade) with the accounting_alerts channel.
 * On Web: Uses the existing Web Notification API / Service Worker showNotification.
 */
export function showLocalNotification(
  title: string,
  options?: NotificationOptions & {
    channelId?: string;
    sound?: string;
    extra?: Record<string, any>;
  }
) {
  if (isNativeAndroid()) {
    try {
      const tag = options?.tag;
      let numericId: number;
      if (tag) {
        let hash = 0;
        for (let i = 0; i < tag.length; i++) {
          hash = (hash << 5) - hash + tag.charCodeAt(i);
          hash |= 0;
        }
        numericId = Math.abs(hash) % 2147483647 || 1;
      } else {
        numericId = (Date.now() + Math.floor(Math.random() * 1000)) % 2147483647;
      }

      const extraData = (options as any)?.data || options?.extra || {};

      LocalNotifications.schedule({
        notifications: [
          {
            id: numericId,
            title: title || "دفتر الديون المحاسبي",
            body: options?.body || "إشعار محاسبي جديد",
            channelId: "accounting_alerts",
            sound: "default",
            smallIcon: "ic_stat_notification",
            largeIcon: "ic_launcher",
            iconColor: "#2563EB",
            extra: extraData,
            schedule: { at: new Date(Date.now() + 100) },
          },
        ],
      }).catch((err) => {
        console.warn("Could not schedule native local notification:", err);
      });
    } catch (err) {
      console.warn("Native LocalNotifications schedule error:", err);
    }
    return;
  }

  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    try {
      const defaultOptions: NotificationOptions = {
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        dir: "rtl",
        lang: "ar",
        ...options,
      };

      // Prefer Service Worker registration showNotification if available (standard for PWA & FCM)
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js").then((reg) => {
          if (reg && "showNotification" in reg) {
            reg.showNotification(title, defaultOptions);
          } else if (navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then((readyReg) => {
              readyReg.showNotification(title, defaultOptions);
            }).catch(() => {
              new Notification(title, defaultOptions);
            });
          } else {
            new Notification(title, defaultOptions);
          }
        }).catch(() => {
          new Notification(title, defaultOptions);
        });
      } else {
        new Notification(title, defaultOptions);
      }
    } catch (e) {
      console.warn("Notice: Local notification display:", e);
    }
  }
}

// Memory caches to prevent duplicate notifications across re-renders, strict mode, and rapid event firing
const processedNotificationIds = new Set<string>();
const processedOperationIds = new Set<string>();

/**
 * Dispatch an accounting notification:
 * 1. Saves persistently to user's Firestore notifications collection (Notification Center 🔔)
 * 2. Displays Push / Local notification on phone/browser
 * Prevents duplicates via unique deterministic IDs
 */
export async function dispatchAccountingNotification(
  userId: string,
  notification: {
    id?: string;
    title: string;
    body: string;
    category?: NotificationCategory;
    data?: Record<string, any>;
  }
): Promise<void> {
  if (!userId) return;

  const notifId = notification.id || generateSecureId("notif");

  // Strict deduplication: Do not re-dispatch the exact same notification ID in the current session
  if (processedNotificationIds.has(notifId)) {
    return;
  }
  processedNotificationIds.add(notifId);

  // 1. Persist in Firestore
  await saveInAppNotification(userId, { ...notification, id: notifId });

  // 2. Trigger browser/device push notification
  showLocalNotification(notification.title, {
    body: notification.body,
    tag: notifId,
    data: notification.data || {},
  });

  // 3. Broadcast to all active devices of the same user account via FCM
  try {
    const customerId = notification.data?.customerId || notification.data?.customer_id;
    sendAccountingPushNotificationServer({
      notificationId: notifId,
      title: notification.title,
      body: notification.body,
      customerId: customerId ? String(customerId) : undefined,
      category: notification.category,
      type: notification.data?.type,
      data: notification.data,
    }).catch((err) => {
      console.warn("FCM multi-device push notification notice:", err);
    });
  } catch (err) {
    console.warn("Notice: could not dispatch FCM multi-device push:", err);
  }
}

export interface PaidAmountNotificationParams {
  operationId: string;
  customerId: string;
  customerName: string;
  invoiceId: string;
  paidAmount: number;
  remainingAmount: number;
  currency?: string;
}

/**
 * Dispatch a single, deduplicated notification for a paid amount (سداد واصل) operation.
 * - Guarantees only ONE notification is created per operation
 * - Never fires on intermediate keystrokes, internal updates, or state re-renders
 * - Formats message exactly as requested:
 *   العنوان: سداد واصل جديد: [اسم العميل]
 *   التصنيف: الدفعات
 *   النص: تم تسجيل واصل بقيمة [المبلغ] [العملة]، المبلغ المتبقي: [المبلغ المتبقي] [العملة]
 */
export async function dispatchPaidAmountNotification(
  userId: string,
  params: PaidAmountNotificationParams
): Promise<boolean> {
  if (!userId) return false;
  if (!params.operationId) return false;
  if (!params.paidAmount || params.paidAmount <= 0) return false;

  // Strict operation-level deduplication: If this exact operation ID was already processed, ignore!
  if (processedOperationIds.has(params.operationId)) {
    return false;
  }
  processedOperationIds.add(params.operationId);

  const curr = params.currency || "د.ع";
  const formattedPaid = Number(params.paidAmount).toLocaleString();
  const remVal = Math.max(0, Number(params.remainingAmount || 0));
  const remainingText = remVal === 0
    ? "تم تسديد كامل الدين بنجاح"
    : `المبلغ المتبقي: ${remVal.toLocaleString()} ${curr}`;

  const title = `سداد واصل جديد: ${params.customerName || "العميل"}`;
  const body = `تم تسجيل واصل بقيمة ${formattedPaid} ${curr}، ${remainingText}`;
  const notifId = `notif_paid_${params.operationId}`;

  await dispatchAccountingNotification(userId, {
    id: notifId,
    title,
    body,
    category: "payments",
    data: {
      operationId: params.operationId,
      invoiceId: params.invoiceId,
      customerId: params.customerId,
      customerName: params.customerName,
      paidAmount: params.paidAmount,
      remainingAmount: remVal,
      type: "partial_or_full_payment",
    },
  });

  return true;
}

/**
 * Save an in-app notification document to user's Firestore notifications collection
 * This guarantees the notification remains in the Notification Center across devices
 */
export async function saveInAppNotification(
  userId: string,
  notification: {
    id?: string;
    title: string;
    body: string;
    category?: NotificationCategory;
    data?: Record<string, any>;
  }
): Promise<void> {
  if (!userId) return;
  try {
    const notifId = notification.id || generateSecureId("notif");
    const notifRef = doc(db, "users", userId, "notifications", notifId);
    const item: AppNotification = {
      id: notifId,
      userId,
      title: notification.title,
      body: notification.body,
      category: notification.category || "general",
      isRead: false,
      createdAt: new Date().toISOString(),
      data: notification.data || {},
    };
    await setDoc(notifRef, item, { merge: true });
  } catch (err) {
    console.warn("Failed to persist notification in Firestore:", err);
  }
}

/**
 * Subscribe to real-time synchronized in-app notifications in Firestore
 */
export function subscribeAppNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void
): () => void {
  if (!userId) {
    callback([]);
    return () => {};
  }
  const notifsCol = collection(db, "users", userId, "notifications");
  const q = query(notifsCol, orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: AppNotification[] = [];
      snapshot.forEach((d) => {
        items.push(d.data() as AppNotification);
      });
      callback(items);
    },
    (err) => {
      console.warn("Notifications subscription error:", err);
      // Fallback: don't crash the app
    }
  );
}

/**
 * Mark a specific notification as read in Firestore
 */
export async function markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
  if (!userId || !notificationId) return;
  try {
    const notifRef = doc(db, "users", userId, "notifications", notificationId);
    await setDoc(notifRef, { isRead: true }, { merge: true });
  } catch (e) {
    console.warn("Failed to mark notification as read:", e);
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string, notifications: AppNotification[]): Promise<void> {
  if (!userId || notifications.length === 0) return;
  try {
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;

    const batch = writeBatch(db);
    unread.forEach((n) => {
      const ref = doc(db, "users", userId, "notifications", n.id);
      batch.update(ref, { isRead: true });
    });
    await batch.commit();
  } catch (e) {
    console.warn("Failed to mark all notifications as read:", e);
  }
}

/**
 * Delete a specific notification
 */
export async function deleteNotification(userId: string, notificationId: string): Promise<void> {
  if (!userId || !notificationId) return;
  try {
    const notifRef = doc(db, "users", userId, "notifications", notificationId);
    await deleteDoc(notifRef);
  } catch (e) {
    console.warn("Failed to delete notification:", e);
  }
}

/**
 * Clear all notifications for a user
 */
export async function clearAllNotifications(userId: string, notifications: AppNotification[]): Promise<void> {
  if (!userId || notifications.length === 0) return;
  try {
    const batch = writeBatch(db);
    notifications.forEach((n) => {
      const ref = doc(db, "users", userId, "notifications", n.id);
      batch.delete(ref);
    });
    await batch.commit();
  } catch (e) {
    console.warn("Failed to clear notifications:", e);
  }
}

/**
 * Listen for foreground push notifications when the app is open and active.
 * - Saves a copy in Firestore Notification Center.
 * - Displays a real Android System Notification via LocalNotifications on Native Android.
 * - Displays Web Notification on browser.
 */
export async function setupForegroundNotificationListener(
  onNotificationReceived: (payload: any) => void
): Promise<(() => void) | null> {
  if (isNativeAndroid()) {
    try {
      const listener = await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
        onNotificationReceived(notification);
        const title = notification.title || "دفتر الديون المحاسبي";
        const body = notification.body || "إشعار جديد";

        // Prevent duplicate processing
        const notifId = notification.id || notification.data?.id || `push_${Date.now()}`;
        if (processedNotificationIds.has(notifId)) {
          return;
        }
        processedNotificationIds.add(notifId);

        // 1. Persist in Firestore Notification Center for the current user
        const currentUser = auth.currentUser;
        if (currentUser) {
          await saveInAppNotification(currentUser.uid, {
            id: notifId,
            title,
            body,
            category: (notification.data?.category as NotificationCategory) || "general",
            data: notification.data,
          });
        }

        // 2. Display Android System Notification via LocalNotifications in foreground
        showLocalNotification(title, {
          body,
          tag: notifId,
          data: notification.data,
        });
      });
      return () => void listener.remove();
    } catch (e) {
      console.warn("Notice: Native foreground notification listener:", e);
      return null;
    }
  }

  const messaging = await getFCMInstance();
  if (!messaging) return null;

  try {
    const unsubscribe = onMessage(messaging, (payload) => {
      onNotificationReceived(payload);
      const title = payload.notification?.title || payload.data?.title || "دفتر الديون المحاسبي";
      const body = payload.notification?.body || payload.data?.body || "إشعار جديد";

      const notifId = payload.data?.id || payload.data?.notificationId || `push_${Date.now()}`;
      if (processedNotificationIds.has(notifId)) {
        return;
      }
      processedNotificationIds.add(notifId);

      // 1. Show local native notification in browser/device
      showLocalNotification(title, {
        body,
        tag: notifId,
        data: payload.data,
      });

      // 2. Persist in Firestore Notification Center for the current user
      const currentUser = auth.currentUser;
      if (currentUser) {
        saveInAppNotification(currentUser.uid, {
          id: notifId,
          title,
          body,
          category: (payload.data?.category as NotificationCategory) || "general",
          data: payload.data,
        });
      }
    });
    return unsubscribe;
  } catch (e) {
    console.warn("Notice: Foreground notification listener:", e);
    return null;
  }
}

/**
 * Handle notification clicks (pushNotificationActionPerformed, localNotificationActionPerformed, and Web push click).
 * Extracts customerId / invoiceId and triggers navigation to the customer account.
 */
export function setupNotificationActionListener(
  onAction: (data: { customerId?: string; invoiceId?: string; type?: string; [key: string]: any }) => void
): () => void {
  const cleanups: (() => void)[] = [];

  if (isNativeAndroid()) {
    // 1. Tapping on a remote FCM push notification (when app opened from background/shade)
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      try {
        const notifData = action.notification.data || {};
        const customerId = notifData.customerId || notifData.customer_id;
        const invoiceId = notifData.invoiceId || notifData.invoice_id;
        onAction({ ...notifData, customerId, invoiceId });
      } catch (e) {
        console.warn("Push notification action handle error:", e);
      }
    }).then((handle) => {
      cleanups.push(() => void handle.remove());
    });

    // 2. Tapping on a foreground Local Notification
    LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      try {
        const extra = action.notification.extra || {};
        const customerId = extra.customerId || extra.customer_id;
        const invoiceId = extra.invoiceId || extra.invoice_id;
        onAction({ ...extra, customerId, invoiceId });
      } catch (e) {
        console.warn("Local notification action handle error:", e);
      }
    }).then((handle) => {
      cleanups.push(() => void handle.remove());
    });
  }

  // 3. Web Service Worker notificationclick message
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_CLICK") {
        const payloadData = event.data?.payload?.data || {};
        const customerId = payloadData.customerId || payloadData.customer_id || event.data?.payload?.customerId;
        const invoiceId = payloadData.invoiceId || payloadData.invoice_id;
        onAction({ ...payloadData, customerId, invoiceId });
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    cleanups.push(() => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    });
  }

  return () => {
    cleanups.forEach((c) => c());
  };
}
