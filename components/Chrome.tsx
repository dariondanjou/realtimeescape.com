import Link from 'next/link';
import { Mark, GlitchWord } from './Brand';
import DemoToggle from './DemoToggle';

export function Header({
  signedIn,
  demoAvailable = false,
  demoActive = false,
}: {
  signedIn: boolean;
  demoAvailable?: boolean;
  demoActive?: boolean;
}) {
  return (
    <header className="site-header">
      <div className="bar">
        <Link href="/" className="brand">
          <Mark />
          <GlitchWord text="realtimeescape.com" />
        </Link>
        <nav className="nav">
          {demoAvailable && <DemoToggle active={demoActive} />}
          <Link href="/games" className="hide-sm">Games</Link>
          <Link href="/demo" className="hide-sm">Try it</Link>
          <Link href="/how-it-works" className="hide-sm">How it works</Link>
          <Link href={signedIn ? '/account' : '/account/sign-in'}>
            {signedIn ? 'Account' : 'Sign in'}
          </Link>
          <Link href="/book/burn-window" className="btn btn-primary btn-sm">Book a game</Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-cols">
          <div style={{ maxWidth: 280 }}>
            <div className="brand" style={{ marginBottom: 12 }}>
              <Mark size={17} />
              <span>realtimeescape.com</span>
            </div>
            <p className="tiny">
              Cinematic multiplayer escape rooms that run in your browser. Private groups,
              live voice, no download, no host.
            </p>
          </div>
          <div>
            <h4>Games</h4>
            <Link href="/games/burn-window">Burn Window</Link>
            <Link href="/games">All games</Link>
          </div>
          <div>
            <h4>Play</h4>
            <Link href="/demo">Try the ending</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/requirements">System requirements</Link>
            <Link href="/book/burn-window">Book a game</Link>
          </div>
          <div>
            <h4>Company</h4>
            <Link href="/roadmap">What we&rsquo;re fixing</Link>
            <Link href="/report">Report a problem</Link>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/support">Support</Link>
          </div>
        </div>
        <hr className="rule" style={{ margin: '32px 0 18px' }} />
        <p className="tiny">© {new Date().getFullYear()} RealTimeEscape. All rights reserved.</p>
      </div>
    </footer>
  );
}
