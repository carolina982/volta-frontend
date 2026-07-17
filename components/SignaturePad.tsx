import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import SignatureScreen from "react-native-signature-canvas";

export interface SignaturePadHandle {
  /** Devuelve la firma como dataURL PNG (o "" si está vacía). */
  getData: () => Promise<string>;
  clear: () => void;
}

interface Props {
  height?: number;
  /** Se dispara al empezar/terminar un trazo (útil para bloquear el scroll del contenedor). */
  onBegin?: () => void;
  onEnd?: () => void;
}

const webStyle = `
  .m-signature-pad { box-shadow: none; border: none; margin: 0; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--body canvas { touch-action: none; }
  .m-signature-pad--footer { display: none; }
  body, html {
    width: 100%; height: 100%; margin: 0; padding: 0;
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
`;

/** Pad de firma para iOS/Android (usa react-native-signature-canvas sobre WebView). */
const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  ({ height = 200, onBegin, onEnd }, ref) => {
  const sigRef = useRef<any>(null);
  const resolverRef = useRef<((v: string) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    getData: () =>
      new Promise<string>((resolve) => {
        resolverRef.current = resolve;
        sigRef.current?.readSignature();
      }),
    clear: () => sigRef.current?.clearSignature(),
  }));

  return (
    <View style={[styles.box, { height }]}>
      <SignatureScreen
        ref={sigRef}
        onOK={(sig: string) => {
          resolverRef.current?.(sig || "");
          resolverRef.current = null;
        }}
        onEmpty={() => {
          resolverRef.current?.("");
          resolverRef.current = null;
        }}
        onBegin={onBegin}
        onEnd={onEnd}
        autoClear={false}
        imageType="image/png"
        webStyle={webStyle}
      />
    </View>
  );
  }
);

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
