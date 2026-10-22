import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { hagilight, hagilightFavicon } from '@hagicode/hagilight/integration';
import tailwindcss from '@tailwindcss/vite';
import { IMAGE_BASE_URL } from './src/config/albums.ts';
import { DEFAULT_LOCALE, SITE_URL, SUPPORTED_LOCALES } from './src/config/site.ts';

// https://astro.build/config
export default defineConfig({
    // Absolute production origin. Hagilight needs it for the sitemap, robots.txt, RSS and llms.txt.
    site: SITE_URL,
    base: '/',
    i18n: {
        defaultLocale: DEFAULT_LOCALE,
        locales: [...SUPPORTED_LOCALES],
        routing: {
            prefixDefaultLocale: false,
        },
    },
    // Link previews re-encode an album's first image, which lives on the image host, so Astro must be allowed to fetch it.
    image: {
        domains: [new URL(IMAGE_BASE_URL).hostname],
    },
    vite: {
        plugins: [tailwindcss()],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },
    },
    integrations: [
        // Both Hagilight integrations keep their default features on. hagilightFavicon() edits Astro's config head only;
        // the layout passes the same icon through SEOHead (see src/layouts/BaseLayout.astro).
        hagilight(),
        hagilightFavicon(),
        // React renders the shadcn components to static HTML at build time. No client:* directive is used.
        react(),
    ],
});
