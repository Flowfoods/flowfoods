#!/bin/sh
#
# Carrega os segredos gerados pelo serviço `segredos` do docker-compose.
#
# É "fonte", não executável: web e worker fazem `. ./scripts/exportar-segredos.sh`
# no começo do comando de start. Este arquivo NÃO contém segredo nenhum — ele só
# lê os arquivos que o bootstrap gerou no volume — e por isso pode viver no Git.
#
# Precedência: o que o painel do Dokploy definir SEMPRE vence o arquivo do
# volume. Assim o zero-config funciona sozinho, e quem quiser fixar um valor
# (trocar um token, apontar outro banco) só preenche a variável no painel, sem
# mexer em volume.

seg() { cat "/segredos/$1" 2>/dev/null || true; }

export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$(seg nextauth_secret)}"
export ADMIN_SETUP_TOKEN="${ADMIN_SETUP_TOKEN:-$(seg admin_setup_token)}"
export LEADS_IMPORT_TOKEN="${LEADS_IMPORT_TOKEN:-$(seg leads_import_token)}"
export EVOLUTION_WEBHOOK_SECRET="${EVOLUTION_WEBHOOK_SECRET:-$(seg webhook_secret)}"

# Usuário e banco são fixos ("flowfoods") de propósito: a URL é montada aqui e
# no postgres do compose a partir do MESMO arquivo de senha. Quem precisar de
# outro banco define DATABASE_URL no painel, que vence tudo.
export DATABASE_URL="${DATABASE_URL:-postgresql://flowfoods:$(seg postgres_password)@postgres:5432/flowfoods?schema=public}"

export NEXTAUTH_URL="${NEXTAUTH_URL:-https://consultoriaflowfoods.com.br}"
