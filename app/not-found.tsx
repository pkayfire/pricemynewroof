import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="container estimate-main">
      <h1 className="h1-page">We couldn&apos;t find that page</h1>
      <section className="panel state-panel">
        <p>The link may be mistyped, or the estimate may no longer exist.</p>
        <p>
          <Link href="/">Measure a roof</Link>
        </p>
      </section>
    </main>
  );
}
