import type { Metadata } from 'next';
import './globals.css';
import { Header, Footer } from '@/components/Chrome';
import { currentUser } from '@/lib/supabase';

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
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <Header signedIn={Boolean(user)} />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
