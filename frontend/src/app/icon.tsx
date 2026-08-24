import { ImageResponse } from "next/og";

export const size = { width: 48, height: 48 };
export const contentType = "image/png";

// Favicon tier: solid glyph cards (no strokes) so the fan reads at 16px.
export default function Icon() {
  const card: React.CSSProperties = {
    position: "absolute",
    left: 13,
    top: 5,
    width: 22,
    height: 30,
    borderRadius: 5,
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
          borderRadius: 12,
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
