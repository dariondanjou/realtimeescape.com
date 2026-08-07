import type { MetadataRoute } from 'next';
import { GAMES } from '@/lib/catalog';

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtimeescape.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPages = ['', '/games', '/demo', '/how-it-works', '/requirements', '/support', '/legal/terms', '/legal/privacy'];

  return [
    ...staticPages.map((path) => ({
      url: `${site}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: path === '' ? 1 : 0.7,
    })),
    ...GAMES.flatMap((g) => [
      { url: `${site}/games/${g.slug}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.9 },
      { url: `${site}/book/${g.slug}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 },
    ]),
  ];
}
