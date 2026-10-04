// Admin area: noindex, plain markup (restyled after the Milestone 3 merge).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | Price My New Roof",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <main style={{ padding: "16px 18px", maxWidth: 1180, margin: "0 auto" }}>{children}</main>;
}
