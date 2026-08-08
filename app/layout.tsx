import type { Metadata } from 'next';
import './globals.css';
import { Header, Footer } from '@/components/Chrome';
import FeedbackWidget from '@/components/FeedbackWidget';
import { currentUser } from '@/lib/supabase';
import { demoAvailable, demoOpen, isDemoMode } from '@/lib/demo';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtimeescape.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'RealTimeEscape — multiplayer 3D escape rooms in your browser',
    template: '%s · RealTimeEscape',
  },
  description:
    'Cinematic real-time multiplayer escape rooms that run in your browser. Private groups, live voice, ' +
    'independent viewpoints, no download and no game master. First release: Burn Window.',
  openGraph: {
    title: 'RealTimeEscape — multiplayer 3D escape rooms in your browser',
    description:
      'Sixty minutes to put a spacecraft back on a trajectory home. Private groups of 3–8, live voice, no download.',
    url: siteUrl,
    siteName: 'RealTimeEscape',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/favicon.svg' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, demoActive] = await Promise.all([currentUser(), isDemoMode()]);
  return (
    <html lang="en">
      <body>
        <Header
          signedIn={Boolean(user)}
          demoAvailable={demoAvailable()}
          demoActive={demoActive}
          demoOpen={demoOpen()}
        />
        {demoActive && (
          <div
            style={{
              background: 'var(--accent-deep)', color: '#dff2fb', textAlign: 'center',
              padding: '7px 16px', fontSize: 13,
            }}
          >
            Demo mode — seats are free, you can play solo, and nothing counts toward the public stats.
          </div>
        )}
        {/* Open demo mode means any visitor can give themselves free games. Kept deliberately
            loud so it cannot be left on by accident once real money is involved. */}
        {demoOpen() && !demoActive && (
          <div
            style={{
              background: '#5a3410', color: '#ffd9bd', textAlign: 'center',
              padding: '6px 16px', fontSize: 12,
            }}
          >
            Demo mode is unlocked for everyone — anyone can claim free seats. Set
            <code style={{ margin: '0 5px' }}>DEMO_MODE_OPEN=false</code>
            before taking real payments.
          </div>
        )}
        <main>{children}</main>
        <Footer />
        {/* Available everywhere, including mid-game — the moment somebody notices something is
            the moment they can best describe it. */}
        <FeedbackWidget context="site" />
      </body>
    </html>
  );
}
