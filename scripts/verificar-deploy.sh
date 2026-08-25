#!/usr/bin/env bash
#
# Verificação pós-deploy do Espaço do Rodolfo + Barney.
#
# Rode DEPOIS de subir o `web` no Dokploy. Cada checagem diz o que significa e
# o que fazer — a saída inteira pode ser colada numa conversa para diagnóstico.
#
#   ./scripts/verificar-deploy.sh
#   ./scripts/verificar-deploy.sh https://staging.consultoriaflowfoods.com.br
#
# NÃO envia mensagem, NÃO cria instância, NÃO altera nada. Só lê.
# Nenhum segredo é impresso: o script reporta "definida" ou "ausente".

set -uo pipefail

BASE="${1:-https://consultoriaflowfoods.com.br}"
BASE="${BASE%/}"

verde=$'\033[0;32m'; vermelho=$'\033[0;31m'; amarelo=$'\033[0;33m'; zero=$'\033[0m'
ok=0; falhou=0; alerta=0

titulo() { printf '\n\033[1m%s\033[0m\n' "$1"; }
passou() { printf '  %s✓%s %s\n' "$verde" "$zero" "$1"; ok=$((ok + 1)); }
errou()  { printf '  %s✗%s %s\n' "$vermelho" "$zero" "$1"; falhou=$((falhou + 1)); }
avisou() { printf '  %s!%s %s\n' "$amarelo" "$zero" "$1"; alerta=$((alerta + 1)); }

# HTTP status de uma URL, ou 000 se não respondeu.
#
# O `-w '%{http_code}'` do curl JÁ imprime 000 quando a conexão falha. Um
# `|| echo 000` aqui concatenaria e produziria "000000" — que não casa com
# nenhum `case` e faz toda checagem cair no ramo genérico.
status() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1" 2>/dev/null)
  printf '%s' "${code:-000}"
}

printf '\033[1mVerificando %s\033[0m\n' "$BASE"

# ---------------------------------------------------------------- site público
titulo '1. Site institucional'
s=$(status "$BASE/")
case "$s" in
  200) passou "/ responde 200 — o site continua no ar" ;;
  000) errou  "/ não respondeu. DNS, TLS ou o app não subiu" ;;
  *)   errou  "/ respondeu $s (esperado 200)" ;;
esac

# ------------------------------------------------------------------- webhook
titulo '2. Webhook da Evolution'
corpo=$(curl -s --max-time 20 "$BASE/api/webhooks/evolution" 2>/dev/null || true)
if printf '%s' "$corpo" | grep -q '"ok":true'; then
  passou 'GET /api/webhooks/evolution responde — app e rota de pé'
elif printf '%s' "$corpo" | grep -qi 'sem segredo'; then
  errou 'Rota de pé mas EVOLUTION_WEBHOOK_SECRET não está no env'
else
  errou "GET do webhook não respondeu o esperado. Recebido: ${corpo:0:120}"
fi

# O POST sem segredo TEM que ser recusado. Se passar, o webhook está aberto —
# qualquer um poderia injetar resposta de lead e opt-out.
s=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
      -X POST -H 'Content-Type: application/json' -d '{"event":"noop"}' \
      "$BASE/api/webhooks/evolution" 2>/dev/null)
s=${s:-000}
case "$s" in
  401) passou 'POST sem segredo é recusado (401) — webhook fechado' ;;
  503) avisou 'POST devolve 503: falta EVOLUTION_WEBHOOK_SECRET no env' ;;
  200) errou  'POST SEM SEGREDO FOI ACEITO. Webhook aberto — corrija antes de usar' ;;
  000) errou  'POST não respondeu — o app não está no ar' ;;
  *)   avisou "POST devolveu $s (esperado 401)" ;;
esac

# -------------------------------------------------------------------- import
titulo '3. Rota de importação'
s=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
      -X POST -H 'Content-Type: application/json' -d '{}' \
      "$BASE/api/leads/import" 2>/dev/null)
s=${s:-000}
case "$s" in
  401) passou 'POST sem token é recusado (401)' ;;
  503) avisou 'Falta LEADS_IMPORT_TOKEN (ou ADMIN_SETUP_TOKEN) no env' ;;
  200) errou  'IMPORTAÇÃO SEM TOKEN FOI ACEITA. Corrija antes de usar' ;;
  000) errou  'Não respondeu — o app não está no ar' ;;
  *)   avisou "Devolveu $s (esperado 401)" ;;
esac

# ---------------------------------------------------------------- área privada
titulo '4. Espaço do Rodolfo'
s=$(status "$BASE/rodolfo/login")
[ "$s" = '200' ] && passou '/rodolfo/login abre' || errou "/rodolfo/login devolveu $s"

# Sem sessão, /rodolfo tem que redirecionar para o login. 200 aqui significaria
# painel exposto.
s=$(status "$BASE/rodolfo")
case "$s" in
  200) errou  '/rodolfo ABRIU SEM SESSÃO. O middleware não está protegendo' ;;
  30*|401|403) passou "/rodolfo exige sessão (HTTP $s)" ;;
  000) errou  '/rodolfo não respondeu — o app não está no ar' ;;
  *)   avisou "/rodolfo devolveu $s" ;;
esac

# ----------------------------------------------------------------- indexação
titulo '5. Buscador'
if curl -s --max-time 20 "$BASE/rodolfo/login" 2>/dev/null | grep -qi 'noindex'; then
  passou 'Área privada marcada como noindex'
else
  avisou 'Não achei noindex no HTML do login — confira o metadata'
fi

# -------------------------------------------------- env local (só se houver)
if [ -n "${DATABASE_URL:-}" ]; then
  titulo '6. Banco (a partir deste terminal)'
  if command -v npx >/dev/null 2>&1; then
    if npx --no-install prisma migrate status >/tmp/migrate-status.txt 2>&1; then
      passou 'Migrations aplicadas'
    else
      if grep -qi 'not yet been applied\|pending' /tmp/migrate-status.txt; then
        errou 'Há migration PENDENTE. Rode: npm run db:migrate'
      else
        avisou "prisma migrate status falhou: $(head -1 /tmp/migrate-status.txt)"
      fi
    fi
    rm -f /tmp/migrate-status.txt
  fi
fi

# ---------------------------------------------------------------- resumo
titulo 'Resumo'
printf '  %d ok · %d alerta(s) · %d falha(s)\n' "$ok" "$alerta" "$falhou"

if [ "$falhou" -gt 0 ]; then
  printf '\n%sNão está pronto para uso.%s Veja docs/DEPLOY_DOKPLOY.md, seção "Se der errado".\n' \
    "$vermelho" "$zero"
  exit 1
fi

printf '\n%sDeploy de pé.%s Próximo: parear o QR, 10 envios manuais, e só então ligar o disparo.\n' \
  "$verde" "$zero"
printf 'Confira também, no navegador: montar lote → dry-run → ler o texto de uma mensagem.\n'
exit 0
