import type { MetadataRoute } from 'next';

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtimeescape.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Booking, invitation, lobby and account pages are private to a paying group.
      disallow: ['/booking/', '/invite/', '/lobby/', '/account', '/api/', '/auth/'],
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
