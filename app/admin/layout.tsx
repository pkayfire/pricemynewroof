// Admin area: noindex (also X-Robots-Tag from proxy.ts and disallowed in robots.txt).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="container estimate-main admin">
      {children}
    </main>
  );
}
