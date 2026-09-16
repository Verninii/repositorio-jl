import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const projetos = defineCollection({
  loader: glob({ base: './src/content/projetos', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Vira a meta description da página — mantenha entre 120 e 160 caracteres. */
      description: z.string(),
      /** Rótulo curto exibido no card, ex.: "E-commerce Shopify". */
      tipo: z.string(),
      cliente: z.string().optional(),
      ano: z.number(),
      stack: z.array(z.string()).default([]),
      /** Cor da marca — pinta o gradiente do card. */
      accent: z.string().default('#8b8b8b'),
      /** Número grande + rótulo, exibidos na página do projeto. */
      metricas: z
        .array(z.object({ valor: z.string(), label: z.string() }))
        .default([]),
      capa: image().optional(),
      capaAlt: z.string().optional(),
      url: z.url().optional(),
      repo: z.url().optional(),
      destaque: z.boolean().default(false),
      draft: z.boolean().default(false),
      /** Ordem de exibição — menor aparece primeiro. */
      ordem: z.number().default(99),
    }),
});

export const collections = { projetos };
