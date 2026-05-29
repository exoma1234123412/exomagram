import { ImageResponse } from "next/og";

export const alt = "Exomagram — Vigilancia Total del Trabajo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
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
          backgroundColor: "#060810",
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(61,216,224,0.04) 59px, rgba(61,216,224,0.04) 60px), repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(61,216,224,0.04) 59px, rgba(61,216,224,0.04) 60px)",
          position: "relative",
        }}
      >
        {/* Top-left corner bracket */}
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 40,
            width: 60,
            height: 60,
            borderTop: "3px solid #3dd8e0",
            borderLeft: "3px solid #3dd8e0",
            display: "flex",
          }}
        />
        {/* Bottom-right corner bracket */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            right: 40,
            width: 60,
            height: 60,
            borderBottom: "3px solid #3dd8e0",
            borderRight: "3px solid #3dd8e0",
            display: "flex",
          }}
        />

        {/* Eye shape */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            width: 180,
            height: 180,
            marginBottom: 32,
          }}
        >
          {/* Outer eye shape - top lid */}
          <div
            style={{
              position: "absolute",
              width: 160,
              height: 80,
              borderTop: "4px solid #3dd8e0",
              borderLeft: "4px solid #3dd8e0",
              borderRight: "4px solid #3dd8e0",
              borderRadius: "80px 80px 0 0",
              top: 20,
              display: "flex",
            }}
          />
          {/* Outer eye shape - bottom lid */}
          <div
            style={{
              position: "absolute",
              width: 160,
              height: 80,
              borderBottom: "4px solid #3dd8e0",
              borderLeft: "4px solid #3dd8e0",
              borderRight: "4px solid #3dd8e0",
              borderRadius: "0 0 80px 80px",
              bottom: 20,
              display: "flex",
            }}
          />
          {/* Outer iris ring */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              border: "4px solid #3dd8e0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Inner pupil */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: "#3dd8e0",
                display: "flex",
              }}
            />
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "0.2em",
            fontFamily: "monospace",
            display: "flex",
          }}
        >
          EXOMAGRAM
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 24,
            color: "#3dd8e0",
            marginTop: 16,
            display: "flex",
          }}
        >
          Cada hora queda registrada.
        </div>

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            right: 120,
            fontSize: 16,
            color: "#6b7280",
            display: "flex",
          }}
        >
          exomagram.com
        </div>
      </div>
    ),
    { ...size }
  );
}
