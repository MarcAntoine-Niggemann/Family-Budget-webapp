import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Upload, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import jsQR from 'jsqr';
import { validateFirebaseConfigFields } from '../services/firebaseSyncService';

interface QrCodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanned: (data: string) => void;
}

export const QrCodeScannerModal: React.FC<QrCodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanned
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const validateAndAcceptPayload = (rawPayload: string): boolean => {
    try {
      const parsed = JSON.parse(rawPayload);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setErrorMsg('Invalid Vault QR Code: expected a JSON configuration object.');
        return false;
      }
      const check = validateFirebaseConfigFields({
        projectId: typeof parsed.projectId === 'string' ? parsed.projectId : '',
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        applicationId: typeof parsed.applicationId === 'string' ? parsed.applicationId : ''
      });
      if (!check.valid) {
        setErrorMsg(check.error || 'Invalid Firebase BYOB configuration in QR payload.');
        return false;
      }
      setErrorMsg(null);
      onScanned(rawPayload);
      handleClose();
      return true;
    } catch {
      setErrorMsg('Invalid Vault QR Code: payload is not valid JSON.');
      return false;
    }
  };

  useEffect(() => {
    let animId: number;

    const startCamera = async () => {
      try {
        setErrorMsg(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          setCameraActive(true);
          scanFrame();
        }
      } catch (err: any) {
        console.warn('Camera access denied or unavailable:', err);
        setErrorMsg('Camera access unavailable. You can upload a QR image or paste code below.');
      }
    };

    const scanFrame = () => {
      if (!videoRef.current || !canvasRef.current) return;
      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });

          if (code && code.data) {
            if (validateAndAcceptPayload(code.data)) {
              return;
            }
          }
        }
      }
      animId = requestAnimationFrame(scanFrame);
    };

    if (isOpen) {
      startCamera();
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    setCameraActive(false);
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            validateAndAcceptPayload(code.data);
          } else {
            setErrorMsg('No QR code detected in this image. Try another photo or paste the code.');
          }
        }
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = () => {
    if (pasteText.trim()) {
      validateAndAcceptPayload(pasteText.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Scan Family Vault QR Code</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Join an existing Family Budget Vault</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Viewfinder */}
        <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
          <video ref={videoRef} className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />

          {/* Target Scanning Crosshair overlay */}
          <div className="absolute inset-8 border-2 border-teal-400/60 rounded-xl pointer-events-none animate-pulse flex items-center justify-center">
            <span className="text-[11px] bg-slate-900/80 px-2 py-0.5 rounded text-teal-300 font-mono">
              Align QR Code
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Alternative: Image Upload or Text Paste */}
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800/80">
          <label className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition">
            <Upload className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>Upload QR Code Image file</span>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          </label>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Or paste Vault QR JSON / code..."
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={handleManualSubmit}
              disabled={!pasteText.trim()}
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 text-xs font-bold disabled:opacity-40 transition"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
