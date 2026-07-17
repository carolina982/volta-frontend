import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";

export interface SignaturePadHandle {
  /** Devuelve la firma como dataURL PNG (o "" si está vacía). */
  getData: () => Promise<string>;
  clear: () => void;
}

interface Props {
  height?: number;
}

/** Pad de firma para web usando un <canvas> HTML nativo (sin dependencias). */
const SignaturePad = forwardRef<SignaturePadHandle, Props>(({ height = 200 }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const getCtx = () => canvasRef.current?.getContext("2d") || null;

  const configureCtx = () => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
  };

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const width = parent ? parent.clientWidth : 320;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = getCtx();
    if (ctx) ctx.scale(ratio, ratio);
    configureCtx();
    hasStroke.current = false;
  }, [height]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  const pos = (e: any) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const start = (e: any) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
  };

  const move = (e: any) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasStroke.current = true;
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
  };

  useImperativeHandle(ref, () => ({
    getData: async () => {
      const canvas = canvasRef.current;
      if (!canvas || !hasStroke.current) return "";
      return canvas.toDataURL("image/png");
    },
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasStroke.current = false;
    },
  }));

  return (
    <View style={[styles.box, { height }]}>
      <canvas
        ref={canvasRef as any}
        style={{ touchAction: "none", display: "block", cursor: "crosshair" }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
    </View>
  );
});

SignaturePad.displayName = "SignaturePad";

export default SignaturePad;

const styles = StyleSheet.create({
  box: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
});
