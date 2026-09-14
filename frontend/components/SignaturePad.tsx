"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type SignaturePadHandle = {
  toBlob: () => Promise<Blob | null>;
  toDataURL: () => string;
  fromDataURL: (dataUrl: string) => void;
  clear: () => void;
  isEmpty: () => boolean;
};

type Props = {
  label: string;
  className?: string;
};

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { label, className = "" },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const emptyRef = useRef(true);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const snapshot = emptyRef.current ? null : canvas.toDataURL();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = "#0F5C2E";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      if (snapshot) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = snapshot;
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const down = (event: PointerEvent) => {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      drawingRef.current = true;
      const p = point(event);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (event: PointerEvent) => {
      if (!drawingRef.current) return;
      event.preventDefault();
      const p = point(event);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      emptyRef.current = false;
    };
    const up = (event: PointerEvent) => {
      drawingRef.current = false;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, []);

  function clearPad() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    emptyRef.current = true;
  }

  useImperativeHandle(ref, () => ({
    toBlob() {
      const canvas = canvasRef.current;
      return new Promise((resolve) => {
        if (!canvas || emptyRef.current) {
          resolve(null);
          return;
        }
        canvas.toBlob((blob) => resolve(blob), "image/png");
      });
    },
    toDataURL() {
      const canvas = canvasRef.current;
      if (!canvas || emptyRef.current) return "";
      return canvas.toDataURL("image/png");
    },
    fromDataURL(dataUrl: string) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const rect = canvas.getBoundingClientRect();
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        emptyRef.current = false;
      };
      img.src = dataUrl;
    },
    clear: clearPad,
    isEmpty() {
      return emptyRef.current;
    },
  }));

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-semibold">{label}</label>
        <button type="button" className="text-xs font-semibold text-forest-800 underline" onClick={clearPad}>
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="h-36 w-full touch-none rounded-2xl border-2 border-forest-800/20 bg-white"
        aria-label={label}
      />
    </div>
  );
});
