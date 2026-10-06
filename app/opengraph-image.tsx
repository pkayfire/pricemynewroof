// Social preview image: the brand mark and "Price My New Roof" in Barlow Semi Condensed 700.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/BrandMark";

export const alt = "Price My New Roof: what should a new roof cost for your house?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const font = await readFile(path.join(process.cwd(), "assets/fonts/BarlowSemiCondensed-Bold.ttf"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#EFF1F0",
          padding: "72px 84px",
          fontFamily: "Barlow Semi Condensed",
          color: "#22262A",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <BrandMark size={104} />
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-0.01em" }}>Price My New Roof</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.02, maxWidth: 900 }}>
            What should a new roof cost for your house?
          </div>
          <div style={{ display: "flex", borderTop: "4px solid #22262A", paddingTop: 18, fontSize: 32, color: "#4A5259" }}>
            pricemynewroof.com
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Barlow Semi Condensed", data: font, weight: 700, style: "normal" }] },
  );
}
