// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

import { SITE } from './src/consts';

// https://astro.build/config
export default defineConfig({
  // `site` é obrigatório para canonical, Open Graph e sitemap.
  site: SITE.url,
  trailingSlash: 'never',
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    sitemap(),
    mdx(),
  ],
});
