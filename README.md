# Magic Match Tracker

Plataforma para registrar partidas de **Commander (EDH)** em tempo real ou após o
jogo — gerando histórico, timeline e estatísticas de jogadores, decks e cartas.

Stack **TypeScript ponta a ponta**:

| Camada    | Tecnologia                                                        |
| --------- | ----------------------------------------------------------------- |
| Runtime   | **Bun**                                                           |
| API       | **Elysia** + **Prisma** + **PostgreSQL**                         |
| Tipos e2e | **Eden Treaty** (tipos do backend inferidos direto no frontend)  |
| Web       | **React 19** + **Vite** + **Tailwind v4** + **shadcn/ui**        |
| Dados     | **TanStack Query**                                                |
| Cartas    | **Scryfall** (chave `scryfallId`)                                |
| Infra     | **Docker Compose** (db + api + web, com hot-reload)              |

## Como rodar

Pré-requisito: **Docker** + **Docker Compose**. Nada mais.

```bash
cp .env.example .env      # já existe um .env pronto para dev
docker compose up --build
```

- Web:  http://localhost:5173
- API:  http://localhost:3000  (health: http://localhost:3000/health)
- DB:   postgres em localhost:5432 (mtg / mtg)

Na primeira subida o container da API roda `prisma db push` (cria as tabelas) e
um seed idempotente (4 jogadores + 4 decks com comandantes reais da Scryfall + 1
partida de exemplo).

### Comandos úteis

```bash
docker compose up             # sobe a stack
docker compose up --build     # reconstrói as imagens (após mudar dependências)
docker compose down           # para tudo
docker compose down -v        # para e apaga o volume do banco (reset total)
docker compose logs -f api    # logs da API
docker compose exec api bunx prisma studio --hostname 0.0.0.0   # inspecionar o banco
```

## Estrutura

```
apps/
  api/   Elysia + Prisma  (@mtg/api — exporta o tipo `App` para o Eden)
    prisma/schema.prisma   modelo de domínio
    src/modules/           players, cards, decks, matches, stats
    src/lib/               prisma, scryfall, cards
  web/   React + Vite      (@mtg/web)
    src/pages/             dashboard, players, decks, matches
    src/components/ui/     primitivos shadcn
    src/lib/eden.ts        cliente tipado
```

## Estado atual (MVP)

Funcionando ponta a ponta:

- **Jogadores** — CRUD completo
- **Decks** — criação com busca de comandante na Scryfall (color identity derivada)
- **Partidas** — registro com pódio (colocação por assento) + listagem
- **Dashboard** — rankings de winrate de jogadores e decks
- **Timeline de eventos** — modelo + endpoint (`POST /matches/:id/events`); UI de
  construção da timeline é o próximo passo

## Roadmap (fases seguintes)

1. **Timeline UI** — construtor de eventos (ator/alvo/carta/turno) e visualização
2. **Import Moxfield** + lista completa de cartas (`DeckCard`) e stats por carta
3. **Dashboards** com gráficos, heatmap de interações, filtros
4. **Auth** (multi-playgroup) e replay da partida
