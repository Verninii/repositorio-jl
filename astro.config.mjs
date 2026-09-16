// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

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

  // Fontes self-hosted: sem request para o Google, sem layout shift.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-inter',
      weights: ['400 700'],
      subsets: ['latin'],
    },
    {
      provider: fontProviders.google(),
      name: 'Archivo Black',
      cssVariable: '--font-archivo',
      weights: [400],
      subsets: ['latin'],
    },
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [sitemap(), mdx()],
});
