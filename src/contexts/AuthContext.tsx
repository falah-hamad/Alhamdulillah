import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
  updateProfile,
  signInWithPopup,
  updatePassword,
  linkWithPopup,
  unlink,
  deleteUser,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  facebookProvider,
  microsoftProvider,
} from '../lib/firebase';
import {
  getOrCreateCurrentSessionId,
  resetCurrentSessionId,
  initializeOrUpdateCurrentSession,
  subscribeToUserSessions,
  subscribeToCurrentSessionStatus,
  touchSessionActivity,
  terminateSession,
  terminateAllOtherSessions,
  UserSessionDoc,
} from '../lib/sessionManager';

export type { ConfirmationResult };

export interface UserExtendedProfile {
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  storeName?: string;
  jobTitle?: string;
  bio?: string;
  twoFactorEnabled?: boolean;
  emailNotifications?: boolean;
  dueDebtAlerts?: boolean;
  paymentAlerts?: boolean;
  backupAlerts?: boolean;
  soundAlerts?: boolean;
  updatedAt?: string;
}

export interface UserSessionInfo {
  id: string;
  sessionId?: string;
  userId?: string;
  deviceName: string;
  deviceType?: "mobile" | "tablet" | "desktop";
  platform?: string;
  browser: string;
  os: string;
  ip?: string;
  loginAt?: string;
  lastActivityAt?: string;
  lastActive: string;
  status?: "active" | "ended";
  fcmToken?: string | null;
  isCurrent: boolean;
  endedAt?: string;
}

interface AuthContextType {
  currentUser: User | null;
  isGuest: boolean;
  continueAsGuest: () => void;
  loginWithDemoAccount: () => Promise<void>;
  extendedProfile: UserExtendedProfile;
  sessionsList: UserSessionInfo[];
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithFacebook: () => Promise<void>;
  loginWithMicrosoft: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  verifyResetCode: (code: string) => Promise<string>;
  confirmNewPassword: (code: string, newPass: string) => Promise<void>;
  // Phone Authentication methods
  sendPhoneOtp: (phoneNumber: string, containerId?: string) => Promise<ConfirmationResult>;
  verifyPhoneOtp: (confirmationResult: ConfirmationResult, code: string, displayName?: string) => Promise<User>;
  logout: () => Promise<void>;
  authError: string | null;
  setAuthError: (err: string | null) => void;
  // Account management actions
  updateUserProfile: (data: Partial<UserExtendedProfile>) => Promise<void>;
  changePassword: (currentPass: string, newPass: string) => Promise<void>;
  sendEmailVerificationLink: () => Promise<void>;
  linkSocialAccount: (provider: 'google' | 'facebook' | 'microsoft') => Promise<void>;
  unlinkSocialAccount: (providerId: string) => Promise<void>;
  logoutSession: (sessionId: string) => Promise<void>;
  logoutOtherSessions: () => Promise<void>;
  deleteUserAccount: (confirmText: string, currentPassword?: string) => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function getArabicAuthErrorMessage(errorCode: string, rawMessage?: string): string {
  const lowerMsg = (rawMessage || '').toLowerCase();
  if (
    lowerMsg.includes('sms unable to be sent') ||
    lowerMsg.includes('region enabled') ||
    lowerMsg.includes('sms region policy')
  ) {
    return 'خدمة رسائل SMS لهذه الدولة مقيدة في إعدادات خوادم Firebase (SMS Region Policy). يمكنك مراجعة وتفعيل الدولة من Firebase Console (Authentication > Settings > SMS Region Policy).';
  }

  switch (errorCode) {
    case 'auth/user-not-found':
      return 'لا يوجد حساب مسجل بهذا البريد الإلكتروني في Firebase Authentication. يرجى التأكد من كتابة البريد الإلكتروني المسجل بشكل صحيح أو إنشاء حساب جديد.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'البريد الإلكتروني أو كلمة المرور أو رمز التحقق غير صحيح.';
    case 'auth/email-already-in-use':
      return 'هذا البريد الإلكتروني مسجل مسبقاً، يرجى تسجيل الدخول بدلاً من ذلك.';
    case 'auth/weak-password':
      return 'كلمة المرور ضعيفة، يجب أن تتكون من 6 أحرف أو أرقام على الأقل.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني غير صالحة. يرجى كتابة عنوان بريد صحيح (مثال: name@example.com).';
    case 'auth/invalid-phone-number':
      return 'رقم الهاتف غير صالح. يرجى التأكد من إدخال رقم صحيح بالصيغة الدولية (مثال: +9647XXXXXXXXX).';
    case 'auth/missing-phone-number':
      return 'يرجى إدخال رقم الهاتف مصحوباً برمز الدولة.';
    case 'auth/invalid-verification-code':
      return 'رمز التحقق (OTP) المدخل غير صحيح. يرجى التأكد من الأرقام وإعادة المحاولة.';
    case 'auth/code-expired':
      return 'انتهت صلاحية رمز التحقق (OTP). يرجى الضغط على زر "إعادة إرسال الرمز".';
    case 'auth/too-many-requests':
      return 'تم تجاوز الحد المسموح به من الطلبات مؤقتاً لحماية الحساب. يرجى الانتظار بضع دقائق ثم المحاولة مجدداً.';
    case 'auth/quota-exceeded':
      return 'تم استهلاك الحصة اليومية المتاحة في Firebase. يرجى المحاولة لاحقاً أو مراجعة الحصة في Firebase Console.';
    case 'auth/captcha-check-failed':
      return 'فشل فحص الأمان reCAPTCHA. يرجى التأكد من اتصالك بالإنترنت وتحديث الصفحة للمحاولة مجدداً.';
    case 'auth/network-request-failed':
      return 'تعذر الاتصال بخوادم Firebase. يرجى التحقق من اتصالك بالإنترنت.';
    case 'auth/billing-not-enabled':
      return 'خدمة الرسائل النصية القصيرة (SMS) تتطلب تفعيل خطة الحساب المناسبة في Firebase Console.';
    case 'auth/popup-closed-by-user':
      return 'تم إغلاق نافذة تسجيل الدخول المنبثقة قبل اكتمال العملية. يمكنك إعادة المحاولة، أو فتح التطبيق في نافذة جديدة، أو المتابعة بالوضع المحلي.';
    case 'auth/cancelled-popup-request':
      return 'تم إلغاء طلب تسجيل الدخول.';
    case 'auth/operation-not-allowed':
      if (lowerMsg.includes('sms') || lowerMsg.includes('phone')) {
        return 'طريقة تسجيل الدخول برقم الهاتف أو خدمة SMS غير مفعلة في Firebase Console (تأكد من تفعيل Phone في Authentication > Sign-in method، وتفعيل الدولة في Settings > SMS Region Policy).';
      }
      return 'طريقة تسجيل الدخول بالبريد وكلمة المرور (Email/Password) غير مفعلة في إعدادات Firebase Console. يرجى تفعيل موفر Email/Password من: Firebase Console > Authentication > Sign-in method.';
    case 'auth/popup-blocked':
      return 'تم حظر النافذة المنبثقة من قِبل المتصفح. يرجى السماح بالنوافذ المنبثقة أو فتح التطبيق في نافذة مستقلة جديدة.';
    case 'auth/requires-recent-login':
      return 'لحماية أمان حسابك، تتطلب هذه العملية إعادة تسجيل الدخول حديثاً (Recent Login) قبل المتابعة. يرجى تسجيل الخروج ثم تسجيل الدخول مجدداً.';
    case 'auth/unauthorized-continue-uri':
      return 'نطاق رابط المتابعة غير مدرج في النطاقات المصرح بها (Authorized Domains) في Firebase Console.';
    case 'auth/credential-already-in-use':
      return 'طريقة تسجيل الدخول هذه مرتبطة بالفعل بحساب مستخدم آخر.';
    case 'auth/no-such-provider':
      return 'مزود الحساب المحدد غير موجود.';
    case 'auth/expired-action-code':
      return 'انتهت صلاحية رابط إعادة تعيين كلمة المرور، يرجى طلب رابط جديد.';
    case 'auth/invalid-action-code':
      return 'رابط إعادة تعيين كلمة المرور غير صالح أو تم استخدامه مسبقاً.';
    default:
      return rawMessage || (errorCode ? `رمز الخطأ: ${errorCode}` : 'حدث خطأ أثناء العملية، يرجى المحاولة مرة أخرى.');
  }
}

function detectDeviceInfo() {
  const ua = navigator.userAgent;
  let browser = "Google Chrome";
  if (ua.includes("Firefox")) browser = "Mozilla Firefox";
  else if (ua.includes("Edg")) browser = "Microsoft Edge";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Apple Safari";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";

  let os = "Windows PC";
  if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Android")) os = "هاتف أندرويد";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "Apple iOS";
  else if (ua.includes("Linux")) os = "نظام Linux";

  return { browser, os };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [extendedProfile, setExtendedProfile] = useState<UserExtendedProfile>(() => {
    try {
      const saved = localStorage.getItem('acc_user_profile');
      return saved ? JSON.parse(saved) : {
        storeName: "مؤسسة الأعمال الحديثة",
        jobTitle: "المحاسب المعتمد",
        twoFactorEnabled: false,
        emailNotifications: true,
        dueDebtAlerts: true,
        paymentAlerts: true,
        backupAlerts: true,
        soundAlerts: true,
      };
    } catch {
      return {};
    }
  });

  const [sessionsList, setSessionsList] = useState<UserSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(() => {
    try {
      return localStorage.getItem('acc_guest_mode') === 'true';
    } catch {
      return false;
    }
  });

  const continueAsGuest = () => {
    setIsGuest(true);
    setAuthError(null);
    try {
      localStorage.setItem('acc_guest_mode', 'true');
    } catch {}
  };

  // Initialize and load user profile from Firestore
  useEffect(() => {
    let unsubSessions: (() => void) | null = null;
    let unsubStatus: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubSessions) {
        unsubSessions();
        unsubSessions = null;
      }
      if (unsubStatus) {
        unsubStatus();
        unsubStatus = null;
      }

      setCurrentUser(user);
      if (user) {
        // Load extended profile from Firestore
        try {
          const profileDocRef = doc(db, 'users', user.uid, 'profile', 'info');
          const docSnap = await getDoc(profileDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserExtendedProfile;
            setExtendedProfile((prev) => ({
              ...prev,
              ...data,
              displayName: user.displayName || data.displayName || prev.displayName,
              photoURL: user.photoURL || data.photoURL || prev.photoURL,
            }));
            localStorage.setItem('acc_user_profile', JSON.stringify({ ...data, displayName: user.displayName || data.displayName }));
          } else {
            // Initialize default profile
            const initial: UserExtendedProfile = {
              displayName: user.displayName || user.email?.split('@')[0] || "المحاسب المعتمد",
              photoURL: user.photoURL || "",
              storeName: "مؤسسة الأعمال الحديثة",
              jobTitle: "المحاسب المعتمد",
              phoneNumber: user.phoneNumber || "",
              bio: "مدير الحسابات المالية ودفتر الديون",
              twoFactorEnabled: false,
              emailNotifications: true,
              dueDebtAlerts: true,
              paymentAlerts: true,
              backupAlerts: true,
              soundAlerts: true,
              updatedAt: new Date().toISOString(),
            };
            setDoc(profileDocRef, initial).catch(console.error);
            setExtendedProfile(initial);
            localStorage.setItem('acc_user_profile', JSON.stringify(initial));
          }
        } catch (e) {
          console.warn("Could not read profile from Firestore:", e);
        }

        // Register or sync current device session
        const currentSessionId = getOrCreateCurrentSessionId();
        initializeOrUpdateCurrentSession(user.uid).catch((err) => {
          console.warn("Could not register session in Firestore:", err);
        });

        // Real-time synchronization of all user sessions
        unsubSessions = subscribeToUserSessions(user.uid, currentSessionId, (list) => {
          setSessionsList(list);
        });

        // Listen for remote termination from another device
        unsubStatus = subscribeToCurrentSessionStatus(user.uid, currentSessionId, async () => {
          if (unsubSessions) {
            unsubSessions();
            unsubSessions = null;
          }
          if (unsubStatus) {
            unsubStatus();
            unsubStatus = null;
          }
          try {
            await firebaseSignOut(auth);
          } catch {}
          resetCurrentSessionId();
          setCurrentUser(null);
          alert("تم تسجيل الخروج من هذه الجلسة بناءً على طلبك من جهاز آخر.");
        });
      } else {
        setSessionsList([]);
        try {
          const savedPhoneUser = localStorage.getItem('acc_simulated_phone_user');
          if (savedPhoneUser) {
            const parsed = JSON.parse(savedPhoneUser);
            if (parsed?.uid) {
              setCurrentUser(parsed);
              setIsGuest(false);
            }
          }
        } catch (e) {
          console.warn("Could not parse saved simulated phone user:", e);
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubSessions) unsubSessions();
      if (unsubStatus) unsubStatus();
    };
  }, []);

  // Throttled update of lastActivityAt on user interactions (no spam on re-renders)
  useEffect(() => {
    if (!currentUser) return;
    const currentSessionId = getOrCreateCurrentSessionId();

    const onUserActivity = () => {
      touchSessionActivity(currentUser.uid, currentSessionId);
    };

    window.addEventListener("focus", onUserActivity, { passive: true });
    window.addEventListener("click", onUserActivity, { passive: true });
    window.addEventListener("keydown", onUserActivity, { passive: true });
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        onUserActivity();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onUserActivity);
      window.removeEventListener("click", onUserActivity);
      window.removeEventListener("keydown", onUserActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [currentUser?.uid]);

  const loginWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      setIsGuest(false);
      try { localStorage.removeItem('acc_guest_mode'); } catch {}
    } catch (err: any) {
      const msg = getArabicAuthErrorMessage(err?.code || '');
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const registerWithEmail = async (name: string, email: string, pass: string) => {
    setAuthError(null);
    try {
      const res = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      if (name && res.user) {
        await updateProfile(res.user, { displayName: name.trim() });
      }
      setIsGuest(false);
      try { localStorage.removeItem('acc_guest_mode'); } catch {}
    } catch (err: any) {
      const msg = getArabicAuthErrorMessage(err?.code || '');
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setIsGuest(false);
      try { localStorage.removeItem('acc_guest_mode'); } catch {}
    } catch (err: any) {
      const msg = getArabicAuthErrorMessage(err?.code || '');
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const loginWithFacebook = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, facebookProvider);
      setIsGuest(false);
      try { localStorage.removeItem('acc_guest_mode'); } catch {}
    } catch (err: any) {
      const msg = getArabicAuthErrorMessage(err?.code || '');
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const loginWithMicrosoft = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, microsoftProvider);
      setIsGuest(false);
      try { localStorage.removeItem('acc_guest_mode'); } catch {}
    } catch (err: any) {
      const msg = getArabicAuthErrorMessage(err?.code || '');
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const loginWithDemoAccount = async () => {
    setAuthError(null);
    const demoEmail = 'accountant.demo@store.local';
    const demoPass = 'StoreDemo@2025';
    try {
      await signInWithEmailAndPassword(auth, demoEmail, demoPass);
      setIsGuest(false);
      try { localStorage.removeItem('acc_guest_mode'); } catch {}
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        try {
          const res = await createUserWithEmailAndPassword(auth, demoEmail, demoPass);
          if (res.user) {
            await updateProfile(res.user, { displayName: 'محاسب تجريبي' });
          }
          setIsGuest(false);
          try { localStorage.removeItem('acc_guest_mode'); } catch {}
        } catch {
          // If demo signup fails, continue as local guest
          continueAsGuest();
        }
      } else {
        continueAsGuest();
      }
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    setAuthError(null);
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      const msg = 'يرجى إدخال البريد الإلكتروني.';
      const err: any = new Error(msg);
      err.code = 'auth/missing-email';
      err.rawMessage = 'Missing email address.';
      err.arabicExplanation = msg;
      setAuthError(msg);
      throw err;
    }

    try {
      // Send real password reset email via official Firebase Authentication
      // We try with continue URL first (with handleCodeInApp: false so Firebase handles the web reset securely)
      try {
        const returnUrl = window.location.origin + window.location.pathname;
        await sendPasswordResetEmail(auth, cleanEmail, {
          url: returnUrl,
          handleCodeInApp: false,
        });
      } catch (actionErr: any) {
        // If continue URL fails for any domain authorization reasons, immediately fallback to standard reset email
        if (
          actionErr?.code === 'auth/unauthorized-continue-uri' ||
          actionErr?.code === 'auth/invalid-continue-uri' ||
          actionErr?.code === 'auth/missing-continue-uri' ||
          actionErr?.code === 'auth/argument-error' ||
          actionErr?.code === 'auth/internal-error'
        ) {
          console.warn('sendPasswordResetEmail fallback to default Firebase action handler:', actionErr?.code);
          await sendPasswordResetEmail(auth, cleanEmail);
        } else {
          throw actionErr;
        }
      }
    } catch (err: any) {
      console.error('Firebase sendPasswordResetEmail error:', err);
      const code = err?.code || 'auth/unknown-error';
      const rawMessage = err?.message || String(err || '');
      const arabicExplanation = getArabicAuthErrorMessage(code, rawMessage);

      const customErr: any = new Error(
        `[${code}] ${rawMessage}\n${arabicExplanation}`
      );
      customErr.code = code;
      customErr.rawMessage = rawMessage;
      customErr.arabicExplanation = arabicExplanation;
      setAuthError(customErr.message);
      throw customErr;
    }
  };

  const verifyResetCode = async (code: string): Promise<string> => {
    setAuthError(null);
    try {
      return await verifyPasswordResetCode(auth, code);
    } catch (err: any) {
      const codeErr = err?.code || 'auth/unknown-error';
      const rawMessage = err?.message || String(err || '');
      const explanation = getArabicAuthErrorMessage(codeErr, rawMessage);
      const customErr: any = new Error(`[${codeErr}] ${explanation}`);
      customErr.code = codeErr;
      customErr.rawMessage = rawMessage;
      customErr.arabicExplanation = explanation;
      setAuthError(customErr.message);
      throw customErr;
    }
  };

  const confirmNewPassword = async (code: string, newPass: string): Promise<void> => {
    setAuthError(null);
    try {
      await confirmPasswordReset(auth, code, newPass);
    } catch (err: any) {
      const codeErr = err?.code || 'auth/unknown-error';
      const rawMessage = err?.message || String(err || '');
      const explanation = getArabicAuthErrorMessage(codeErr, rawMessage);
      const customErr: any = new Error(`[${codeErr}] ${explanation}`);
      customErr.code = codeErr;
      customErr.rawMessage = rawMessage;
      customErr.arabicExplanation = explanation;
      setAuthError(customErr.message);
      throw customErr;
    }
  };

  // Send real SMS OTP using Firebase Authentication & RecaptchaVerifier
  const sendPhoneOtp = async (phoneNumber: string, containerId: string = 'recaptcha-phone-container'): Promise<ConfirmationResult> => {
    setAuthError(null);
    try {
      const trimmedPhone = phoneNumber.trim();
      if (!trimmedPhone) {
        throw { code: 'auth/missing-phone-number' };
      }

      // Check format (must start with +)
      if (!trimmedPhone.startsWith('+') || trimmedPhone.length < 8) {
        throw { code: 'auth/invalid-phone-number' };
      }

      // Clean up previous recaptcha verifier if present to avoid duplicate element errors
      if ((window as any).phoneRecaptchaVerifier) {
        try {
          (window as any).phoneRecaptchaVerifier.clear();
        } catch (e) {
          console.warn("Could not clear recaptcha verifier:", e);
        }
        (window as any).phoneRecaptchaVerifier = null;
      }

      // Ensure container element exists in DOM or create invisible fallback
      let containerEl = document.getElementById(containerId);
      if (!containerEl) {
        containerEl = document.createElement('div');
        containerEl.id = containerId;
        document.body.appendChild(containerEl);
      } else {
        containerEl.innerHTML = '';
      }

      const verifier = new RecaptchaVerifier(auth, containerEl, {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved - will proceed with signInWithPhoneNumber
        },
        'expired-callback': () => {
          console.warn('reCAPTCHA response expired');
        }
      });

      (window as any).phoneRecaptchaVerifier = verifier;

      // Invoke real Firebase Phone Auth SMS sending
      const confirmationResult = await signInWithPhoneNumber(auth, trimmedPhone, verifier);
      return confirmationResult;
    } catch (err: any) {
      console.error("Phone send OTP error:", err);
      if ((window as any).phoneRecaptchaVerifier) {
        try {
          (window as any).phoneRecaptchaVerifier.clear();
        } catch (e) {}
        (window as any).phoneRecaptchaVerifier = null;
      }
      const errorCode = err?.code || (err?.name && err?.name !== 'Error' ? err.name : 'auth/unknown-error');
      const rawMsg = err?.message || err?.rawMessage || String(err || '');
      const lowerRaw = rawMsg.toLowerCase();
      const isRecaptcha = errorCode === 'auth/captcha-check-failed' || lowerRaw.includes('recaptcha') || lowerRaw.includes('g-recaptcha');
      const arabicExplanation = getArabicAuthErrorMessage(errorCode, rawMsg);

      const lines: string[] = [
        `فشل إرسال رمز التحقق SMS عبر Firebase:`,
        `كود الخطأ (Code): ${errorCode}`,
        `رسالة Firebase: ${rawMsg}`
      ];
      if (isRecaptcha) {
        lines.push(`تنبيه reCAPTCHA: حدثت مشكلة أثناء فحص الأمان reCAPTCHA.`);
      }
      if (arabicExplanation && arabicExplanation !== rawMsg && !arabicExplanation.includes('حدث خطأ أثناء العملية')) {
        lines.push(`التوضيح: ${arabicExplanation}`);
      }

      const formattedError = lines.join('\n');
      setAuthError(formattedError);
      const customErr: any = new Error(formattedError);
      customErr.code = errorCode;
      customErr.rawMessage = rawMsg;
      customErr.isRecaptcha = isRecaptcha;
      customErr.arabicExplanation = arabicExplanation;
      throw customErr;
    }
  };

  // Verify Phone OTP Code with Firebase ConfirmationResult
  const verifyPhoneOtp = async (confirmationResult: ConfirmationResult, code: string, displayName?: string): Promise<User> => {
    setAuthError(null);
    try {
      const cleanCode = code.trim();
      if (!cleanCode || cleanCode.length < 6) {
        throw { code: 'auth/invalid-verification-code' };
      }

      // Real Firebase OTP verification via confirmationResult.confirm
      const userCredential = await confirmationResult.confirm(cleanCode);
      const user = userCredential.user;

      if (displayName && displayName.trim()) {
        try {
          await updateProfile(user, { displayName: displayName.trim() });
        } catch (e) {
          console.warn("Could not set displayName on phone user:", e);
        }
      }

      // Initialize/Merge user profile in Firestore
      try {
        const profileDocRef = doc(db, 'users', user.uid, 'profile', 'info');
        const docSnap = await getDoc(profileDocRef);
        const now = new Date().toISOString();

        if (!docSnap.exists()) {
          const initial: UserExtendedProfile = {
            displayName: displayName?.trim() || user.displayName || user.phoneNumber || "المحاسب المعتمد",
            phoneNumber: user.phoneNumber || "",
            storeName: "مؤسسة الأعمال",
            jobTitle: "المحاسب المعتمد",
            photoURL: "",
            bio: "مدير الحسابات المالية ودفتر الديون",
            twoFactorEnabled: true,
            emailNotifications: false,
            dueDebtAlerts: true,
            paymentAlerts: true,
            backupAlerts: true,
            soundAlerts: true,
            updatedAt: now,
          };
          await setDoc(profileDocRef, initial);
          setExtendedProfile(initial);
          localStorage.setItem('acc_user_profile', JSON.stringify(initial));
        } else {
          const updates: Partial<UserExtendedProfile> = {
            phoneNumber: user.phoneNumber || "",
            updatedAt: now,
          };
          if (displayName && displayName.trim()) {
            updates.displayName = displayName.trim();
          }
          await setDoc(profileDocRef, updates, { merge: true });
        }
      } catch (err) {
        console.warn("Could not write phone profile to Firestore:", err);
      }

      await reloadUser();
      return user;
    } catch (err: any) {
      console.error("Phone OTP verify error:", err);
      const errorCode = err?.code || 'auth/unknown-error';
      const rawMsg = err?.message || String(err || '');
      const arabicExplanation = getArabicAuthErrorMessage(errorCode, rawMsg);

      const lines: string[] = [
        `فشل التحقق من رمز التحقق (OTP):`,
        `كود الخطأ (Code): ${errorCode}`,
        `رسالة Firebase: ${rawMsg}`
      ];
      if (arabicExplanation && arabicExplanation !== rawMsg && !arabicExplanation.includes('حدث خطأ أثناء العملية')) {
        lines.push(`التوضيح: ${arabicExplanation}`);
      }

      const formattedError = lines.join('\n');
      setAuthError(formattedError);
      const customErr: any = new Error(formattedError);
      customErr.code = errorCode;
      customErr.rawMessage = rawMsg;
      customErr.arabicExplanation = arabicExplanation;
      throw customErr;
    }
  };

  const logout = async () => {
    setAuthError(null);
    if (auth.currentUser) {
      try {
        const currentSessionId = getOrCreateCurrentSessionId();
        await terminateSession(auth.currentUser.uid, currentSessionId);
      } catch (e) {
        console.warn("Could not mark session ended on logout:", e);
      }
    }
    try {
      await firebaseSignOut(auth);
    } catch (err: any) {
      console.error('Logout error:', err);
    }
    resetCurrentSessionId();
    // Clean local storage cache on logout
    localStorage.removeItem('acc_user_profile');
    localStorage.removeItem('acc_guest_mode');
    localStorage.removeItem('acc_simulated_phone_user');
    setCurrentUser(null);
    setIsGuest(false);
  };

  const reloadUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setCurrentUser({ ...auth.currentUser });
    }
  };

  // Update profile
  const updateUserProfile = async (data: Partial<UserExtendedProfile>) => {
    if (!currentUser) throw new Error("المستخدم غير مسجل");
    setAuthError(null);

    try {
      // 1. Update Firebase Auth user displayName & photoURL if real auth user exists
      if (auth.currentUser) {
        const profileUpdates: { displayName?: string; photoURL?: string } = {};
        if (data.displayName !== undefined) profileUpdates.displayName = data.displayName;
        if (data.photoURL !== undefined) profileUpdates.photoURL = data.photoURL;

        if (Object.keys(profileUpdates).length > 0) {
          await updateProfile(auth.currentUser, profileUpdates);
          setCurrentUser({ ...auth.currentUser });
        }
      } else if (currentUser && data.displayName) {
        setCurrentUser({ ...currentUser, displayName: data.displayName });
      }

      // 2. Update Firestore info if real user
      const merged = {
        ...extendedProfile,
        ...data,
        updatedAt: new Date().toISOString(),
      };

      if (auth.currentUser) {
        const docRef = doc(db, 'users', auth.currentUser.uid, 'profile', 'info');
        await setDoc(docRef, merged, { merge: true });
      }

      setExtendedProfile(merged);
      localStorage.setItem('acc_user_profile', JSON.stringify(merged));
    } catch (err: any) {
      const msg = getArabicAuthErrorMessage(err?.code || '') || err.message;
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  // Change password with verification of current password and Firebase rules
  const changePassword = async (currentPass: string, newPass: string): Promise<void> => {
    if (!auth.currentUser) {
      const err: any = new Error("المستخدم غير مسجل الدخول حالياً.");
      err.code = "auth/no-current-user";
      throw err;
    }
    setAuthError(null);

    const user = auth.currentUser;
    if (!user.email) {
      const err: any = new Error("لا يوجد بريد إلكتروني مسجل في هذا الحساب لتغيير كلمة المرور.");
      err.code = "auth/no-email";
      throw err;
    }

    if (!currentPass) {
      const msg = "يرجى إدخال كلمة المرور الحالية.";
      const err: any = new Error(msg);
      err.code = "auth/missing-current-password";
      err.rawMessage = "Current password is required.";
      err.arabicExplanation = msg;
      setAuthError(msg);
      throw err;
    }

    if (!newPass || newPass.length < 6) {
      const msg = "كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف أو أرقام.";
      const err: any = new Error(msg);
      err.code = "auth/weak-password";
      err.rawMessage = "Password must be at least 6 characters.";
      err.arabicExplanation = msg;
      setAuthError(msg);
      throw err;
    }

    // 1. Verify current password by re-authenticating with Firebase Authentication
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(user, credential);
    } catch (reauthErr: any) {
      console.error("Re-authentication error before password change:", reauthErr);
      const code = reauthErr?.code || 'auth/unknown-error';
      const rawMessage = reauthErr?.message || String(reauthErr || '');
      
      let explanation = getArabicAuthErrorMessage(code, rawMessage);
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        explanation = "كلمة المرور الحالية غير صحيحة، يرجى التأكد من كتابة كلمة المرور الحالية بدقة وإعادة المحاولة.";
      } else if (code === 'auth/requires-recent-login') {
        explanation = "طلب Firebase Authentication إعادة تسجيل الدخول (Recent Login) لتأكيد هويتك قبل تغيير كلمة المرور. يرجى تسجيل الخروج ثم تسجيل الدخول مجدداً.";
      }

      const customErr: any = new Error(`فشل تأكيد كلمة المرور الحالية: [${code}] ${explanation}`);
      customErr.code = code;
      customErr.rawMessage = rawMessage;
      customErr.arabicExplanation = explanation;
      setAuthError(customErr.message);
      throw customErr;
    }

    // 2. Update to new password in Firebase Authentication
    try {
      await updatePassword(user, newPass);
    } catch (err: any) {
      console.error("Firebase updatePassword error:", err);
      const code = err?.code || 'auth/unknown-error';
      const rawMessage = err?.message || String(err || '');
      let explanation = getArabicAuthErrorMessage(code, rawMessage);
      
      if (code === 'auth/requires-recent-login') {
        explanation = "طلب Firebase Authentication إعادة تسجيل الدخول (Recent Login) لدواعي الأمان قبل تغيير كلمة المرور. يرجى تسجيل الخروج ثم تسجيل الدخول مجدداً ثم تغيير كلمة المرور.";
      } else if (code === 'auth/weak-password') {
        explanation = "كلمة المرور الجديدة ضعيفة. يرجى اختيار كلمة مرور تتكون من 6 خانات أو أرقام على الأقل.";
      }

      const customErr: any = new Error(`فشل تحديث كلمة المرور: [${code}] ${explanation}`);
      customErr.code = code;
      customErr.rawMessage = rawMessage;
      customErr.arabicExplanation = explanation;
      setAuthError(customErr.message);
      throw customErr;
    }
  };

  // Send Email verification
  const sendEmailVerificationLink = async () => {
    if (!auth.currentUser) throw new Error("المستخدم غير مسجل");
    setAuthError(null);
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err: any) {
      const msg = getArabicAuthErrorMessage(err?.code || '');
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  // Link Social Account
  const linkSocialAccount = async (providerName: 'google' | 'facebook' | 'microsoft') => {
    if (!auth.currentUser) throw new Error("المستخدم غير مسجل");
    setAuthError(null);

    try {
      let provider;
      if (providerName === 'google') provider = googleProvider;
      else if (providerName === 'facebook') provider = facebookProvider;
      else provider = microsoftProvider;

      await linkWithPopup(auth.currentUser, provider);
      await reloadUser();
    } catch (err: any) {
      const msg = getArabicAuthErrorMessage(err?.code || '');
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  // Unlink Social Account
  const unlinkSocialAccount = async (providerId: string) => {
    if (!auth.currentUser) throw new Error("المستخدم غير مسجل");
    setAuthError(null);

    // Guard: Prevent unlinking if it's the only provider and no password exists
    if (auth.currentUser.providerData.length <= 1) {
      const err = "لا يمكن إلغاء ربط طريقة تسجيل الدخول الوحيدة لحسابك حتى لا تفقد إمكانية الوصول إليه.";
      setAuthError(err);
      throw new Error(err);
    }

    try {
      await unlink(auth.currentUser, providerId);
      await reloadUser();
    } catch (err: any) {
      const msg = getArabicAuthErrorMessage(err?.code || '');
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  // Logout a specific session
  const logoutSession = async (targetSessionId: string) => {
    if (!auth.currentUser) return;
    const currentSessionId = getOrCreateCurrentSessionId();
    if (targetSessionId === currentSessionId) {
      await logout();
      return;
    }
    await terminateSession(auth.currentUser.uid, targetSessionId);
  };

  // Logout other sessions
  const logoutOtherSessions = async () => {
    if (!auth.currentUser) return;
    const currentSessionId = getOrCreateCurrentSessionId();
    await terminateAllOtherSessions(auth.currentUser.uid, currentSessionId);
  };

  // Delete User Account Completely
  const deleteUserAccount = async (confirmText: string, currentPassword?: string) => {
    if (!auth.currentUser) throw new Error("المستخدم غير مسجل");
    setAuthError(null);

    const user = auth.currentUser;
    const expectedConfirm = user.email || "حذف حسابي";

    if (confirmText.trim() !== expectedConfirm && confirmText.trim() !== "حذف حسابي") {
      throw new Error(`يرجى كتابة "${expectedConfirm}" أو "حذف حسابي" بدقة للتأكيد.`);
    }

    // Reauthenticate if user provided a password
    const isEmailPasswordUser = user.providerData.some((p) => p.providerId === "password");
    if (isEmailPasswordUser && currentPassword && user.email) {
      try {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
      } catch (reauthErr: any) {
        const code = reauthErr?.code || '';
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          const msg = "كلمة المرور الحالية غير صحيحة للتأكيد.";
          setAuthError(msg);
          throw new Error(msg);
        }
        const msg = getArabicAuthErrorMessage(code);
        setAuthError(msg);
        throw new Error(msg);
      }
    }

    try {
      // 1. Delete all Firestore user documents in subcollections
      const subcollections = [
        'folders',
        'customers',
        'products',
        'invoices',
        'payments',
        'changeLogs',
        'settings',
        'profile',
        'sessions',
        'backups',
      ];

      for (const subcol of subcollections) {
        try {
          const colRef = collection(db, 'users', user.uid, subcol);
          const snaps = await getDocs(colRef);
          if (!snaps.empty) {
            const batch = writeBatch(db);
            snaps.docs.forEach((d) => batch.delete(d.ref));
            await batch.commit();
          }
        } catch (e) {
          console.warn(`Error deleting subcollection ${subcol}:`, e);
        }
      }

      // 2. Delete root user doc if any
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await deleteDoc(userDocRef);
      } catch (e) {
        console.warn("Error deleting user doc:", e);
      }

      // 3. Clear all local storage accounting keys for this user
      const entities = ['folders', 'customers', 'products', 'invoices', 'payments', 'store_settings', 'user_profile', 'change_logs', 'settings'];
      entities.forEach((ent) => localStorage.removeItem(`acc_u_${user.uid}_${ent}`));
      const legacyKeys = [
        'acc_customer_folders',
        'acc_customers',
        'acc_products',
        'acc_invoices',
        'acc_payments',
        'acc_store_settings',
        'acc_user_profile',
        'acc_change_logs',
        'acc_settings',
      ];
      legacyKeys.forEach((k) => localStorage.removeItem(k));

      // 4. Delete user from Firebase Auth
      await deleteUser(user);
      setCurrentUser(null);
      setIsGuest(false);
    } catch (err: any) {
      if (err?.code === 'auth/requires-recent-login') {
        const msg = isEmailPasswordUser
          ? "لحماية أمان حسابك، يرجى كتابة كلمة المرور الحالية لتأكيد الهوية وحذف الحساب."
          : "لحماية أمان حسابك، يرجى تسجيل الدخول مجدداً ثم إعادة محاولة حذف الحساب.";
        setAuthError(msg);
        throw new Error(msg);
      }
      const msg = getArabicAuthErrorMessage(err?.code || '') || err.message;
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isGuest,
        continueAsGuest,
        loginWithDemoAccount,
        extendedProfile,
        sessionsList,
        loading,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        loginWithFacebook,
        loginWithMicrosoft,
        resetPassword,
        verifyResetCode,
        confirmNewPassword,
        sendPhoneOtp,
        verifyPhoneOtp,
        logout,
        authError,
        setAuthError,
        updateUserProfile,
        changePassword,
        sendEmailVerificationLink,
        linkSocialAccount,
        unlinkSocialAccount,
        logoutSession,
        logoutOtherSessions,
        deleteUserAccount,
        reloadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
