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
  value?: string | null;
  hint?: string;
  onChange?: (value: string | null) => void;
};

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { label, className = "", value, hint = "Sign on the line with a finger or stylus", onChange },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const emptyRef = useRef(true);
  const drawingRef = useRef(false);
  const valueRef = useRef<string | null | undefined>(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  function configureContext(ctx: CanvasRenderingContext2D, dpr: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#173b29";
  }

  function paintValue(dataUrl: string | null | undefined) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!dataUrl) {
      emptyRef.current = true;
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      emptyRef.current = false;
    };
    img.src = dataUrl;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const snapshot = emptyRef.current ? valueRef.current || null : canvas.toDataURL("image/png");
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      configureContext(ctx, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (snapshot) paintValue(snapshot);
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
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Some embedded browsers do not support pointer capture.
      }
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
      if (!drawingRef.current) return;
      drawingRef.current = false;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      if (!emptyRef.current) {
        const dataUrl = canvas.toDataURL("image/png");
        valueRef.current = dataUrl;
        onChangeRef.current?.(dataUrl);
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

  useEffect(() => {
    if (value === undefined || value === valueRef.current) return;
    valueRef.current = value;
    paintValue(value);
  }, [value]);

  function clearPad() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    emptyRef.current = true;
    valueRef.current = null;
    onChangeRef.current?.(null);
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
      valueRef.current = dataUrl;
      paintValue(dataUrl);
    },
    clear: clearPad,
    isEmpty() {
      return emptyRef.current;
    },
  }));

  const describedBy = `${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-hint`;

  return (
    <div className={`sales-signature ${className}`}>
      <div className="sales-signature-head">
        <div>
          <label className="sales-signature-label">{label}</label>
          <p id={describedBy} className="sales-signature-hint">
            {valueRef.current ? "Signature captured — sign again to replace it" : hint}
          </p>
        </div>
        {!emptyRef.current && (
          <button type="button" className="sales-text-button" onClick={clearPad}>
            Clear
          </button>
        )}
      </div>
      <div className="sales-signature-surface">
        <canvas ref={canvasRef} aria-label={label} aria-describedby={describedBy} />
        <span className="sales-signature-line-caption" aria-hidden="true">Sign here</span>
      </div>
    </div>
  );
});
