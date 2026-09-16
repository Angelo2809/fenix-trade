# Validação da implementação

Executada em 16/09/2026, em Windows, com Python 3.14 local, Node 22 e PostgreSQL 17. Containers: Python 3.12 e Node 22.

## Verificações concluídas

- 38 testes de backend passaram em SQLite efêmero e novamente em PostgreSQL isolado. Cobrem login, bloqueio, CSRF, temporária, primeiro acesso, papéis, reset/revogação, importação real, rollback, contas dinâmicas, preservação de apelido, filtros, consolidação, baixas, ajustes e perda da mesa.
- Um teste adicional passou para criação de administrador por CLI com senha temporária. Total atual: 39 testes de backend.
- O CSV original foi analisado e usado como fixture; 24 operações foram persistidas sem alterar o arquivo. Valores monetários em Decimal e deduplicação confirmados.
- Alembic aplicou a migração em banco vazio. `alembic check` não encontrou divergências dos modelos.
- `ruff check app tests` passou.
- `npm run lint`, `npm run typecheck` e compilação Next.js passaram.
- Dois testes Playwright passaram com backend/frontend executados sem containers: fluxo completo e verificação de redução de movimento/teclado/API protegida.
- O fluxo de navegador incluiu login, upload, configuração de três contas, criação de convidado, senha de primeiro acesso, troca de senha, fechamento com ajuste, registro do repasse, filtro por conta e bloqueio de administração para sócio.
- Capturas de login, administração e dashboard revisadas em desktop; login e dashboard também avaliados em celular. Capturas usam exclusivamente dados fictícios de uma base E2E isolada.
- Docker Compose compilou e iniciou PostgreSQL, API e frontend. Os três serviços ficaram saudáveis. Login HTTP e healthcheck do banco/API foram verificados.

## Limites do que foi validado

Não foi realizada auditoria externa/pentest, teste de carga, integração com corretora, envio de e-mails, execução de pagamentos nem implementação TOTP. O sistema registra operações e fechamentos administrativos a partir do CSV. Não é um motor de trading em tempo real. Os limites contábeis estão documentados em ACCOUNTING.md.

Há avisos de depreciação das bibliotecas de testes Starlette/httpx e do ciclo de suporte ESLint; não causaram falhas nas verificações. Dados e credenciais de teste ficam fora da base de uso e do versionamento.
