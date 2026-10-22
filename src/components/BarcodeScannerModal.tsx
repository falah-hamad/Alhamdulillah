import React, { useEffect, useRef, useState } from "react";
import { Camera, X, ScanBarcode } from "lucide-react";

type Props = { onDetected: (value: string) => void; onClose: () => void };

export default function BarcodeScannerModal({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lockedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState("");
  const [manualCode, setManualCode] = useState("");

  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let detector: any;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("المتصفح لا يتيح الكاميرا هنا. افتح الموقع عبر HTTPS أو أدخل رقم الباركود يدوياً.");
        return;
      }
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) {
        setError("ميزة قراءة الباركود غير مدعومة في هذا المتصفح. جرّب Chrome المحدّث أو أدخل الرقم يدوياً.");
        return;
      }
      try {
        const requestedFormats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];
        const supportedFormats = typeof Detector.getSupportedFormats === "function"
          ? await Detector.getSupportedFormats()
          : requestedFormats;
        const formats = requestedFormats.filter(format => supportedFormats.includes(format));
        if (!formats.length) {
          setError("هذا المتصفح لا يدعم صيغ الباركود المطلوبة. جرّب Chrome المحدّث أو أدخل الرقم يدوياً.");
          return;
        }
        detector = new Detector({ formats });
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        timer = window.setInterval(async () => {
          if (cancelled || lockedRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes.find((code: any) => typeof code.rawValue === "string" && code.rawValue.trim())?.rawValue?.trim();
            if (value && !lockedRef.current) {
              lockedRef.current = true;
              onDetectedRef.current(value);
            }
          } catch {
            // Keep scanning; a single blurry frame is normal.
          }
        }, 250);
      } catch (e: any) {
        setError(e?.name === "NotAllowedError"
          ? "إذن الكاميرا مرفوض. فعّل إذن الكاميرا للتطبيق أو للمتصفح ثم حاول مجدداً."
          : "تعذر تشغيل الكاميرا. تأكد من عدم استخدامها في تطبيق آخر، أو أدخل الباركود يدوياً.");
      }
    };

    void start();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

  const submitManual = (event: React.FormEvent) => {
    event.preventDefault();
    const code = manualCode.trim();
    if (code) onDetectedRef.current(code);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/75 p-3 flex items-center justify-center" dir="rtl">
      <section className="w-full max-w-lg rounded-2xl bg-white p-4 space-y-3 shadow-xl">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><ScanBarcode className="w-5 h-5 text-blue-600" /> البحث بالكاميرا</h2>
            <p className="text-xs text-slate-500 mt-1">وجّه الكاميرا نحو باركود المنتج وانتظر القراءة.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 border rounded-lg" aria-label="إغلاق ماسح الباركود"><X className="w-5 h-5" /></button>
        </header>
        <div className="relative overflow-hidden rounded-xl bg-slate-950 aspect-[4/3] flex items-center justify-center">
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          <div className="absolute inset-x-[12%] top-[38%] h-[24%] border-2 border-emerald-400 rounded-lg pointer-events-none shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
          {!error && <div className="absolute bottom-2 rounded-full bg-black/60 text-white text-xs px-3 py-1 flex items-center gap-2"><Camera className="w-3.5 h-3.5" /> جارٍ البحث عن الباركود…</div>}
          {error && <div className="absolute inset-0 bg-slate-900/90 text-white text-sm p-5 flex items-center justify-center text-center">{error}</div>}
        </div>
        {error && <p className="text-xs text-amber-700">{error}</p>}
        <form onSubmit={submitManual} className="flex gap-2">
          <input value={manualCode} onChange={e => setManualCode(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="أدخل رقم الباركود يدوياً" className="min-w-0 flex-1 border rounded-lg px-3 py-2 text-sm" />
          <button type="submit" disabled={!manualCode.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">بحث</button>
        </form>
        <p className="text-[11px] text-slate-500">تحتاج الكاميرا إلى إذن الوصول، وقد تحتاج إلى HTTPS في المتصفح.</p>
      </section>
    </div>
  );
}
