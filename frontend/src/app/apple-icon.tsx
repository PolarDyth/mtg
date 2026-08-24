import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const card: React.CSSProperties = {
    position: "absolute",
    left: 49,
    top: 19,
    width: 82,
    height: 114,
    borderRadius: 18,
  };
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          borderRadius: 40,
        }}
      >
        <div style={{ ...card, background: "#52525b", transform: "rotate(-16deg)", transformOrigin: "50% 100%" }} />
        <div style={{ ...card, background: "#71717a", transform: "rotate(16deg)", transformOrigin: "50% 100%" }} />
        <div style={{ ...card, background: "#10b981" }} />
      </div>
    ),
    size,
  );
}
