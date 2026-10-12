import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0d0f" }}>
        <svg width="132" height="132" viewBox="0 0 32 32">
          <path d="M3 21.5 16 28l13-6.5L16 15z" fill="#22252c" stroke="#ecebe7" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M16 15V4.5L29 11v10.5z" fill="#a6c0f6" stroke="#ecebe7" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="9.5" cy="21.6" r="1.2" fill="#ecebe7" />
        </svg>
      </div>
    ),
    size,
  );
}
