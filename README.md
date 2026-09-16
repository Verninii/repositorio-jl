# Site institucional — estúdio de desenvolvimento

Site de portfólio de um estúdio de desenvolvimento e-commerce, feito em
[Astro](https://astro.build).

> **Atenção:** o conteúdo atual é de demonstração. Nome da marca (`Órbita`),
> domínio, e-mail, depoimentos e dois dos quatro projetos são placeholders.
> Veja a checklist no final antes de publicar.

## Requisitos

Node **>= 22.12** (Astro 7 exige). Se você usa nvm-windows:

```bash
nvm use 24.14.0
```

## Comandos

| Comando           | O que faz                                      |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Servidor de desenvolvimento em `localhost:4321` |
| `npm run build`   | Gera o site estático em `dist/`                 |
| `npm run preview` | Pré-visualiza o build local                     |
| `npm run check`   | Checagem de tipos dos arquivos `.astro`         |

## Estrutura

```
src/
  consts.ts              # marca, contato, serviços, processo, depoimentos, stack
  content.config.ts      # schema da collection "projetos"
  content/projetos/      # um .md/.mdx por projeto
  components/
    SEO.astro            # canonical, Open Graph, Twitter card, JSON-LD
    ProjectCard.astro    # card de projeto usado na home e na listagem
    Icon.astro           # ícones inline (sem biblioteca externa)
  layouts/Layout.astro   # header, rodapé e shell de todas as páginas
  pages/
    index.astro          # home
    projetos/index.astro # listagem
    projetos/[...slug].astro # estudo de caso de cada projeto
public/robots.txt
```

Quase todo o texto fixo do site (marca, números, serviços, processo,
depoimentos, stack) vive em [`src/consts.ts`](src/consts.ts) — edite lá, não
nos componentes.

## Design

- **Paleta:** creme (`butter-*`) + azul periwinkle (`peri-*`), definidos como
  tokens em [`src/styles/global.css`](src/styles/global.css).
- **Tipografia:** Anton para títulos (classe `.display`), Inter para o resto.
  As duas são self-hosted pela API de fontes do Astro — nenhum request ao
  Google em produção.
- O `line-height` da `.display` é `1.12` de propósito: acentos do português
  (Á, Ó, Ê) colidem com a linha de cima em valores menores.

## Adicionar um projeto

Crie `src/content/projetos/nome-do-projeto.mdx`:

```mdx
---
title: 'Nome do projeto'
description: 'Resumo de 120–160 caracteres — isto vira a meta description.'
tipo: 'E-commerce Shopify'
cliente: 'Nome do cliente'
ano: 2026
stack: ['Astro', 'TypeScript']
accent: '#2f8f7a' # cor da marca do cliente, pinta o card
metricas:
  - valor: '-70%'
    label: 'tempo de digitação de pedido'
url: 'https://site-do-cliente.com'
repo: 'https://github.com/usuario/repo'
ordem: 1 # menor aparece primeiro
draft: false
---

## O contexto

...
```

O nome do arquivo vira a URL (`/projetos/nome-do-projeto`) e a página entra no
sitemap automaticamente. `draft: true` esconde o projeto do build.

## Antes do primeiro deploy

- [ ] Trocar o nome da marca (`SITE.company`) em [`src/consts.ts`](src/consts.ts)
- [ ] Trocar `SITE.url` pelo domínio real
- [ ] Trocar `SITE.email` — hoje é um endereço fictício (`contato@orbita.dev`)
- [ ] Atualizar `SITE.links` (GitHub/LinkedIn) para os perfis reais
- [ ] Atualizar a URL do sitemap em [`public/robots.txt`](public/robots.txt)
- [ ] Trocar os depoimentos de exemplo em `src/consts.ts` por reais
- [ ] Revisar os 4 projetos em `src/content/projetos/`: dois são baseados em
      marcas reais (Unic Pharma e Scentinela) mas com o relato do trabalho em
      branco, e dois são genéricos. Publique só o que o estúdio de fato entregou.
- [ ] Adicionar `public/og-default.png` (1200×630) — imagem de compartilhamento
- [ ] Trocar o mockup do hero em `src/pages/index.astro` por um screenshot real
      ou foto do time, se quiser
