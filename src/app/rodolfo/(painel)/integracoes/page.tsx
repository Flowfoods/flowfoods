/**
 * Central de Integrações (INT-1.8, primeira parte; decisão 490) — nível 1. Os apps da FlowFoods no iFood (Client ID,
 * categoria, homologação, validade do token guardado), as últimas leituras de teste e, por parceiro, a liberação do módulo e
 * as lojas ligadas. O que é de cada parceiro é lido pelo portão dele (somente leitura, com RLS).
 *
 * Nada aqui chama o iFood. A saúde da sincronização (último D-1, atraso, 403, 429) entra quando a sincronização existir.
 */

import Link from 'next/link';
import { HistoricoRecolhivel } from '@/components/erp/telas/historico/historico-recolhivel';
import { prisma } from '@/lib/db';
import { exigirNivel1, leituraDoParceiro } from '@/lib/erp/contexto';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { COR } from '@/lib/erp/modulos';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { listarApps } from '@/lib/integracoes/core/apps';
import { ROTULO_DO_AMBIENTE, ROTULO_DO_MODULO } from '@/lib/integracoes/core/campos';
import { ultimasLeiturasDeTeste, validadeDosTokens } from '@/lib/integracoes/core/central';
import { conexoesDoParceiro } from '@/lib/integracoes/core/conexoes';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Aviso, Contagem, Painel, Ponto, Selo, Vazio } from '@/components/erp/ui/superficies';
import { FormCadastrarApp } from './forms';
import { diaBr, QUANDO, ROTULO_DA_CATEGORIA, ROTULO_DA_HOMOLOGACAO, ROTULO_DO_PASSO, TOM_DA_HOMOLOGACAO } from './rotulos';

export const dynamic = 'force-dynamic';

export default async function CentralDeIntegracoesPage() {
  await exigirNivel1();
  const [apps, tokens, leituras, parceiros] = await Promise.all([
    listarApps(),
    validadeDosTokens(),
    ultimasLeiturasDeTeste(5),
    prisma.parceiroFlow.findMany({ orderBy: [{ status: 'asc' }, { nome: 'asc' }], select: { id: true, slug: true, nome: true, status: true, homologacaoDeIntegracao: true } }),
  ]);
  const linhas = await Promise.all(
    parceiros.map(async (p) => {
      const c = leituraDoParceiro(p.id);
      const [liberado, conexoes] = await Promise.all([moduloLiberado(c, 'integracao'), conexoesDoParceiro(c)]);
      const ligadas = conexoes.filter((x) => x.estado === 'ATIVA');
      const ativos = ligadas.reduce((n, x) => n + x.modulos.filter((m) => m.estado === 'ATIVO').length, 0);
      const semPermissao = ligadas.reduce((n, x) => n + x.modulos.filter((m) => m.estado === 'ERRO_PERMISSAO').length, 0);
      return { p, liberado, ligadas: ligadas.length, ativos, semPermissao };
    }),
  );
  const agora = Date.now();

  return (
    <div className="space-y-6">
      <PageHeader icone="canais" cor={COR.parceiros} titulo="Integrações" subtitulo="Nível 1 · apps no iFood, lojas ligadas e liberação por parceiro" />

      <Aviso titulo="Nenhuma busca automática roda ainda">
        Hoje a única chamada ao iFood é a leitura de teste, feita por comando no servidor. A busca diária dos números chega numa próxima etapa; até lá, nada
        nesta tela chama o iFood.
      </Aviso>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-4">
          <Painel titulo="Apps no iFood" acessorio={<Contagem>{apps.length}</Contagem>} semRespiro>
            {apps.length === 0 ? (
              <Vazio titulo="Nenhum app cadastrado.">O app de teste entra sozinho na primeira leitura de teste. O app de produção, você cadastra ao lado quando ele existir no iFood.</Vazio>
            ) : (
              <ul className="divide-y divide-linha">
                {apps.map((a) => {
                  const t = tokens.get(a.id);
                  const valido = t && t.expiraEm.getTime() > agora;
                  return (
                    <li key={a.id} className="space-y-2 px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-texto">{a.nome}</span>
                        <Selo tom={a.ambiente === 'TEST' ? 'alerta' : 'neutro'}>{ROTULO_DO_AMBIENTE[a.ambiente]}</Selo>
                        <Selo tom={TOM_DA_HOMOLOGACAO[a.estadoHomologacao]}>{ROTULO_DA_HOMOLOGACAO[a.estadoHomologacao]}</Selo>
                      </div>
                      <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_minmax(0,1fr)]">
                        <dt className="text-suave">Client ID</dt>
                        <dd className="break-all font-mono text-texto">{a.clientId}</dd>
                        <dt className="text-suave">Categoria</dt>
                        <dd className="text-texto">{ROTULO_DA_CATEGORIA[a.categoria]}</dd>
                        <dt className="text-suave">Módulos</dt>
                        <dd className="text-texto">{a.modulos.map((m) => ROTULO_DO_MODULO[m]).join(', ')}</dd>
                        <dt className="text-suave">Segredo</dt>
                        <dd className="break-all text-texto">
                          no cofre do servidor, como <span className="font-mono">{a.nomeDoSegredo}</span>
                        </dd>
                        <dt className="text-suave">Acesso guardado</dt>
                        <dd className="text-texto">{!t ? 'nenhum ainda' : valido ? `vale até ${QUANDO.format(t.expiraEm)}` : `venceu em ${QUANDO.format(t.expiraEm)}; a próxima leitura pede outro`}</dd>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </Painel>

          <Painel titulo="Parceiros" acessorio={<Contagem>{parceiros.length}</Contagem>} semRespiro>
            {linhas.length === 0 ? (
              <Vazio titulo="Nenhum Parceiro Flow ainda." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-forte text-left text-[12px] text-suave">
                    <th scope="col" className="h-10 px-4 font-semibold sm:px-5">
                      Parceiro
                    </th>
                    <th scope="col" className="h-10 w-20 px-2 text-right font-semibold">
                      Lojas ligadas
                    </th>
                    <th scope="col" className="hidden h-10 w-24 px-4 text-right font-semibold sm:table-cell sm:px-5">
                      Módulos ativos
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {linhas.map(({ p, liberado, ligadas, ativos, semPermissao }) => {
                    const s = STATUS_DO_PARCEIRO[p.status];
                    return (
                      <tr key={p.id} className="ff-transicao relative border-t border-linha hover:bg-texto/[0.03]">
                        <td className="max-w-0 px-4 py-3 sm:px-5">
                          <Link href={`/rodolfo/integracoes/${p.slug}`} className="block truncate font-medium text-texto after:absolute after:inset-0">
                            {p.nome}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-suave">
                            <Ponto tom={s.tom} />
                            <span>{s.rotulo}</span>
                            <span aria-hidden>·</span>
                            <span className={liberado ? 'text-ok' : ''}>{liberado ? 'Integração liberada' : 'Integração bloqueada'}</span>
                            {p.homologacaoDeIntegracao && (
                              <>
                                <span aria-hidden>·</span>
                                <span className="text-atencao">Parceiro de testes</span>
                              </>
                            )}
                            {semPermissao > 0 && (
                              <>
                                <span aria-hidden>·</span>
                                <span className="text-erro">
                                  {semPermissao} {semPermissao === 1 ? 'módulo sem permissão' : 'módulos sem permissão'}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right font-display text-lg font-bold">{ligadas}</td>
                        <td className="hidden px-4 py-3 text-right font-display text-lg font-bold sm:table-cell sm:px-5">{ativos}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Painel>
        </div>

        <div className="min-w-0 space-y-4">
          <Painel titulo="Últimas leituras de teste">
            {leituras.length === 0 ? (
              <p className="text-sm text-suave">
                Nenhuma leitura de teste ainda. Ela roda por comando quando o segredo do app de teste e a chave geral estiverem no painel do servidor.
              </p>
            ) : (
              <>
              <p className="mb-3 text-[13px] text-suave">Última leitura: <strong className={leituras[0].ok ? 'font-semibold text-ok' : 'font-semibold text-erro'}>{leituras[0].ok ? 'deu certo' : 'falhou'}</strong>, {QUANDO.format(leituras[0].quando)}.</p>
              <HistoricoRecolhivel chave="nivel1/leituras-test" titulo="Leituras registradas" quantidade={leituras.length} embutido>
              <ol className="space-y-4">
                {leituras.map((l, i) => (
                  <li key={`${l.quando.toISOString()}-${i}`} className="space-y-1.5 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Selo tom={l.ok ? 'ok' : 'erro'}>{l.ok ? 'Deu certo' : 'Falhou'}</Selo>
                      <span className="text-suave">{QUANDO.format(l.quando)}</span>
                    </div>
                    <p className="text-texto">
                      Dia {diaBr(l.dia)}
                      {l.loja ? (
                        <>
                          {' '}
                          · loja <span className="break-all font-mono">{l.loja}</span>
                        </>
                      ) : null}
                    </p>
                    <ul className="space-y-0.5 text-suave">
                      {l.passos.map((p) => (
                        <li key={p.nome} className="break-all">
                          {ROTULO_DO_PASSO[p.nome] ?? p.nome}: {p.status === null ? 'sem resposta' : `HTTP ${p.status}`}
                          {p.requestId ? ` · código do pedido ${p.requestId}` : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
              </HistoricoRecolhivel>
              </>
            )}
          </Painel>

          <Painel titulo="Cadastrar app">
            <FormCadastrarApp />
          </Painel>
        </div>
      </div>
    </div>
  );
}
