import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Price My New Roof",
  description:
    "A general roof replacement estimate for your address. A referral service, not a contractor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
