import Link from 'next/link';
import type { Metadata } from 'next';
import DeviceCheck from './DeviceCheck';

export const metadata: Metadata = {
  title: 'System requirements',
  description: 'Check whether your computer can run a RealTimeEscape game, right now, in this browser.',
};

export default function RequirementsPage() {
  return (
    <section className="section">
      <div className="wrap narrow">
        <span className="eyebrow eyebrow-dim">Requirements</span>
        <h1 style={{ fontSize: 34, margin: '14px 0 12px' }}>Can your computer run it?</h1>
        <p className="lede" style={{ marginBottom: 30 }}>
          Find out in about two seconds. This runs entirely in your browser and sends nothing
          anywhere.
        </p>

        <DeviceCheck />

        <h2 style={{ fontSize: 22, margin: '46px 0 14px' }}>The full list</h2>
        <div className="panel">
          <dl>
            <div className="kv"><dt>Device</dt><dd>Desktop, laptop, phone or tablet. Touch controls on mobile; a computer with a mouse plays nicest.</dd></div>
            <div className="kv"><dt>Browser</dt><dd>Chrome 113+, Edge 113+. Safari 17+ works with reduced effects.</dd></div>
            <div className="kv"><dt>Graphics</dt><dd>WebGL2 minimum. WebGPU unlocks the high quality tier.</dd></div>
            <div className="kv"><dt>Memory</dt><dd>8 GB system RAM recommended</dd></div>
            <div className="kv"><dt>Network</dt><dd>5 Mbps down. Wired or strong Wi-Fi preferred over cellular.</dd></div>
            <div className="kv"><dt>Audio</dt><dd>Microphone required. Headphones strongly recommended.</dd></div>
          </dl>
        </div>

        <h2 style={{ fontSize: 22, margin: '40px 0 12px' }}>Why a microphone is not optional</h2>
        <p>
          The last fifteen minutes of Burn Window are built around one person reading numbers to
          people who cannot see them. There is a text chat fallback and it does work — but it is
          slower, and the clock does not care. Bring a microphone.
        </p>

        <div className="cta-row" style={{ marginTop: 32 }}>
          <Link href="/book/burn-window" className="btn btn-primary">Book a game</Link>
        </div>
      </div>
    </section>
  );
}
