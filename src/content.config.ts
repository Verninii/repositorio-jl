import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const projetos = defineCollection({
  loader: glob({ base: './src/content/projetos', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      tipo: z.string(),
      cliente: z.string().optional(),
      ano: z.number(),
      stack: z.array(z.string()).default([]),
      accent: z.string().default('#8b8b8b'),
      metricas: z
        .array(z.object({ valor: z.string(), label: z.string() }))
        .default([]),
      capa: image().optional(),
      capaAlt: z.string().optional(),
      url: z.url().optional(),
      repo: z.url().optional(),
      destaque: z.boolean().default(false),
      draft: z.boolean().default(false),
      ordem: z.number().default(99),
    }),
});

export const collections = { projetos };
