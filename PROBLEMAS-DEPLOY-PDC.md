# Deploy no PDC — problemas encontrados e soluções

Registro dos obstáculos enfrentados ao colocar o **Magic Match Tracker** no ar no
PDC Deploy (Coolify) e como cada um foi resolvido. Serve como referência para
futuros deploys e para manter a config de produção saudável.

- **Repositório:** `guiqwer/MTG-Tracker` (branch `main`)
- **URL de produção:** https://mtg-tracker.projetos.ltap.ifce.edu.br
- **Stack:** Bun + Elysia + Prisma (API) · React + Vite (web) · Postgres · Docker Compose

---

## Contexto: o `docker-compose.yml` era de desenvolvimento

O ponto de partida era um compose feito para **desenvolvimento local**, com
bind-mount do código, hot reload e servidores em modo dev. Subir isso "como
estava" no PDC teria falhado ou subido um app vazio/instável. Quase todos os
problemas abaixo derivam disso.

---

## 1. `container_name` fixos

- **Problema:** os serviços fixavam `container_name` (`mtg_db`, `mtg_api`,
  `mtg_web`). Em um host compartilhado, nomes fixos **colidem** com containers de
  outros apps.
- **Detectado por:** `pdc_analyze_compose` / `pdc_preflight` (warning
  `fixed_container_name`).
- **Solução:** removidas as linhas `container_name` dos três serviços (o Docker
  gera nomes únicos automaticamente).

## 2. Portas publicadas no host (`ports:`)

- **Problema:** todos os serviços publicavam portas no host (`ports: "x:y"`).
  Desnecessário no PDC (o acesso é por domínio) e **fonte de conflito de porta**
  na infra compartilhada.
- **Detectado por:** warning `host_port_binding` no preflight.
- **Solução:** removidos os mapeamentos de porta. No fim, o serviço público
  `web` passou a usar apenas `expose: "80"` (ver item 7).

## 3. Frontend chamava `http://localhost:3000`

- **Problema:** o cliente da API (`VITE_API_URL`) apontava para
  `http://localhost:3000`. No navegador do usuário final, `localhost` é a
  **máquina dele**, não o servidor — a API nunca seria encontrada.
- **Solução:** o frontend passou a chamar o caminho relativo **`/api`**, servido
  no mesmo domínio e repassado à API pelo nginx (ver item 5).

## 4. Só um serviço pode ser público no PDC

- **Problema:** o PDC expõe **um único serviço público** por projeto. Mas a app
  tem frontend (`web`) **e** backend (`api`) que o navegador precisa alcançar.
- **Solução:** o serviço `web` virou um **nginx** que:
  1. serve o SPA já "buildado" (estático), e
  2. faz **reverse proxy** de `/api/*` para o serviço interno `api:3000`.

  Assim o navegador fala só com um endereço, e a API fica protegida atrás dele.
  Arquivo: `apps/web/nginx.conf` (`location /api/ { proxy_pass http://api:3000/; }`
  — a barra final remove o prefixo `/api`).

## 5. Vite dev server não serve produção

- **Problema:** o `web` rodava `vite` em **modo dev** na porta 5173 (hot reload).
  Inadequado/instável para produção.
- **Solução:** `apps/web/Dockerfile` virou **multi-stage**: um estágio builda com
  `bun run build` (Vite → estático) e o outro serve com **nginx:alpine**.

## 6. `VITE_API_URL` é resolvido em tempo de build

- **Problema:** variáveis `VITE_*` são embutidas no bundle **durante o build**, não
  em runtime. Não dá para "injetar" a URL da API depois que o site já foi gerado.
- **Solução:** o valor `/api` é fixado como `ARG`/`ENV` no Dockerfile de build
  (`ARG VITE_API_URL=/api`), garantindo o path relativo independentemente do que o
  PDC injete. Não depende de env em runtime.

## 7. Eden Treaty precisa de URL absoluta

- **Problema:** o cliente Eden (`treaty`) pode não lidar bem com uma base
  puramente relativa (`/api`).
- **Solução:** em `apps/web/src/lib/eden.ts`, uma base relativa é resolvida contra
  a origem atual: `` `${window.location.origin}${configured}` ``. Assim o Eden
  sempre recebe uma URL absoluta (`https://.../api`).

## 8. API em modo dev com hot reload

- **Problema:** o entrypoint da API rodava `bun run --watch` (hot reload) e
  reinstalava dependências, dependendo do bind-mount do código.
- **Solução:** `apps/api/docker-entrypoint.sh` virou start de produção:
  `prisma generate && prisma db push` + seed idempotente + `bun run src/index.ts`
  (sem `--watch`).

## 9. Risco do `node_modules` do host vazar para a imagem

- **Problema:** o `Dockerfile` faz `COPY . .`; se o `node_modules` do host
  (Fedora) fosse copiado, poderia sobrescrever as dependências instaladas na
  imagem (Debian) — as binárias do Prisma são específicas de plataforma.
- **Solução:** o `.dockerignore` na raiz **já excluía** `node_modules`,
  `apps/*/node_modules`, `dist`, etc. Verificado antes do build. Nenhuma mudança
  necessária.

## 10. Um único compose para local **e** PDC

- **Problema:** o PDC lê o `/docker-compose.yml` da raiz e não há opção de apontar
  para um arquivo alternativo. Ao mesmo tempo, queríamos continuar rodando local.
- **Solução:** um **único `docker-compose.yml`**, agora capaz de produção,
  que roda nos dois lugares. O trade-off é abrir mão do hot reload local; para
  acessar o `web` localmente, publique a porta na hora:
  `docker compose run --rm --service-ports -p 8080:80 web` (ou um
  `docker-compose.override.yml` gitignored com `ports:`).

## 11. Warning de porta no preflight → `expose`

- **Problema:** um mapeamento `ports: "8080:80"` (deixado para acesso local)
  gerou warning `host_port_binding` no `pdc_preflight`.
- **Solução:** trocado por `expose: "80"`. O PDC roteia o domínio direto para a
  porta 80 do container, sem publicar porta no host. Preflight ficou 100% limpo.

## 12. App "hibernando" logo após o deploy

- **Problema:** as primeiras requisições à URL pública retornaram uma página
  **"Acordando o ambiente…"** em vez da resposta da API.
- **Causa:** o PDC coloca apps ociosos em **hibernação** para poupar recursos; a
  primeira visita "acorda" o container (a página recarrega sozinha).
- **Solução:** não é um erro — bastou aguardar alguns segundos. Depois disso,
  `/api/health` e `/api/players` responderam 200 com dados reais.

---

## Resultado final

Configuração de produção validada **localmente** (stack completa via
`docker compose up`) e **em produção** (endpoints testados na URL pública):

| Endpoint | Status |
|----------|--------|
| `GET /` (SPA) | 200 `text/html` |
| `GET /api/health` (via proxy nginx) | 200 `{"status":"ok"}` |
| `GET /api/players` (rota real → Postgres) | 200 com dados |

### Arquivos tocados
- `docker-compose.yml` — compose único, apto a produção (sem bind-mount / nomes /
  portas fixas); `web` = nginx servindo o SPA + proxy `/api`; `db` interno com
  volume persistente.
- `apps/web/Dockerfile` — build Vite multi-stage → nginx; `VITE_API_URL=/api`.
- `apps/web/nginx.conf` — SPA estático + `proxy_pass` de `/api/` para `api:3000`.
- `apps/api/docker-entrypoint.sh` — start de produção (db push + seed, sem watch).
- `apps/web/src/lib/eden.ts` — resolve base relativa contra `window.origin`.

### Lições
- **Compose de dev ≠ compose de prod.** Bind-mounts e servidores dev não sobem em
  PaaS; separe ou torne o compose apto a produção.
- **Um serviço público** → use um reverse proxy (nginx) para expor frontend e API
  no mesmo domínio.
- **Vars `VITE_*` são de build**, não de runtime — planeje a URL da API no build.
- **Rode o preflight** (`pdc_preflight`) e trate os warnings antes de deployar.
