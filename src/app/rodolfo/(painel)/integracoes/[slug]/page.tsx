/**
 * Central de Integrações (INT-1.8, primeira parte; decisão 490) — um parceiro, no nível 1: liberação do módulo Integração,
 * marca de parceiro de testes, lojas do iFood ligadas às Lojas e marcas dele, o estado de cada módulo e o histórico. Tudo do
 * parceiro passa pelo portão dele (`exigirParceiro`); parceiro suspenso ou em rascunho só lê.
 *
 * Nada aqui chama o iFood: a única chamada é o comando da leitura de teste.
 */

import Link from 'next/link';
import { exigirParceiro } from '@/lib/erp/contexto';
import { ENTIDADES_DE_INTEGRACAO, listarHistorico } from '@/lib/erp/historico';
import { liberacoesDoParceiro } from '@/lib/erp/liberacao';
import { COR } from '@/lib/erp/modulos';
import { listarApps } from '@/lib/integracoes/core/apps';
import { ROTULO_DO_AMBIENTE, ROTULO_DO_MODULO } from '@/lib/integracoes/core/campos';
import { conexoesDoParceiro } from '@/lib/integracoes/core/conexoes';
import { ROTULO_DO_ESTADO, transicao } from '@/lib/integracoes/core/estados';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso, Contagem, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { ListaHistorico } from '@/components/erp/telas/historico/lista-historico';
import { FormAcaoDoModulo, FormDesligar, FormHomologacao, FormLiberacao, FormLigarLoja, FormPrepararModulo } from '../forms';
import { ACOES_NA_TELA, QUANDO, TOM_DO_ESTADO } from '../rotulos';

export const dynamic = 'force-dynamic';

export default async function IntegracoesDoParceiroNoNivel1({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  const { parceiro, cliente } = ctx;
  const [liberacoes, conexoes, apps, lojas, marcas, historico] = await Promise.all([
    liberacoesDoParceiro(cliente),
    conexoesDoParceiro(cliente),
    listarApps(),
    cliente.loja.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    cliente.marca.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    listarHistorico(cliente, { entidades: [...ENTIDADES_DE_INTEGRACAO], verIntegracao: true, verPrecos: false, limite: 20 }),
  ]);
  const integracao = liberacoes.find((l) => l.modulo === 'integracao');
  const liberado = integracao?.liberado ?? false;
  const ambiente = parceiro.homologacaoDeIntegracao ? 'TEST' : 'PRODUCAO';
  const appPorId = new Map(apps.map((a) => [a.id, a]));
  const ligadas = conexoes.filter((c) => c.estado === 'ATIVA');
  const desligadas = conexoes.filter((c) => c.estado === 'DESLIGADA');
  const podeEscrever = ctx.podeEscrever;

  return (
    <div className="space-y-6">
      <PageHeader
        icone="canais"
        cor={COR.parceiros}
        titulo={`Integrações · ${parceiro.nome}`}
        subtitulo={
          <>
            Nível 1 ·{' '}
            <Link href="/rodolfo/integracoes" className={LINK_DE_TEXTO}>
              todas as integrações
            </Link>
          </>
        }
      />

      {ctx.bloqueio && <Aviso tom="alerta" titulo="Só leitura">{ctx.bloqueio}</Aviso>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-4">
          <Painel titulo="Lojas do iFood ligadas" acessorio={<Contagem>{ligadas.length}</Contagem>} semRespiro>
            {ligadas.length === 0 ? (
              <Vazio titulo="Nenhuma loja do iFood ligada.">Ligue abaixo a loja do iFood à Loja do parceiro. Ligar não busca nada: os módulos é que dizem o que será lido.</Vazio>
            ) : (
              <ul className="divide-y divide-linha">
                {ligadas.map((c) => {
                  const usados = new Set(c.modulos.map((m) => m.modulo));
                  const opcoes = apps
                    .filter((a) => a.provedor === c.provedor && a.ambiente === c.ambiente)
                    .flatMap((a) => a.modulos.filter((m) => !usados.has(m)).map((m) => ({ valor: `${a.id}|${m}`, rotulo: `${ROTULO_DO_MODULO[m]} · ${a.nome}` })));
                  return (
                    <li key={c.id} className="space-y-4 px-4 py-4 sm:px-5">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-texto">{c.nomeExterno}</span>
                          <Selo tom={c.ambiente === 'TEST' ? 'alerta' : 'neutro'}>{ROTULO_DO_AMBIENTE[c.ambiente]}</Selo>
                        </div>
                        <p className="text-[13px] text-suave">
                          Loja {c.loja.nome}
                          {c.marca ? ` · marca ${c.marca.nome}` : ''} · ligada por {c.criadoPorNome} em {QUANDO.format(c.criadoEm)}
                        </p>
                        <p className="break-all font-mono text-[12px] text-suave">
                          {c.idExterno}
                          {c.idCurto ? ` · ${c.idCurto}` : ''}
                        </p>
                      </div>

                      {c.modulos.length === 0 ? (
                        <p className="text-[13px] text-suave">Nenhum módulo preparado nesta loja.</p>
                      ) : (
                        <ul className="space-y-3">
                          {c.modulos.map((m) => {
                            const app = appPorId.get(m.appId);
                            const semHomologacao = c.ambiente === 'PRODUCAO' && app?.estadoHomologacao !== 'HOMOLOGADO';
                            const acoes = ACOES_NA_TELA.filter((a) => {
                              if (transicao(m.estado, a.acao, c.ambiente) === null) return false;
                              // No teste a loja já vem autorizada: pedido de acesso não se aplica.
                              if (c.ambiente === 'TEST' && (a.acao === 'solicitar' || a.acao === 'cancelar-pedido')) return false;
                              if (semHomologacao && (a.acao === 'ativar' || a.acao === 'retomar')) return false;
                              return true;
                            });
                            return (
                              <li key={m.id} className="space-y-2 rounded-[9px] border border-linha p-3">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="font-medium text-texto">{ROTULO_DO_MODULO[m.modulo]}</span>
                                  <Selo tom={TOM_DO_ESTADO[m.estado]}>{ROTULO_DO_ESTADO[m.estado]}</Selo>
                                  <span className="text-[12px] text-suave">pelo app {app?.nome ?? 'desconhecido'}</span>
                                </div>
                                {m.ultimoErro && m.estado === 'ERRO_PERMISSAO' && <p className="text-[13px] text-erro">{m.ultimoErro}</p>}
                                {semHomologacao && (m.estado === 'AUTORIZADO' || m.estado === 'PAUSADO') && (
                                  <p className="text-[13px] text-suave">Em produção, só ativa depois que o app for homologado pelo iFood.</p>
                                )}
                                {podeEscrever && acoes.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {acoes.map((a) => (
                                      <FormAcaoDoModulo key={a.acao} slug={parceiro.slug} moduloId={m.id} acao={a.acao} rotulo={a.rotulo} />
                                    ))}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {podeEscrever && (
                        <div className="space-y-4 border-t border-linha pt-4">
                          <FormPrepararModulo slug={parceiro.slug} conexaoId={c.id} opcoes={opcoes} />
                          <FormDesligar slug={parceiro.slug} conexaoId={c.id} nome={c.nomeExterno} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Painel>

          {podeEscrever && (
            <Painel titulo="Ligar loja do iFood">
              {lojas.length === 0 ? (
                <p className="text-sm text-suave">Este parceiro ainda não tem loja cadastrada. Cadastre a loja no ERP dele antes de ligar.</p>
              ) : (
                <FormLigarLoja slug={parceiro.slug} lojas={lojas} marcas={marcas} ambienteRotulo={ROTULO_DO_AMBIENTE[ambiente]} />
              )}
            </Painel>
          )}

          {desligadas.length > 0 && (
            <Painel titulo="Ligações desligadas" acessorio={<Contagem>{desligadas.length}</Contagem>}>
              <ul className="space-y-2 text-[13px] text-suave">
                {desligadas.map((c) => (
                  <li key={c.id}>
                    {c.nomeExterno} · loja {c.loja.nome} · {ROTULO_DO_AMBIENTE[c.ambiente]}
                  </li>
                ))}
              </ul>
            </Painel>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Painel titulo="Módulo Integração">
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Selo tom={liberado ? 'ok' : 'neutro'}>{liberado ? 'Liberado' : 'Bloqueado'}</Selo>
                {integracao?.mudadoEm && (
                  <span className="text-[12px] text-suave">
                    desde {QUANDO.format(integracao.mudadoEm)}
                    {integracao.mudadoPorNome ? `, por ${integracao.mudadoPorNome}` : ''}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-suave">
                Liberado, o parceiro vê as integrações dele (com a permissão de cada pessoa) e a busca pode rodar nas lojas com módulo ativo. Bloqueado, nada roda e
                nada é apagado.
              </p>
              {podeEscrever && <FormLiberacao slug={parceiro.slug} liberado={liberado} />}
            </div>
          </Painel>

          <Painel titulo="Parceiro de testes">
            <div className="space-y-3 text-sm">
              <Selo tom={parceiro.homologacaoDeIntegracao ? 'alerta' : 'neutro'}>{parceiro.homologacaoDeIntegracao ? 'Marcado: só ambiente de teste' : 'Não marcado: só produção'}</Selo>
              <p className="text-[13px] text-suave">
                A loja de teste do iFood só pode ser ligada num parceiro marcado, criado só para isso. Dado de teste nunca entra num restaurante de verdade. Com loja
                ligada, a marca não muda.
              </p>
              <FormHomologacao slug={parceiro.slug} marcado={parceiro.homologacaoDeIntegracao} />
            </div>
          </Painel>

          <Painel titulo="Histórico das integrações">
            {historico.length === 0 ? <p className="text-sm text-suave">Nada mudou ainda nas integrações deste parceiro.</p> : <ListaHistorico linhas={historico} compacta />}
          </Painel>
        </div>
      </div>
    </div>
  );
}
