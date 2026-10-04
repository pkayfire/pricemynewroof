// Home-screen icon (PNG) from the brand mark.
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FFFFFF",
        }}
      >
        <svg width="140" height="99" viewBox="0 0 34 24">
          <path d="M2 22 L17 4 L32 22" fill="none" stroke="#22262A" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M21 22 H29 V14" fill="none" stroke="#2F6FD0" strokeWidth="1.5" />
        </svg>
      </div>
    ),
    size,
  );
}
