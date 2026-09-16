# Segurança

## Identidade, senhas e sessões

Sem cadastro público e sem administrador padrão. A CLI interativa cria o primeiro ADMIN. Senhas usam Argon2id, nunca texto puro ou cifra reversível. Permanentes: 8–128 caracteres. Senhas temporárias criptograficamente aleatórias expiram em 24 horas por padrão, são devolvidas somente na criação/reset e removidas do estado da interface ao fechar o diálogo.

A sessão de primeiro acesso dura no máximo 20 minutos e não libera APIs financeiras ou administrativas. A troca substitui o hash, revoga todas as sessões e emite uma sessão normal. Reset também revoga sessões e invalida a senha anterior.

Token de sessão opaco e aleatório; só seu SHA-256 fica no banco. Cookie HttpOnly, SameSite=Lax, Path=/, Secure configurável. Não há token em localStorage. Expiração: 12 horas ou até 30 dias ao lembrar. Inatividade: 60 minutos em ambos os casos. Logout individual/global, revogação administrativa e revogação após atualização de usuário.

Identidade e autorização são verificadas no backend. PARTNER lê as contas compartilhadas dos sócios; somente ADMIN administra, importa, configura e fecha meses. Função enviada pelo cliente nunca concede autorização. O administrador não pode remover o próprio acesso administrativo pela interface.

Login usa mensagem genérica para credenciais inválidas, conta inativa/bloqueada ou senha temporária expirada. E-mail inexistente também passa por uma verificação Argon2. Cinco falhas bloqueiam por 15 minutos; há limite persistente por IP de 20 tentativas por janela. Valores configuráveis. Registros antigos são limpos.

## CSRF, origens e headers

Todas as requisições mutáveis exigem Origin exatamente permitida, inclusive login. Requisições autenticadas mutáveis exigem X-CSRF-Token, cujo hash é comparado em tempo constante com o associado à sessão. O cookie legível `fenix_csrf` não é uma credencial de autenticação.

O frontend encaminha `/api/*` para a API no mesmo domínio do navegador. CORS tem origens explícitas, nunca wildcard com credenciais. Configure esquema/host/porta em FRONTEND_URL e CORS_ORIGINS. Por padrão, a API não confia em X-Forwarded-For: atrás de proxy, clientes podem compartilhar o limite do IP do proxy. Considere essa topologia ao configurar o limite.

CSP do frontend usa nonce por resposta, renderização dinâmica e strict-dynamic. unsafe-eval é permitido só no desenvolvimento. Estilos inline são necessários para gráficos e animações. Há proteção contra frames, nosniff, política de referência e restrição de câmera/microfone/geolocalização. Respostas privadas usam no-store.

**HTTPS é obrigatório em produção**, com COOKIE_SECURE=true, certificado e proxy confiável. O backend habilita HSTS com cookies Secure. A configuração HTTP de exemplo é local. Desabilite Swagger por ENABLE_DOCS=false em produção. Em desenvolvimento, o Swagger tem CSP específica para seus assets oficiais.

## Uploads e integridade

CSV é texto, nunca executado. São validados extensão, MIME, tamanho, codificação, estrutura, datas e números. Um limite no stream também interrompe corpos sem Content-Length antes de gravar uploads arbitrariamente grandes. Arquivos privados têm nomes aleatórios e não são servidos em public. SHA-256 preserva identidade dos bytes. Não inclua Example em publicação.

Dinheiro usa Decimal/NUMERIC. Restrições únicas e bloqueios no PostgreSQL protegem contas, operações e fechamentos concorrentes. Falhas não deixam importações parciais. Meses fechados rejeitam novas operações e alterações retroativas de capital/data. Ajustes precisam de justificativa.

Containers backend/frontend usam usuários sem root. Portas Compose vinculadas a 127.0.0.1. Configure backup, retenção e restauração do PostgreSQL e dos volumes privados. Não exponha a porta do banco à internet.

## Auditoria e logs

Eventos: login válido/inválido, logout, usuário criado/alterado/ativado/desativado, senha temporária criada/resetada, senha alterada, sessões revogadas, conta configurada/apelidada, upload CSV iniciado/concluído/falho e mês fechado.

Auditoria inclui ator, ação, horário UTC, IP, user-agent limitado e metadados necessários, sem senhas, tokens, cookies, segredos MFA ou conteúdo completo do relatório. A API `/api/admin/audit` exige ADMIN.

Logs estruturados contêm request_id, rota parametrizada, método, status e duração. Use uvicorn --no-access-log para evitar duplicação. Não habilite logging SQL com parâmetros ou tracing de corpos/cookies em produção.

## MFA

A arquitetura reserva `mfa_enabled`, mas TOTP **não está implementado** nesta versão. Não existe campo que simule MFA. Habilitar o indicador diretamente bloqueia login, em vez de ignorar o segundo fator. Evolução futura requer desafio separado, segredo criptografado com chave externa, prevenção de replay, códigos de recuperação com hash e enrolamento verificado.
