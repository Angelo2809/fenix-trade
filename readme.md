# Fenix

Plataforma privada dos sócios para acompanhar mesas proprietárias. Next.js 16, React, TypeScript, FastAPI e PostgreSQL. Não há cadastro público nem administrador padrão. O login usa os assets fornecidos em camadas animadas; controles, textos e gráficos são componentes reais.

## Funcionalidades

- Login real com Argon2id, sessão HttpOnly revogável, proteção CSRF e bloqueio por tentativas.
- ADMIN cria convidados com senha temporária, exibida uma única vez, e troca obrigatória no primeiro acesso.
- Administração de usuários, ativação/desativação, reset de acesso e revogação de sessões.
- Importação **CSV**, UTF-8 ou Windows-1252, transacional, com detecção de contas e prevenção de duplicação.
- Configuração de limite de perda, data de início e apelido de cada conta.
- Dashboard consolidado/individual, evolução, resultados mensais e comparação entre contas.
- Fechamento mensal com calculado preservado, ajuste manual justificado e repasse de 90%.
- Histórico de importações e fechamentos, auditoria, layout responsivo e redução de movimento.

## Regras das mesas

O valor inicial representa **limite de perda**, não patrimônio dos sócios. Uma mesa de R$ 15 mil começa com saldo operacional zero e é perdida quando chega a −R$ 15 mil. A verificação usa cada operação encerrada disponível no CSV; não acompanha posições abertas ou cotações em tempo real.

Cada conta é um contrato independente. No fechamento: `disponível = saldo anterior + resultado confirmado`. Se positivo e a mesa não foi perdida, baixa-se o lucro inteiro: 90% de repasse e 10% da mesa. Prejuízos continuam acumulados. Exemplo: −R$ 200 anteriores + R$ 300 no mês = R$ 100 disponíveis, R$ 90 de repasse e saldo seguinte zero.

Os meses anteriores ao atual ficam disponíveis para confirmação em ordem. Ajustes exigem justificativa e não substituem o calculado original. Um mês fechado não recebe operações novas, mas aceita reenvios idênticos. Uma mesa perdida não se recupera automaticamente com lucro posterior. Não há reabertura de mês nesta versão.

Repasse é um registro administrativo de baixa. O sistema não executa pagamentos nem movimenta dinheiro. O consolidado soma resultados de contas, mas o repasse é apurado por conta, sem compensar perdas entre contratos diferentes.

## Estrutura

```text
backend/app/          API, segurança, modelos, importador e cálculos
backend/alembic/      Migrações
backend/tests/        Testes de segurança, CSV e contabilidade
frontend/app/         Login, primeiro acesso, dashboard, admin e fechamentos
frontend/components/ Componentes e gráficos
frontend/public/assets/fenix/  Assets utilizados
Example/              CSV original preservado
docs/                 Segurança, importação, cálculos e validação
```

Fluxo: CSV → validação → transação → PostgreSQL → API → dashboard. O frontend não lê a planilha para calcular os indicadores. Dados monetários usam Decimal/NUMERIC e chegam à interface como strings decimais.

## Requisitos

Python 3.11+, Node.js 22 LTS recomendado, npm e PostgreSQL 17. Docker é opcional. Copie `.env.example` para `.env` na raiz; configure usuário, senha, banco e origens. As credenciais de exemplo são apenas locais. Nunca versione `.env`.

## Sem Docker

Instale PostgreSQL e crie o banco/usuário indicados em `DATABASE_URL`. Em Windows, use `127.0.0.1` na conexão para evitar espera por IPv6. O banco precisa existir antes da migração.

PowerShell, a partir da raiz:

```powershell
Copy-Item .env.example .env
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
python -m app.cli create-admin
uvicorn app.main:app --reload --no-access-log
```

Em Linux/macOS, ative com `source .venv/bin/activate`. A CLI solicita nome, e-mail e senha com confirmação, sem exibi-la. Senha permanente: 8 a 128 caracteres. Não existe credencial padrão.

Em outro terminal:

```sh
cd frontend
npm install
npm run dev
```

Abra **http://localhost:3000/login**. A API fica em `http://127.0.0.1:8000`; `/api/*` no frontend é encaminhado à API, mantendo cookies no mesmo domínio. Para outra API, defina `BACKEND_URL` no ambiente antes de iniciar/compilar o frontend. Para produção local: `npm run build` e `npm run start`.

## Docker Compose

```sh
# Na raiz, com .env configurado:
docker compose up --build -d
docker compose exec backend python -m app.cli create-admin
```

Abra `http://localhost:3000/login`. O Compose inicia PostgreSQL, aplica migrações e inicia backend/frontend com healthchecks. Portas vinculadas a 127.0.0.1. Banco e uploads privados usam volumes persistentes.

```sh
docker compose ps
docker compose logs --tail=50 backend
docker compose stop
```

Não use `docker compose down -v` se precisar preservar os dados. Para produção, configure proxy **HTTPS**, `COOKIE_SECURE=true`, `ENABLE_DOCS=false`, origens exatas e senha exclusiva do banco. A aplicação requer servidor Python e PostgreSQL; não é um site estático.

## Primeiro uso

1. Crie o ADMIN pela CLI e entre.
2. Administração → Usuários: crie os convidados e compartilhe a senha temporária por canal privado. A senha expira em 24 horas por padrão.
3. O convidado entra e obrigatoriamente cria a própria senha.
4. Administração → Importação: envie o CSV de operações.
5. No diálogo de conta nova, informe limite e início. Se houver várias, configure as demais em Contas e configurações.
6. Use o seletor ou os cartões para filtrar o dashboard. Apelidos persistem entre uploads.
7. No mês seguinte, abra Fechamentos, confira o resultado, ajuste se necessário e confirme a baixa.
8. No perfil, altere a senha, saia ou desconecte todos os dispositivos.

O arquivo de `Example/` pode conter dados reais: não é servido pelo frontend, não é incluído na imagem Docker e nunca é alterado pelos testes.

## Testes

```sh
cd backend
pytest -q
ruff check app tests
alembic check
```

Os testes rápidos usam SQLite efêmero e não alteram o banco da aplicação. Para testar PostgreSQL, crie uma base separada chamada `fenix_test` e defina `TEST_DATABASE_URL`:

```powershell
$env:TEST_DATABASE_URL="postgresql+psycopg://fenix:SENHA@127.0.0.1:5432/fenix_test"
pytest -q
Remove-Item Env:TEST_DATABASE_URL
```

Os testes recriam tabelas apenas nessa base; recusam outras bases quando a variável está definida.

```sh
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

Para navegador, use exclusivamente uma base vazia `fenix_e2e`. Aponte `DATABASE_URL` para ela, aplique a migração e execute de `backend`: `python -m tests.prepare_e2e`. São gerados usuário aleatório e CSV fictício em `.local/`, ignorada no Git. Inicie a API nessa mesma base e o frontend, então execute:

```sh
cd frontend
npx playwright install chromium
npm run test:e2e
```

O ciclo completo E2E precisa de base vazia antes de repetir. Ele cria usuários, contas e fechamentos fictícios; não execute sobre dados de uso. Capturas e traces não são versionados. `requirements.lock.txt` registra as versões Python validadas e `package-lock.json` fixa as versões JavaScript.

## Documentação

- [Segurança](docs/SECURITY.md)
- [CSV e importação](docs/EXCEL_IMPORT.md)
- [Indicadores e fechamentos](docs/ACCOUNTING.md)
- [Validação](docs/VALIDATION.md)

Swagger: `http://127.0.0.1:8000/docs` quando habilitado. Clientes externos precisam enviar uma `Origin` permitida em operações mutáveis e, após login, `X-CSRF-Token` com o cookie `fenix_csrf`. A autorização sempre é validada no backend.

APIs: `/api/auth/*`, `/api/admin/users`, `/api/admin/audit`, `/api/accounts`, `/api/imports/csv`, `/api/imports`, `/api/dashboard`, `/api/dashboard/{summary,evolution,monthly-results,accounts-summary}`, `/api/accounts/{id}/close-preview` e `/api/accounts/{id}/closes`. Saúde: `/health` e `/ready`.
