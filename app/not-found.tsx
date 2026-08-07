import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="section">
      <div className="wrap narrow center" style={{ paddingTop: 60 }}>
        <span className="eyebrow">Signal lost</span>
        <h1 style={{ fontSize: 44, margin: '16px 0 12px' }}>404</h1>
        <p className="lede" style={{ marginBottom: 28 }}>
          This page is not where you left it. Neither is the ship.
        </p>
        <div className="cta-row" style={{ justifyContent: 'center' }}>
          <Link href="/" className="btn btn-primary">Back to the surface</Link>
          <Link href="/games" className="btn btn-ghost">See the games</Link>
        </div>
      </div>
    </section>
  );
}
