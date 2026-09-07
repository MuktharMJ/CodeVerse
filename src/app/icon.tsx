import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// A small monochrome CODEVERSE monogram on the deep-space background.
// SVG path data renders crisply at all sizes; the deep-space background matches the app theme.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#060910",
          color: "#e9edf5",
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: -1.5,
          fontFamily: "Segoe UI, Helvetica Neue, Arial, sans-serif",
          borderRadius: 6,
        }}
      >
        C/V
      </div>
    ),
    { ...size },
  );
}