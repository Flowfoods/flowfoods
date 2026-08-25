#!/usr/bin/env bash
#
# Gera o bloco de Environment do Dokploy, com os segredos já sorteados.
#
#   ./scripts/gerar-env.sh
#
# Imprime na tela para você COPIAR e colar no painel. Não grava arquivo, não
# manda para lugar nenhum, não deixa rastro em disco — o único lugar onde estes
# valores devem viver é o Dokploy.
#
# Rode num terminal seu. Se o segredo aparecer numa conversa, num print ou num
# commit, ele deixou de ser segredo e precisa ser gerado de novo.

set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl não encontrado. Alternativa com o mesmo efeito:" >&2
  echo "  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \\n'" >&2
  exit 1
fi

segredo() { openssl rand -hex 32; }

DOMINIO="${1:-https://consultoriaflowfoods.com.br}"
DOMINIO="${DOMINIO%/}"

SENHA_PG="$(openssl rand -hex 16)"

cat <<EOF
# ─────────────────────────────────────────────────────────────────────
#  Environment — cole no Dokploy, nos apps web E worker
#  Gerado em $(date '+%d/%m/%Y %H:%M')
#  NÃO cole isto em conversa, print ou commit.
# ─────────────────────────────────────────────────────────────────────

# --- Banco (o compose monta o DATABASE_URL a partir destes) ---
POSTGRES_USER=flowfoods
POSTGRES_PASSWORD=${SENHA_PG}
POSTGRES_DB=flowfoods

# --- Sessão e tokens ---
NEXTAUTH_SECRET=$(segredo)
NEXTAUTH_URL=${DOMINIO}
ADMIN_SETUP_TOKEN=$(segredo)
LEADS_IMPORT_TOKEN=$(segredo)

# --- WhatsApp ---
# Deixe as duas primeiras VAZIAS por enquanto: sem elas o portal entra em
# dry-run e não envia nada. Dá para treinar o fluxo inteiro assim, com
# segurança, antes de existir número conectado.
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=flowfoods-prospeccao
# So preencha se quiser receber as notificacoes por um numero DIFERENTE do que
# prospecta. Usando o proprio telefone, deixe vazio: o portal detecta e desliga
# as notificacoes sozinho, porque seriam mensagens para voce mesmo.
EVOLUTION_NOTIFY_INSTANCE=
EVOLUTION_WEBHOOK_SECRET=$(segredo)
RODOLFO_WHATSAPP=5521996416060

# --- IA (opcional) ---
# Sem a chave, o Inbox recebe as respostas normalmente — só não classifica
# nem sugere rascunho.
ANTHROPIC_API_KEY=
AI_DAILY_BUDGET_BRL=5
USD_BRL=5.40
EOF

cat >&2 <<'EOF'

─────────────────────────────────────────────────────────────────────
Depois de colar:

  1. Deploy. A migration roda sozinha no start do web.
  2. Abra  <seu-dominio>/rodolfo/setup?token=<ADMIN_SETUP_TOKEN>
     e defina sua senha. O token para de valer aí.
  3. Confira:  ./scripts/verificar-deploy.sh <seu-dominio>

Guarde o ADMIN_SETUP_TOKEN à mão até o passo 2 — depois ele não serve
para mais nada.
─────────────────────────────────────────────────────────────────────
EOF
