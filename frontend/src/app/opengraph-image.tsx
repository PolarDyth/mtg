import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Cardessa — a virtual card table";

export default function OpengraphImage() {
  const card: React.CSSProperties = {
    position: "absolute",
    left: 96,
    top: 8,
    width: 128,
    height: 178,
    borderRadius: 26,
  };
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          gap: 36,
        }}
      >
        <div
          style={{
            position: "relative",
            width: 320,
            height: 200,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div style={{ ...card, background: "#3f3f46", border: "4px solid #52525b", transform: "rotate(-16deg)", transformOrigin: "50% 100%" }} />
          <div style={{ ...card, background: "#3f3f46", border: "4px solid #52525b", transform: "rotate(16deg)", transformOrigin: "50% 100%" }} />
          <div style={{ ...card, background: "#10b981", border: "4px solid #34d399" }} />
        </div>
        <div
          style={{
            display: "flex",
            color: "#fafafa",
            fontSize: 104,
            fontWeight: 700,
            letterSpacing: -4,
          }}
        >
          Cardessa
        </div>
        <div style={{ display: "flex", color: "#a1a1aa", fontSize: 38 }}>
          a virtual card table — gather, shuffle, play
        </div>
      </div>
    ),
    size,
  );
}
