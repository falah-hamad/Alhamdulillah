import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications, type Token } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

export const isNativeAndroid = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export async function takeNativePhoto() {
  if (!isNativeAndroid()) return null;
  const permissions = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
  if (permissions.camera !== 'granted') return null;
  return Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 90,
  });
}

export async function checkNativePermissionsStatus() {
  const result = {
    notifications: 'unsupported' as 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'unsupported',
    camera: 'unsupported' as 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'limited' | 'unsupported',
    photos: 'unsupported' as 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'limited' | 'unsupported',
    biometricAvailable: false,
  };

  if (!isNativeAndroid()) return result;

  try {
    const push = await PushNotifications.checkPermissions();
    result.notifications = push.receive;
  } catch {}

  try {
    const cameraPermissions = await Camera.checkPermissions();
    result.camera = cameraPermissions.camera;
    result.photos = cameraPermissions.photos;
  } catch {}

  try {
    const bio = await BiometricAuth.checkBiometry();
    result.biometricAvailable = Boolean(bio.isAvailable);
  } catch {}

  return result;
}

export async function requestNativeCameraAndPhotosPermission() {
  if (!isNativeAndroid()) {
    return { camera: 'unsupported', photos: 'unsupported' } as const;
  }
  return Camera.requestPermissions({ permissions: ['camera', 'photos'] });
}

export async function ensureNativeNotificationChannel() {
  if (!isNativeAndroid()) return;
  try {
    const existing = await PushNotifications.listChannels().catch(() => ({ channels: [] }));
    const channelFound = existing.channels?.some((c) => c.id === 'accounting_alerts');
    if (!channelFound) {
      await PushNotifications.createChannel({
        id: 'accounting_alerts',
        name: 'التنبيهات المحاسبية',
        description: 'تنبيهات الديون والدفعات والنسخ الاحتياطي',
        importance: 4, // High importance (heads-up / banner)
        visibility: 1, // Public on lockscreen
        vibration: true,
        lights: true,
        lightColor: '#2563EB',
      });
    }
  } catch {
    // Channel may already exist or cannot be modified
  }

  try {
    const existingLocal = await LocalNotifications.listChannels().catch(() => ({ channels: [] }));
    const channelLocalFound = existingLocal.channels?.some((c) => c.id === 'accounting_alerts');
    if (!channelLocalFound) {
      await LocalNotifications.createChannel({
        id: 'accounting_alerts',
        name: 'التنبيهات المحاسبية',
        description: 'تنبيهات الديون والدفعات والنسخ الاحتياطي',
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#2563EB',
      });
    }
  } catch {
    // Channel may already exist
  }
}

export async function openNativeAppSettings() {
  if (!isNativeAndroid()) return false;
  try {
    if (typeof (CapacitorApp as any).openSettings === 'function') {
      await (CapacitorApp as any).openSettings();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function pickNativeFiles(readData = false, limit = 10) {
  if (!isNativeAndroid()) return null;
  return FilePicker.pickFiles({ limit, readData });
}

export async function authenticateWithBiometrics(reason = 'تأكيد هويتك للوصول إلى التطبيق') {
  if (!isNativeAndroid()) return { success: false, unsupported: true };
  try {
    const check = await BiometricAuth.checkBiometry();
    if (!check.isAvailable) return { success: false, unsupported: true };
    await BiometricAuth.authenticate({ reason });
    return { success: true, unsupported: false };
  } catch {
    return { success: false, unsupported: false };
  }
}

export const setNativePreference = (key: string, value: string) => Preferences.set({ key, value });
export const getNativePreference = async (key: string) => (await Preferences.get({ key })).value;

export async function openExternalUrl(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
      return true;
    }
    if (typeof window !== 'undefined') {
      return Boolean(window.open(url, '_blank', 'noopener,noreferrer'));
    }
  } catch {
    return false;
  }
  return false;
}

export function saveNativeTextFile(path: string, content: string) {
  return Filesystem.writeFile({
    path,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

function base64ToBytes(base64Data: string) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64ToBlob(base64Data: string, mimeType: string) {
  const bytes = base64ToBytes(base64Data);
  return new Blob([bytes], { type: mimeType });
}

async function pickedFileToFile(
  pickedFile: { data?: string; path?: string; name?: string; mimeType?: string } | undefined,
  fallbackName: string,
) {
  if (!pickedFile) return null;

  const mimeType = pickedFile.mimeType || 'application/octet-stream';
  const fileName = pickedFile.name || fallbackName;

  if (pickedFile.data) {
    const blob = base64ToBlob(pickedFile.data, mimeType);
    return new File([blob], fileName, { type: mimeType });
  }

  if (pickedFile.path) {
    const response = await fetch(Capacitor.convertFileSrc(pickedFile.path));
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || mimeType });
  }

  return null;
}

export async function pickNativeImageFile(source: 'gallery' | 'camera' = 'gallery') {
  if (!isNativeAndroid()) return null;

  if (source === 'camera') {
    const photo = await takeNativePhoto();
    if (!photo?.webPath) return null;

    const response = await fetch(photo.webPath);
    const blob = await response.blob();
    const extension = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    return new File([blob], `camera_${Date.now()}.${extension}`, {
      type: blob.type || 'image/jpeg',
    });
  }

  const result = await FilePicker.pickImages({ limit: 1, readData: true });
  return pickedFileToFile(result.files?.[0], `gallery_${Date.now()}.jpg`);
}

export async function pickNativeJsonFile() {
  if (!isNativeAndroid()) return null;

  const result = await FilePicker.pickFiles({
    types: ['application/json', 'text/json'],
    limit: 1,
    readData: true,
  });
  const picked = result.files?.[0];
  if (!picked) return null;

  if (picked.data) {
    return {
      name: picked.name || `backup_${Date.now()}.json`,
      content: new TextDecoder().decode(base64ToBytes(picked.data)),
    };
  }

  if (picked.path) {
    const response = await fetch(Capacitor.convertFileSrc(picked.path));
    return {
      name: picked.name || `backup_${Date.now()}.json`,
      content: await response.text(),
    };
  }

  return null;
}

export async function saveNativeJsonFile(fileName: string, content: string) {
  if (!isNativeAndroid()) return null;
  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, '_');
  await saveNativeTextFile(`backups/${safeName}`, content);
  return `Documents/backups/${safeName}`;
}

type NativePushPermissionResult = {
  status: 'granted' | 'denied' | 'unsupported';
  token?: string | null;
  message?: string;
};

export async function registerNativePushToken(): Promise<NativePushPermissionResult> {
  if (!isNativeAndroid()) {
    return {
      status: 'unsupported',
      message: 'التسجيل الأصلي لإشعارات Android غير متاح في هذه البيئة.',
    };
  }

  return new Promise(async (resolve) => {
    const listeners: PluginListenerHandle[] = [];
    let settled = false;

    const finish = (result: NativePushPermissionResult) => {
      if (settled) return;
      settled = true;
      listeners.forEach((listener) => void listener.remove());
      resolve(result);
    };

    listeners.push(
      await PushNotifications.addListener('registration', ({ value }) => {
        finish({ status: 'granted', token: value });
      }),
    );
    listeners.push(
      await PushNotifications.addListener('registrationError', (error) => {
        finish({
          status: 'unsupported',
          message: error.error || 'تعذر تسجيل رمز FCM الأصلي للتطبيق.',
        });
      }),
    );

    await PushNotifications.register();
    window.setTimeout(() => {
      finish({
        status: 'unsupported',
        message: 'انتهت مهلة انتظار تسجيل إشعارات Android.',
      });
    }, 15000);
  });
}

export async function requestNativePushPermissionDetailed(): Promise<NativePushPermissionResult> {
  if (!isNativeAndroid()) {
    return {
      status: 'unsupported',
      message: 'التسجيل الأصلي لإشعارات Android غير متاح في هذه البيئة.',
    };
  }

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') {
    permission = await PushNotifications.requestPermissions();
  }

  if (permission.receive !== 'granted') {
    return {
      status: 'denied',
      message: 'لم يتم منح إذن إشعارات Android لهذا التطبيق.',
    };
  }
  return registerNativePushToken();
}

export async function registerNativePushNotifications(
  onToken: (token: Token) => void,
  onNotification?: (notification: unknown) => void,
): Promise<() => void> {
  if (!isNativeAndroid()) return () => undefined;

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== 'granted') return () => undefined;

  const listeners: PluginListenerHandle[] = [];
  listeners.push(await PushNotifications.addListener('registration', onToken));
  if (onNotification) {
    listeners.push(await PushNotifications.addListener('pushNotificationReceived', onNotification));
  }
  await PushNotifications.register();
  return () => listeners.forEach((listener) => void listener.remove());
}
