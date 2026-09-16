# Portfólio

Portfólio de projetos freelance de desenvolvimento, feito em [Astro](https://astro.build).

## Requisitos

Node **>= 22.12** (o Astro 7 exige). Se você usa nvm-windows:

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
  consts.ts              # título, descrição e URL do site (base do SEO)
  content.config.ts      # schema da collection "projetos"
  content/projetos/      # um .md/.mdx por projeto
  components/SEO.astro   # canonical, Open Graph, Twitter card, JSON-LD
  layouts/Layout.astro   # shell de todas as páginas
  pages/
    index.astro          # home
    projetos/index.astro # listagem
    projetos/[...slug].astro # página de cada projeto
public/robots.txt
```

## Adicionar um projeto

Crie `src/content/projetos/nome-do-projeto.mdx`:

```mdx
---
title: 'Nome do projeto'
description: 'Resumo de 120–160 caracteres — isto vira a meta description.'
cliente: 'Nome do cliente'
ano: 2026
stack: ['Astro', 'TypeScript']
url: 'https://site-do-cliente.com'
repo: 'https://github.com/usuario/repo'
destaque: false
draft: false
---

## O desafio

...
```

O nome do arquivo vira a URL (`/projetos/nome-do-projeto`) e a página entra no
sitemap automaticamente. `draft: true` esconde o projeto do build.

## Antes do primeiro deploy

- [ ] Trocar `SITE.url` em `src/consts.ts` pelo domínio real
- [ ] Atualizar a URL do sitemap em `public/robots.txt`
- [ ] Adicionar `public/og-default.png` (1200×630) — imagem de compartilhamento
- [ ] Remover o projeto de exemplo em `src/content/projetos/`
