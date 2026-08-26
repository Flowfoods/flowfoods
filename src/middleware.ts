import { NextResponse, type NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import comSessao from 'next-auth/middleware';

/**
 * Duas travas, nesta ordem:
 *
 * 1. SEM BANCO → "em configuração". A master serve o site institucional num
 *    app que (ainda) não tem DATABASE_URL. Sem esta trava, /rodolfo subiria
 *    junto com o site e estouraria 500 em toda tela na primeira visita. Com
 *    ela, o site continua intacto e a área privada responde 503 honesto até o
 *    Postgres ser apontado no painel.
 *
 * 2. COM BANCO → sessão. Tudo sob /rodolfo exige login — menos /rodolfo/login
 *    (que seria um laço) e /rodolfo/setup (que se autentica pelo
 *    ADMIN_SETUP_TOKEN, e existe justamente porque ainda não há senha).
 *
 * O site institucional não passa por aqui: o matcher é só o /rodolfo.
 */

const PAGINA_EM_CONFIGURACAO = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Em configuração — FlowFoods</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0f1a14;color:#e8efe9;
       display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
  main{max-width:26rem;text-align:center}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{margin:.25rem 0;color:#b7c6bc;line-height:1.5}
  a{color:#7fc8a9}
</style></head>
<body><main>
  <h1>Área privada em configuração</h1>
  <p>Esta parte do portal ainda está sendo ligada à infraestrutura.</p>
  <p>O site continua no ar em <a href="/">consultoriaflowfoods.com.br</a>.</p>
</main></body></html>`;

const SEM_SESSAO = new Set(['/rodolfo/login', '/rodolfo/setup']);

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  // Lido a cada request (não no escopo do módulo): em self-host o middleware
  // enxerga o env do processo em runtime, e é isso que faz o gate desligar
  // sozinho no instante em que o painel ganhar a DATABASE_URL.
  if (!process.env.DATABASE_URL) {
    return new NextResponse(PAGINA_EM_CONFIGURACAO, {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Retry-After': '3600',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  const { pathname } = req.nextUrl;
  if (SEM_SESSAO.has(pathname)) return NextResponse.next();

  // O default do next-auth/middleware também funciona chamado à mão — é o
  // mesmo objeto, só que decidimos NÓS quando ele entra.
  return (comSessao as unknown as (r: NextRequest, e: NextFetchEvent) => Response)(req, event);
}

export const config = {
  matcher: ['/rodolfo', '/rodolfo/:path*'],
};
