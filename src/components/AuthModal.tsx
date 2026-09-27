import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Mail, 
  User, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles, 
  BookOpen, 
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  ExternalLink,
  Laptop,
  KeyRound,
  MailCheck,
  Send,
  Key,
  Phone,
  Smartphone,
  ChevronDown,
  Check,
  Search,
  RotateCcw
} from 'lucide-react';
import { useAuth, ConfirmationResult } from '../contexts/AuthContext';
import { isNativeAndroid } from '../lib/native';
import { COUNTRY_CODES, formatInternationalPhoneNumber, CountryCode } from '../utils/countryCodes';

interface AuthModalProps {
  onSuccess?: () => void;
  onClose?: () => void;
  initialMode?: 'login' | 'register' | 'phone' | 'forgot' | 'resetPassword';
}

export default function AuthModal({ onSuccess, onClose, initialMode = 'login' }: AuthModalProps) {
  const {
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    loginWithFacebook,
    loginWithMicrosoft,
    loginWithDemoAccount,
    continueAsGuest,
    resetPassword,
    verifyResetCode,
    confirmNewPassword,
    sendPhoneOtp,
    verifyPhoneOtp,
    authError,
    setAuthError
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'phone' | 'forgot' | 'resetPassword'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // States for handling Phone Authentication (SMS OTP)
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input');
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(COUNTRY_CODES[0]); // Default Iraq +964
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [phoneNumberInput, setPhoneNumberInput] = useState('');
  const [phoneMerchantName, setPhoneMerchantName] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [phoneRegionBlocked, setPhoneRegionBlocked] = useState(false);
  const [phoneErrorDetails, setPhoneErrorDetails] = useState<{
    code: string;
    message: string;
    isRecaptcha?: boolean;
    explanation?: string;
  } | null>(null);

  // States for handling Password Reset / Change Error Details
  const [forgotErrorDetails, setForgotErrorDetails] = useState<{
    code: string;
    message: string;
    explanation?: string;
  } | null>(null);

  // Clean up recaptcha verifier on unmount
  useEffect(() => {
    return () => {
      if ((window as any).phoneRecaptchaVerifier) {
        try {
          (window as any).phoneRecaptchaVerifier.clear();
        } catch (e) {}
        (window as any).phoneRecaptchaVerifier = null;
      }
    };
  }, []);

  // States for handling incoming password reset link via oobCode
  const [resetCode, setResetCode] = useState<string>('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Check URL parameters for password reset link on mount
  useEffect(() => {
    try {
      const search = window.location.search || (window.location.hash.includes('?') ? window.location.hash.substring(window.location.hash.indexOf('?')) : '');
      const params = new URLSearchParams(search);
      const urlMode = params.get('mode');
      const oobCode = params.get('oobCode');
      if (urlMode === 'resetPassword' && oobCode) {
        setMode('resetPassword');
        setResetCode(oobCode);
        checkResetCode(oobCode);
      }
    } catch (e) {
      console.warn('Could not read auth query parameters:', e);
    }
  }, []);

  const checkResetCode = async (code: string) => {
    setVerifyingCode(true);
    setCodeError(null);
    try {
      const accountEmail = await verifyResetCode(code);
      setEmail(accountEmail);
      setCodeVerified(true);
    } catch (err: any) {
      setCodeError(err?.message || 'رابط إعادة تعيين كلمة المرور غير صالح أو انتهت صلاحيته.');
      setCodeVerified(false);
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleCloseOrGuest = () => {
    continueAsGuest();
    if (onClose) {
      onClose();
    }
  };

  const handleOpenInNewWindow = () => {
    try {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.warn('Failed to open new tab:', e);
    }
  };

  const handleDemoLogin = async () => {
    try {
      setSocialLoading('demo');
      setAuthError(null);
      await loginWithDemoAccount();
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (err: any) {
      // Fallback
      handleCloseOrGuest();
    } finally {
      setSocialLoading(null);
    }
  };

  // Submit handler for Login and Register
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setAuthError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setAuthError('يرجى إدخال البريد الإلكتروني.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setAuthError('صيغة البريد الإلكتروني غير صالحة. يرجى إدخال عنوان صحيح (مثال: name@example.com).');
      return;
    }

    if (!password) {
      setAuthError('يرجى إدخال كلمة المرور.');
      return;
    }

    if (mode === 'register') {
      if (!name.trim()) {
        setAuthError('يرجى كتابة اسمك أو اسم المتجر.');
        return;
      }
      if (password.length < 6) {
        setAuthError('كلمة المرور يجب أن لا تقل عن 6 خانات.');
        return;
      }
      if (password !== confirmPassword) {
        setAuthError('كلمة المرور وتأكيدها غير متطابقين.');
        return;
      }

      try {
        setSubmitting(true);
        await registerWithEmail(name, cleanEmail, password);
        onSuccess?.();
      } catch (err: any) {
        // Handled in context
      } finally {
        setSubmitting(false);
      }
    } else {
      try {
        setSubmitting(true);
        await loginWithEmail(cleanEmail, password);
        onSuccess?.();
      } catch (err: any) {
        // Handled in context
      } finally {
        setSubmitting(false);
      }
    }
  };

  // Handler for Forgot Password (sending reset link via Firebase Auth)
  const handleForgotSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSuccessMessage(null);
    setAuthError(null);
    setForgotErrorDetails(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      const msg = 'يرجى إدخال البريد الإلكتروني.';
      setAuthError(msg);
      setForgotErrorDetails({
        code: 'auth/missing-email',
        message: 'Missing email address.',
        explanation: msg,
      });
      return;
    }

    // Strict email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      const msg = 'صيغة البريد الإلكتروني غير صالحة. يرجى كتابة عنوان صحيح (مثال: name@example.com).';
      setAuthError(msg);
      setForgotErrorDetails({
        code: 'auth/invalid-email',
        message: 'Invalid email format.',
        explanation: msg,
      });
      return;
    }

    try {
      setSubmitting(true);
      await resetPassword(cleanEmail);
      setSuccessMessage(`تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني (${cleanEmail}) بنجاح.`);
    } catch (err: any) {
      console.error('Password reset error in modal:', err);
      const code = err?.code || 'auth/unknown-error';
      const rawMsg = err?.rawMessage || err?.message || 'فشل إرسال رابط إعادة تعيين كلمة المرور.';
      setForgotErrorDetails({
        code,
        message: rawMsg,
        explanation: err?.arabicExplanation,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handler for Confirming New Password after clicking reset link
  const handleConfirmNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setForgotErrorDetails(null);

    if (newPassword.length < 6) {
      const msg = 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف أو أرقام.';
      setAuthError(msg);
      setForgotErrorDetails({
        code: 'auth/weak-password',
        message: 'Password must be at least 6 characters.',
        explanation: msg,
      });
      return;
    }

    if (newPassword !== confirmNewPasswordInput) {
      const msg = 'كلمة المرور وتأكيدها غير متطابقين.';
      setAuthError(msg);
      setForgotErrorDetails({
        code: 'auth/password-mismatch',
        message: 'Passwords do not match.',
        explanation: msg,
      });
      return;
    }

    try {
      setSubmitting(true);
      await confirmNewPassword(resetCode, newPassword);
      setResetSuccess(true);
      // Clean query parameters from URL
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('mode');
        url.searchParams.delete('oobCode');
        url.searchParams.delete('apiKey');
        window.history.replaceState({}, document.title, url.pathname);
      } catch {}
    } catch (err: any) {
      console.error('Confirm new password error:', err);
      const code = err?.code || 'auth/unknown-error';
      const rawMsg = err?.rawMessage || err?.message || 'فشل تعيين كلمة المرور الجديدة.';
      setForgotErrorDetails({
        code,
        message: rawMsg,
        explanation: err?.arabicExplanation,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook' | 'microsoft') => {
    setAuthError(null);
    setSuccessMessage(null);
    setSocialLoading(provider);

    try {
      if (provider === 'google') await loginWithGoogle();
      if (provider === 'facebook') await loginWithFacebook();
      if (provider === 'microsoft') await loginWithMicrosoft();
      onSuccess?.();
    } catch (err: any) {
      // Handled in context
    } finally {
      setSocialLoading(null);
    }
  };

  // Phone Auth Countdown timer
  useEffect(() => {
    let timer: any;
    if (countdown > 0 && mode === 'phone' && phoneStep === 'otp') {
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [countdown, mode, phoneStep]);

  // Send real SMS OTP using Firebase Authentication
  const handleSendPhoneOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    setPhoneErrorDetails(null);
    setSuccessMessage(null);

    const cleanNumber = phoneNumberInput.trim();
    if (!cleanNumber) {
      const code = 'auth/missing-phone-number';
      const message = 'يرجى إدخال رقم الهاتف مصحوباً برمز الدولة.';
      setPhoneErrorDetails({ code, message });
      setAuthError(`${message}\nكود الخطأ (Code): ${code}`);
      return;
    }

    const fullPhone = formatInternationalPhoneNumber(selectedCountry.code, cleanNumber);
    if (fullPhone.length < 8) {
      const code = 'auth/invalid-phone-number';
      const message = 'رقم الهاتف غير صالح أو قصير جداً. يرجى التأكد من كتابة الرقم كاملاً بالصيغة الدولية (+964...).';
      setPhoneErrorDetails({ code, message });
      setAuthError(`${message}\nكود الخطأ (Code): ${code}`);
      return;
    }

    setSendingOtp(true);
    try {
      const result = await sendPhoneOtp(fullPhone, 'recaptcha-phone-container');
      setConfirmationResult(result);
      setPhoneStep('otp');
      setCountdown(60);
      setOtpCode('');
      setSuccessMessage(`تم إرسال رمز التحقق SMS بنجاح إلى الرقم ${fullPhone}`);
      setPhoneRegionBlocked(false);
      setPhoneErrorDetails(null);
    } catch (err: any) {
      console.error('Phone OTP error:', err);
      const code = err?.code || (err?.name && err?.name !== 'Error' ? err.name : 'auth/unknown-error');
      const rawMsg = err?.rawMessage || err?.message || String(err || '');
      const isRecaptcha = err?.isRecaptcha || code.includes('captcha') || rawMsg.toLowerCase().includes('recaptcha');
      
      setPhoneErrorDetails({
        code,
        message: rawMsg,
        isRecaptcha,
        explanation: err?.arabicExplanation,
      });

      const raw = rawMsg.toLowerCase();
      if (
        code === 'auth/operation-not-allowed' ||
        raw.includes('region enabled') ||
        raw.includes('sms unable to be sent') ||
        raw.includes('sms region policy')
      ) {
        setPhoneRegionBlocked(true);
      }
    } finally {
      setSendingOtp(false);
    }
  };

  // Resend OTP
  const handleResendPhoneOtp = async () => {
    if (countdown > 0 || sendingOtp) return;
    await handleSendPhoneOtp();
  };

  // Verify Phone OTP with Firebase confirmationResult.confirm
  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setPhoneErrorDetails(null);
    setSuccessMessage(null);

    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length < 6) {
      const code = 'auth/invalid-verification-code';
      const message = 'يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً.';
      setPhoneErrorDetails({ code, message });
      setAuthError(`${message}\nكود الخطأ (Code): ${code}`);
      return;
    }

    if (!confirmationResult) {
      const code = 'auth/session-expired';
      const message = 'انتهت صلاحية جلسة التحقق، يرجى إعادة إرسال الرمز.';
      setPhoneErrorDetails({ code, message });
      setAuthError(`${message}\nكود الخطأ (Code): ${code}`);
      return;
    }

    setVerifyingOtp(true);
    try {
      await verifyPhoneOtp(confirmationResult, cleanOtp, phoneMerchantName.trim() || undefined);
      onSuccess?.();
      onClose?.();
    } catch (err: any) {
      console.error('Verify phone error:', err);
      const code = err?.code || 'auth/unknown-error';
      const rawMsg = err?.rawMessage || err?.message || 'فشل التحقق من رمز OTP.';
      setPhoneErrorDetails({
        code,
        message: rawMsg,
        explanation: err?.arabicExplanation,
      });
    } finally {
      setVerifyingOtp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto">
      <div 
        id="auth-card" 
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-8 text-right font-sans"
        dir="rtl"
      >
        {/* Header Branding */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-6 text-white text-center relative">
          <button
            type="button"
            onClick={handleCloseOrGuest}
            className="absolute top-4 left-4 p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-full transition-colors cursor-pointer"
            title="إغلاق والمتابعة في الوضع المحلي"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center shadow-inner mb-3">
            {mode === 'forgot' ? (
              <KeyRound className="w-7 h-7 text-white" />
            ) : mode === 'resetPassword' ? (
              <Key className="w-7 h-7 text-white" />
            ) : mode === 'phone' ? (
              <Smartphone className="w-7 h-7 text-white" />
            ) : (
              <BookOpen className="w-7 h-7 text-white" />
            )}
          </div>
          <h2 className="text-xl font-black tracking-tight">دفتر الديون المحاسبي</h2>
          <p className="text-xs text-blue-100 mt-1">
            {mode === 'forgot' 
              ? 'استعادة وتعيين كلمة المرور عبر Firebase Authentication'
              : mode === 'resetPassword'
              ? 'إنشاء كلمة مرور جديدة للحساب'
              : mode === 'phone'
              ? 'المصادقة السريعة برقم الهاتف ورمز التحقق (Firebase SMS OTP)'
              : 'نظام محاسبي سحابي مع حفظ مشفر ومزامنة فورية بين جميع أجهزتك'}
          </p>
        </div>

        {/* Tab Selection or Sub-navigation */}
        {mode === 'forgot' ? (
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <KeyRound className="w-4 h-4 text-blue-600" />
              <span>استعادة كلمة المرور</span>
            </div>
            <button
              type="button"
              onClick={() => { setMode('login'); setAuthError(null); setSuccessMessage(null); }}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              <span>العودة لتسجيل الدخول</span>
            </button>
          </div>
        ) : mode === 'resetPassword' ? (
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Key className="w-4 h-4 text-blue-600" />
              <span>تعيين كلمة المرور الجديدة</span>
            </div>
            <button
              type="button"
              onClick={() => { setMode('login'); setAuthError(null); setSuccessMessage(null); }}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              <span>تسجيل الدخول</span>
            </button>
          </div>
        ) : (
          <div className="flex border-b border-slate-200 bg-slate-50/80 p-1 gap-1">
            <button
              type="button"
              id="tab-login"
              onClick={() => { setMode('login'); setAuthError(null); setPhoneErrorDetails(null); setSuccessMessage(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === 'login' 
                  ? 'bg-white text-blue-700 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              البريد الإلكتروني
            </button>
            <button
              type="button"
              id="tab-phone"
              onClick={() => { setMode('phone'); setPhoneStep('input'); setAuthError(null); setPhoneErrorDetails(null); setSuccessMessage(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                mode === 'phone' 
                  ? 'bg-white text-blue-700 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>رقم الهاتف (SMS)</span>
            </button>
            <button
              type="button"
              id="tab-register"
              onClick={() => { setMode('register'); setAuthError(null); setPhoneErrorDetails(null); setSuccessMessage(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === 'register' 
                  ? 'bg-white text-blue-700 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              إنشاء حساب
            </button>
          </div>
        )}

        <div className="p-6">
          {/* Status Notifications */}
          {authError && (
            <div id="auth-error-banner" className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              <div className="flex items-start gap-2.5 mb-1">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <div className="flex-1 min-w-0">
                  {mode === 'phone' && phoneErrorDetails ? (
                    <div className="space-y-2">
                      <div className="font-bold text-rose-950 text-xs">
                        فشل إرسال رمز التحقق SMS عبر Firebase:
                      </div>

                      {/* Firebase Error Code */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-rose-800">كود الخطأ (Error Code):</span>
                        <code className="px-2 py-0.5 bg-rose-200/90 text-rose-950 font-mono font-bold text-[11px] rounded border border-rose-300 dir-ltr select-all">
                          {phoneErrorDetails.code}
                        </code>
                      </div>

                      {/* Firebase Error Message */}
                      <div>
                        <span className="font-semibold text-rose-800 block mb-0.5">رسالة Firebase (Error Message):</span>
                        <div className="p-2 bg-white/90 border border-rose-200 rounded-lg font-mono text-[11px] text-rose-950 dir-ltr break-words leading-relaxed select-all">
                          {phoneErrorDetails.message}
                        </div>
                      </div>

                      {/* reCAPTCHA specific alert if applicable */}
                      {phoneErrorDetails.isRecaptcha && (
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] font-semibold">
                          ⚠️ خطأ متعلق بـ reCAPTCHA: حدثت مشكلة أثناء فحص الأمان reCAPTCHA. يرجى التأكد من اتصال الإنترنت أو تحديث الصفحة.
                        </div>
                      )}

                      {/* Arabic Explanation if available */}
                      {phoneErrorDetails.explanation && (
                        <div className="text-[11px] text-rose-800 leading-relaxed font-normal pt-1 border-t border-rose-200/60">
                          {phoneErrorDetails.explanation}
                        </div>
                      )}
                    </div>
                  ) : (mode === 'forgot' || mode === 'resetPassword') && forgotErrorDetails ? (
                    <div className="space-y-2">
                      <div className="font-bold text-rose-950 text-xs">
                        {mode === 'forgot'
                          ? 'فشل إرسال رسالة إعادة تعيين كلمة المرور عبر Firebase Authentication:'
                          : 'فشل حفظ وتحديث كلمة المرور الجديدة عبر Firebase Authentication:'}
                      </div>

                      {/* Firebase Error Code */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-rose-800">كود الخطأ (Error Code):</span>
                        <code className="px-2 py-0.5 bg-rose-200/90 text-rose-950 font-mono font-bold text-[11px] rounded border border-rose-300 dir-ltr select-all">
                          {forgotErrorDetails.code}
                        </code>
                      </div>

                      {/* Firebase Error Message */}
                      <div>
                        <span className="font-semibold text-rose-800 block mb-0.5">رسالة Firebase (Error Message):</span>
                        <div className="p-2 bg-white/90 border border-rose-200 rounded-lg font-mono text-[11px] text-rose-950 dir-ltr break-words leading-relaxed select-all">
                          {forgotErrorDetails.message}
                        </div>
                      </div>

                      {/* Arabic Explanation if available */}
                      {forgotErrorDetails.explanation && (
                        <div className="text-[11px] text-rose-800 leading-relaxed font-normal pt-1 border-t border-rose-200/60">
                          {forgotErrorDetails.explanation}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="leading-relaxed font-bold whitespace-pre-line break-words">{authError}</div>
                  )}
                </div>
              </div>

              {/* Actionable solutions for social login / popup cancellation */}
              {(mode === 'login' || mode === 'register') && (
                <div className="pt-2 border-t border-rose-200/80 flex flex-wrap gap-2 text-[11px] mt-2">
                  <button
                    type="button"
                    onClick={() => handleSocialLogin('google')}
                    className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>إعادة محاولة Google</span>
                  </button>
                  {!isNativeAndroid() && (
                    <button
                      type="button"
                      onClick={handleOpenInNewWindow}
                      className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                      title="فتح في نافذة مستقلة جديدة لتفادي قيود الإطار"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>فتح بنافذة مستقلة</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDemoLogin}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>دخول بحساب تجريبي</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseOrGuest}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <Laptop className="w-3 h-3" />
                    <span>المتابعة بالوضع المحلي</span>
                  </button>
                </div>
              )}

              {/* Actionable solutions for Phone Authentication */}
              {mode === 'phone' && (
                <div className="pt-2.5 border-t border-rose-200/80 space-y-2 mt-2">
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <button
                      type="button"
                      id="btn-phone-retry-send"
                      onClick={() => handleSendPhoneOtp()}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إعادة محاولة إرسال الرمز</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSocialLogin('google')}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <span>دخول بـ Google</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseOrGuest}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <Laptop className="w-3 h-3" />
                      <span>المتابعة بالوضع المحلي</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Actionable solutions for Forgot Password */}
              {mode === 'forgot' && (
                <div className="pt-2.5 border-t border-rose-200/80 space-y-2 mt-2">
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleForgotSubmit()}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>إعادة محاولة الإرسال</span>
                    </button>
                    {forgotErrorDetails?.code === 'auth/user-not-found' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('register');
                          setAuthError(null);
                          setForgotErrorDetails(null);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <span>إنشاء حساب بهذا البريد</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setAuthError(null);
                        setForgotErrorDetails(null);
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <ArrowRight className="w-3 h-3 rotate-180" />
                      <span>الرجوع لتسجيل الدخول</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* VIEW: FORGOT PASSWORD                                        */}
          {/* ============================================================ */}
          {mode === 'forgot' ? (
            <div>
              {successMessage ? (
                /* Step 4: Clear success message showing reset link sent */
                <div className="py-2 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
                    <MailCheck className="w-9 h-9" />
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">
                      تم إرسال رابط إعادة التعيين بنجاح!
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                      تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني المسجل:
                    </p>
                    <div className="mt-2 py-2 px-3 bg-emerald-50 border border-emerald-200 rounded-xl inline-block text-xs font-mono font-bold text-emerald-900 dir-ltr select-all">
                      {email}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed text-right space-y-2">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>الخطوات التالية لإتمام استعادة الحساب:</span>
                    </div>
                    <ol className="list-decimal list-inside text-[11px] text-slate-500 space-y-1 pr-1">
                      <li>افتح صندوق الوارد في بريدك الإلكتروني واضغط على الرابط المرسل.</li>
                      <li>قم بإنشاء كلمة مرور جديدة قوية تتكون من 6 خانات على الأقل.</li>
                      <li>بعد الحفظ بنجاح، يمكنك تسجيل الدخول مباشرة بكلمة المرور الجديدة.</li>
                    </ol>
                    <div className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-2">
                      💡 <strong>ملاحظة هامة:</strong> إذا لم تجد الرسالة في صندوق الوارد، يرجى تفقد مجلد <strong>الرسائل غير المرغوب فيها (Spam / Junk)</strong>.
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      id="btn-back-to-login"
                      onClick={() => {
                        setMode('login');
                        setAuthError(null);
                        setSuccessMessage(null);
                      }}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>الذهاب لتسجيل الدخول</span>
                      <ArrowRight className="w-4 h-4 rotate-180" />
                    </button>

                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleForgotSubmit}
                      className="w-full py-2 px-3 text-slate-500 hover:text-slate-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? 'جاري إعادة الإرسال...' : 'لم يصلك البريد بعد؟ إعادة إرسال الرابط'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 1 & 2 & 3: Enter email, validate and send reset link */
                <div>
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-slate-800">
                      استعادة وتعيين كلمة المرور
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      أدخل بريدك الإلكتروني المسجل في النظام وسنرسل لك رابطاً مباشراً عبر Firebase Authentication لإعادة تعيين كلمة المرور فوراً.
                    </p>
                  </div>

                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        البريد الإلكتروني المسجل
                      </label>
                      <div className="relative">
                        <input
                          id="input-auth-email"
                          type="email"
                          required
                          autoFocus
                          dir="ltr"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full text-xs text-right pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        سيتم إرسال رابط التحقق السحابي إلى هذا العنوان.
                      </p>
                    </div>

                    <button
                      type="submit"
                      id="btn-auth-submit"
                      disabled={submitting}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري إرسال الرابط عبر Firebase Authentication...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>إرسال رابط إعادة تعيين كلمة المرور</span>
                        </>
                      )}
                    </button>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setAuthError(null);
                          setSuccessMessage(null);
                        }}
                        className="text-xs font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                        <span>الرجوع إلى صفحة تسجيل الدخول</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : mode === 'resetPassword' ? (
            /* ============================================================ */
            /* VIEW: RESET PASSWORD (CONFIRMING NEW PASSWORD VIA LINK)      */
            /* ============================================================ */
            <div>
              {verifyingCode ? (
                <div className="py-8 text-center space-y-3">
                  <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-bold text-slate-700">جاري التحقق من صلاحية رابط إعادة التعيين من Firebase...</p>
                </div>
              ) : codeError ? (
                <div className="py-4 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="text-xs font-bold text-rose-800">{codeError}</div>
                  <p className="text-xs text-slate-500">انتهت صلاحية هذا الرابط أو تم استخدامه مسبقاً. يمكنك طلب رابط جديد بسهولة.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setCodeError(null);
                      setAuthError(null);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    طلب رابط جديد
                  </button>
                </div>
              ) : resetSuccess ? (
                <div className="py-4 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">
                      تم تغيير كلمة المرور بنجاح!
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                      تم تحديث كلمة المرور في Firebase Authentication بنجاح. يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.
                    </p>
                  </div>
                  <button
                    type="button"
                    id="btn-login-after-reset"
                    onClick={() => {
                      setMode('login');
                      setResetSuccess(false);
                      setPassword('');
                      setAuthError(null);
                    }}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>تسجيل الدخول الآن بكلمة المرور الجديدة</span>
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              ) : (
                /* Password reset form */
                <div>
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-slate-800">
                      إنشاء كلمة مرور جديدة
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      أدخل كلمة المرور الجديدة للحساب: <span className="font-bold text-slate-700 dir-ltr">{email}</span>
                    </p>
                  </div>

                  <form onSubmit={handleConfirmNewPasswordSubmit} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        كلمة المرور الجديدة
                      </label>
                      <div className="relative">
                        <input
                          id="input-reset-password"
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          dir="ltr"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full text-xs text-right pr-9 pl-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">6 أحرف أو أرقام على الأقل.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        تأكيد كلمة المرور الجديدة
                      </label>
                      <div className="relative">
                        <input
                          id="input-reset-confirm-password"
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          dir="ltr"
                          value={confirmNewPasswordInput}
                          onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                          placeholder="••••••••"
                          className="w-full text-xs text-right pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                      </div>
                    </div>

                    <button
                      type="submit"
                      id="btn-confirm-password-submit"
                      disabled={submitting}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري تحديث كلمة المرور في Firebase...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>حفظ كلمة المرور الجديدة</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : mode === 'phone' ? (
            /* ============================================================ */
            /* VIEW: PHONE AUTHENTICATION (SMS OTP)                         */
            /* ============================================================ */
            <div>
              {/* Invisible Recaptcha Container for Firebase Phone Auth */}
              <div id="recaptcha-phone-container" className="my-1"></div>

              {phoneStep === 'input' ? (
                /* STEP 1: Enter Phone Number */
                <div>
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        1
                      </div>
                      <h3 className="text-sm font-bold text-slate-800">
                        التسجيل أو الدخول برقم الهاتف
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed pr-8">
                      أدخل رقم هاتفك وسنرسل لك رسالة نصية SMS حقيقية تحتوي على رمز تحقق (OTP) عبر Firebase Authentication.
                    </p>
                  </div>

                  <form onSubmit={handleSendPhoneOtp} className="space-y-3.5">
                    {/* Merchant / User Name (Optional for quick profile setup) */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        اسم التاجر / اسم المحل <span className="text-[11px] text-slate-400 font-normal">(اختياري للمستخدمين الجدد)</span>
                      </label>
                      <div className="relative">
                        <input
                          id="input-phone-merchant-name"
                          type="text"
                          value={phoneMerchantName}
                          onChange={(e) => setPhoneMerchantName(e.target.value)}
                          placeholder="مثال: متجر الرافدين للمواد الغذائية"
                          className="w-full text-xs pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        <User className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                      </div>
                    </div>

                    {/* Phone Number with Country Code Dropdown */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        رقم الهاتف النقال <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative flex items-center rounded-xl border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                        {/* Country Code Button */}
                        <div className="relative">
                          <button
                            type="button"
                            id="btn-country-selector"
                            onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                            className="h-full py-2.5 px-3 flex items-center gap-1.5 border-l border-slate-200 hover:bg-slate-100/80 rounded-r-xl transition-colors cursor-pointer text-xs font-bold text-slate-800 shrink-0"
                            title="اختر الدولة"
                          >
                            <span className="text-base leading-none">{selectedCountry.flag}</span>
                            <span className="font-mono text-slate-700 dir-ltr">{selectedCountry.code}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showCountryDropdown ? 'rotate-180' : ''}`} />
                          </button>

                          {/* Country Code Dropdown Popover */}
                          {showCountryDropdown && (
                            <div className="absolute top-full right-0 mt-1.5 w-64 max-h-60 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                              <div className="p-2 border-b border-slate-100 bg-slate-50/80 sticky top-0">
                                <div className="relative">
                                  <input
                                    type="text"
                                    placeholder="ابحث بالاسم أو الرمز..."
                                    value={countrySearch}
                                    onChange={(e) => setCountrySearch(e.target.value)}
                                    className="w-full text-xs pr-7 pl-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    autoFocus
                                  />
                                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                                </div>
                              </div>
                              <div className="overflow-y-auto max-h-48 p-1 divide-y divide-slate-50">
                                {COUNTRY_CODES.filter(c => 
                                  c.country.includes(countrySearch) || 
                                  c.code.includes(countrySearch)
                                ).map((country) => (
                                  <button
                                    key={country.code + country.country}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCountry(country);
                                      setShowCountryDropdown(false);
                                      setCountrySearch('');
                                    }}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-right ${
                                      selectedCountry.code === country.code ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-base">{country.flag}</span>
                                      <span>{country.country}</span>
                                    </div>
                                    <span className="font-mono text-slate-500 text-[11px] dir-ltr">{country.code}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Phone Number Input */}
                        <div className="relative flex-1">
                          <input
                            id="input-auth-phone"
                            type="tel"
                            required
                            autoFocus
                            inputMode="tel"
                            dir="ltr"
                            value={phoneNumberInput}
                            onChange={(e) => setPhoneNumberInput(e.target.value)}
                            placeholder={selectedCountry.sample || "770 123 4567"}
                            className="w-full text-xs text-left px-3 py-2.5 bg-transparent border-none focus:outline-none font-mono tracking-wider font-semibold"
                          />
                        </div>
                      </div>

                      {/* International Format Preview */}
                      {phoneNumberInput.trim() && (
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-lg">
                          <span>الصيغة الدولية المعتمدة:</span>
                          <span className="font-mono font-bold text-emerald-700 dir-ltr">
                            {formatInternationalPhoneNumber(selectedCountry.code, phoneNumberInput)}
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      id="btn-send-phone-otp"
                      disabled={sendingOtp || !phoneNumberInput.trim()}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-2"
                    >
                      {sendingOtp ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري إرسال رسالة SMS عبر Firebase...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>إرسال رمز التحقق SMS (OTP)</span>
                        </>
                      )}
                    </button>
                  </form>

                  <div className="mt-4 pt-3 border-t border-slate-100 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setAuthError(null);
                        setSuccessMessage(null);
                      }}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                      <span>تسجيل الدخول بالبريد الإلكتروني وكلمة المرور</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* STEP 2: Enter OTP Code */
                <div>
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                        2
                      </div>
                      <h3 className="text-sm font-bold text-slate-800">
                        تأكيد رمز التحقق (OTP)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed pr-8">
                      تم إرسال رسالة SMS تحتوي على رمز مكون من 6 أرقام إلى هاتفك:
                    </p>
                  </div>

                  {/* Phone Number Display Card with Change option */}
                  <div className="mb-4 p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{selectedCountry.flag}</span>
                      <span className="font-mono text-xs font-bold text-emerald-950 dir-ltr">
                        {formatInternationalPhoneNumber(selectedCountry.code, phoneNumberInput)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneStep('input');
                        setOtpCode('');
                        setAuthError(null);
                      }}
                      className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                    >
                      تعديل الرقم
                    </button>
                  </div>

                  <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1 text-center">
                        أدخل رمز التحقق (6 أرقام)
                      </label>
                      <input
                        id="input-otp-code"
                        type="text"
                        required
                        autoFocus
                        inputMode="numeric"
                        maxLength={6}
                        pattern="[0-9]*"
                        value={otpCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setOtpCode(val);
                        }}
                        placeholder="••••••"
                        className="w-full text-center text-2xl font-mono tracking-widest font-black py-3 px-4 bg-slate-50 border-2 border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all text-slate-800"
                      />
                    </div>

                    <button
                      type="submit"
                      id="btn-verify-phone-otp"
                      disabled={verifyingOtp || otpCode.trim().length < 6}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {verifyingOtp ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري التحقق والمصادقة في Firebase...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>تحقق وتأكيد الدخول</span>
                        </>
                      )}
                    </button>

                    {/* Resend OTP / Countdown */}
                    <div className="pt-2 text-center text-xs text-slate-500">
                      {countdown > 0 ? (
                        <div className="inline-flex items-center gap-1.5 text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                          <span>إعادة إرسال الرمز متاحة خلال:</span>
                          <span className="font-mono font-bold text-slate-700 dir-ltr">
                            00:{countdown < 10 ? `0${countdown}` : countdown}
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          id="btn-resend-otp"
                          disabled={sendingOtp}
                          onClick={handleResendPhoneOtp}
                          className="font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-blue-50"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${sendingOtp ? 'animate-spin' : ''}`} />
                          <span>لم يصلك الرمز؟ إعادة إرسال رسالة SMS الآن</span>
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : (
            /* ============================================================ */
            /* VIEW: STANDARD LOGIN / REGISTER                              */
            /* ============================================================ */
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-800">
                  {mode === 'login' && 'تسجيل الدخول لحسابك السحابي'}
                  {mode === 'register' && 'إنشاء حساب جديد لدفتر المحل'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {mode === 'login' && 'أدخل بريدك الإلكتروني وكلمة المرور للوصول إلى بياناتك'}
                  {mode === 'register' && 'سجّل الآن لبدء تخزين ومزامنة سجل الديون في Cloud Firestore'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      اسم التاجر / اسم المحل
                    </label>
                    <div className="relative">
                      <input
                        id="input-auth-name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="مثال: مؤسسة الفلاح التجارية"
                        className="w-full text-xs pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                      <User className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    البريد الإلكتروني
                  </label>
                  <div className="relative">
                    <input
                      id="input-auth-email"
                      type="email"
                      required
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full text-xs text-right pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      كلمة المرور
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        id="btn-forgot-password"
                        onClick={() => { 
                          setMode('forgot'); 
                          setAuthError(null); 
                          setSuccessMessage(null); 
                        }}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                      >
                        نسيت كلمة المرور؟
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="input-auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      dir="ltr"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full text-xs text-right pr-9 pl-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      تأكيد كلمة المرور
                    </label>
                    <div className="relative">
                      <input
                        id="input-auth-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        dir="ltr"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full text-xs text-right pr-9 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  id="btn-auth-submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري المعالجة...</span>
                    </>
                  ) : (
                    <>
                      {mode === 'login' && 'تسجيل الدخول'}
                      {mode === 'register' && 'إنشاء الحساب ومزامنة الدفتر'}
                    </>
                  )}
                </button>
              </form>

              {/* Quick Phone Auth option in Login mode */}
              {mode === 'login' && (
                <div className="mt-3">
                  <button
                    type="button"
                    id="btn-switch-to-phone"
                    onClick={() => {
                      setMode('phone');
                      setPhoneStep('input');
                      setAuthError(null);
                      setSuccessMessage(null);
                    }}
                    className="w-full py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span>أو تسجيل الدخول السريع برقم الهاتف (SMS OTP)</span>
                  </button>
                </div>
              )}

              {/* Social Sign-ins Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-[11px] uppercase">
                  <span className="bg-white px-3 text-slate-400 font-semibold">
                    أو المتابعة عبر مزودي الهوية
                  </span>
                </div>
              </div>

              {/* Social buttons */}
              <div className="space-y-2">
                {/* Google */}
                <button
                  type="button"
                  id="btn-google-login"
                  disabled={socialLoading !== null}
                  onClick={() => handleSocialLogin('google')}
                  className="w-full py-2.2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>{socialLoading === 'google' ? 'جاري الاتصال بـ Google...' : 'المتابعة باستخدام Google'}</span>
                </button>

                {/* Microsoft */}
                <button
                  type="button"
                  id="btn-microsoft-login"
                  disabled={socialLoading !== null}
                  onClick={() => handleSocialLogin('microsoft')}
                  className="w-full py-2.2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 23 23">
                    <path fill="#f35325" d="M1 1h10v10H1z"/>
                    <path fill="#81bc06" d="M12 1h10v10H12z"/>
                    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                    <path fill="#ffba08" d="M12 12h10v10H12z"/>
                  </svg>
                  <span>{socialLoading === 'microsoft' ? 'جاري الاتصال بـ Microsoft...' : 'المتابعة باستخدام حساب Microsoft'}</span>
                </button>

                {/* Facebook */}
                <button
                  type="button"
                  id="btn-facebook-login"
                  disabled={socialLoading !== null}
                  onClick={() => handleSocialLogin('facebook')}
                  className="w-full py-2.2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <span>{socialLoading === 'facebook' ? 'جاري الاتصال بـ Facebook...' : 'المتابعة باستخدام Facebook'}</span>
                </button>
              </div>

              {/* Quick guest & demo options */}
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    id="btn-guest-mode"
                    onClick={handleCloseOrGuest}
                    className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                  >
                    <Laptop className="w-4 h-4 text-slate-500" />
                    <span>المتابعة في الوضع المحلي (بدون تسجيل دخول)</span>
                    <ArrowRight className="w-4 h-4 rotate-180 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    id="btn-quick-demo"
                    disabled={socialLoading !== null}
                    onClick={handleDemoLogin}
                    className="w-full py-2 px-3 hover:bg-blue-50 text-blue-600 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                    <span>دخول سريع بحساب تجريبي سحابي</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Security & Multi-Device Sync Notice */}
          <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>نظام تسجيل الدخول واستعادة كلمات المرور مشفر ومحمي عبر Firebase Authentication.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
