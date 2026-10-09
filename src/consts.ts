// Dados usados pelo SEO e pelo conteúdo fixo do site.
// TODO: "Órbita" é um nome de placeholder — troque por sua marca real.
// TODO: troque também SITE.url, SITE.email e SITE.links pelos dados reais
// antes do primeiro deploy — canonical, Open Graph, sitemap e contato
// dependem deles.
import type { ImageMetadata } from 'astro';

export const SITE = {
  url: 'https://orbita.dev',
  company: 'Órbita',
  tagline: 'Estúdio de desenvolvimento e-commerce',
  title: 'Órbita — Estúdio de Desenvolvimento E-commerce',
  description:
    'Estúdio de desenvolvimento focado em e-commerce. Construímos lojas Shopify rápidas, sites institucionais e integrações sob medida para marcas brasileiras.',
  email: 'contato@orbita.dev',
  lang: 'pt-BR',
  locale: 'pt_BR',
  ogImage: '/og-default.png',
  links: [
    { label: 'GitHub', href: 'https://github.com/' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/' },
  ],
} as const;

/** Números exibidos no hero. */
export const NUMEROS = [
  { valor: '6+', label: 'anos de experiência no time' },
  { valor: '30+', label: 'projetos entregues' },
  { valor: '< 1,5s', label: 'LCP médio' },
  { valor: '100%', label: 'código próprio' },
] as const;

/** Frentes de atuação — lista com ícone, no estilo da referência. */
export const SERVICOS = [
  {
    icone: 'cart',
    titulo: 'Lojas Shopify sob medida',
    texto:
      'Tema próprio ou customização profunda de um existente: seções editáveis, catálogo bem estruturado e checkout sem atrito.',
  },
  {
    icone: 'bolt',
    titulo: 'Performance e Core Web Vitals',
    texto:
      'Auditoria e otimização de LCP, CLS e INP. Menos JavaScript, imagens no formato certo e carregamento em ordem de prioridade.',
  },
  {
    icone: 'plug',
    titulo: 'Integrações e automações',
    texto:
      'ERP, gateways, marketplaces e apps internos conectados via API, com tratamento de erro e observabilidade de verdade.',
  },
  {
    icone: 'search',
    titulo: 'SEO técnico',
    texto:
      'Arquitetura de URLs, dados estruturados, canonical e sitemap resolvidos na origem — não como plugin depois.',
  },
  {
    icone: 'chart',
    titulo: 'Dados e mensuração',
    texto:
      'GA4, eventos de e-commerce e server-side tagging configurados para que a decisão venha de número, não de achismo.',
  },
] as const;

/** Etapas do processo — blocos 01 a 04. */
export const PROCESSO = [
  {
    titulo: 'Diagnóstico',
    texto: 'Entendemos o negócio, o catálogo e onde a operação trava hoje.',
  },
  {
    titulo: 'Planejamento',
    texto: 'Escopo fechado, prioridades e cronograma acordados antes da primeira linha de código.',
  },
  {
    titulo: 'Construção',
    texto: 'Desenvolvimento em ciclos curtos, com ambiente de homologação aberto para você acompanhar.',
  },
  {
    titulo: 'Entrega e suporte',
    texto: 'Publicação, medição dos Core Web Vitals e acompanhamento nas semanas seguintes.',
  },
] as const;

export type Depoimento = {
  /** Frase curta de destaque, aparece em negrito acima do texto */
  titulo?: string;
  texto: string;
  autor: string;
  cargo?: string;
  /** Nota de 1 a 5 (padrão 5) */
  nota?: number;
  /** Foto de src/assets. Sem foto, mostra as iniciais */
  foto?: ImageMetadata;
};
/** Depoimentos de clientes.
 * TODO: confirmar c/ cada cliente (texto e nome) antes de publicar. */
export const DEPOIMENTOS: readonly Depoimento[] = [
  {
    titulo: 'Parceria de alto nível.',
    texto:
      'Excelente competência técnica na reformulação do nosso sistema. Comunicação clara, pontualidade rigorosa e uma plataforma segura e rápida para a equipe. Time extremamente confiável.',
    autor: 'Dr. Eduardo Vasconcelos',
  },
  {
    titulo: 'Simplesmente perfeito!',
    texto: 'Entregaram minha página antes do prazo, leve e convertendo muito. Recomendo d+!',
    autor: 'Beatriz Lima',
  },
  {
    titulo: 'Sem frescura nem enrolação!',
    texto:
      'Papo reto direto pelo whats e desenrolaram meu app voando. Quando precisei ajustar coisa de última hora, resolveram na boa e ainda deram ideias feras pro layout. Trampo fino!',
    autor: 'Matheus Rocha',
  },
  {
    titulo: 'Sensibilidade absurda, ficou bom d+!',
    texto:
      'Nossa plataforma anterior travava direto. Eles reconstruíram tudo com uma pegada super moderna e fácil de mexer, sem passar perrengue. O suporte pós-entrega tb foi 10/10!',
    autor: 'Camila Duarte',
  },
];

/** Tecnologias exibidas na home. */
export const STACK = [
  'Shopify',
  'Liquid',
  'Hydrogen',
  'TypeScript',
  'Astro',
  'React',
  'Tailwind CSS',
  'Node.js',
  'GraphQL',
  'Vite',
] as const;

/** Marcas atendidas — faixa "confiam na gente". TODO: troque por clientes reais. */
export const CLIENTES = [
  'Unic Pharma',
  'Scentinela',
  'Distribuidora Vega',
  'Nutrin',
  'Casa Lumen',
] as const;

/** Filtros da galeria de projetos. O valor casa com `tipo` no frontmatter. */
export const FILTROS = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'E-commerce Shopify', label: 'Shopify' },
  { valor: 'Landing page', label: 'Landing' },
  { valor: 'Plataforma B2B', label: 'B2B' },
] as const;

/** Números com ícone da faixa azul abaixo das frentes de atuação. */
export const DESTAQUES = [
  { icone: 'cart', valor: '30+', label: 'lojas no ar' },
  { icone: 'bolt', valor: '150+', label: 'entregas de performance' },
  { icone: 'check', valor: '100%', label: 'código próprio' },
] as const;
