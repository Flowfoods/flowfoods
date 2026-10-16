/**
 * Tela de Equipe — a MESMA para o nível 1 (aba Acessos em
 * /rodolfo/erp/<slug>/acessos) e para quem cuida da equipe no parceiro
 * (/erp/equipe). Recebe os dados já lidos e as actions de quem usa; decide só o
 * que MOSTRAR (botão que não vai passar nem aparece). Quem decide de verdade é
 * o servidor (`credenciais.ts`: sem escalada, último administrador).
 */

import Link from 'next/link';
import type { LinhaDeAcesso, LinhaDePerfil } from '@/lib/erp/credenciais';
import type { LinhaDeHistorico } from '@/lib/erp/historico';
import { PREFIXO_PERFIL_PROPRIO } from '@/lib/erp/equipe';
import {
  cobre,
  ehSetor,
  LISTA_DE_SETORES,
  ORDEM_DOS_PERFIS_BASE,
  PERFIS_BASE,
  rotuloDaPermissao,
  SETORES,
  TODAS_AS_PERMISSOES,
  type Alcance,
} from '@/lib/erp/permissoes';
import { ListaHistorico } from '../historico-lista';
import { Metrica, Painel, Ponto, Vazio } from '../ui';
import { AcoesDaPessoa } from './acoes-pessoa';
import type { AcaoDeEquipe, EstadoEquipe } from './estado';
import { Expansivel } from './expansivel';
import { FormPerfil } from './form-perfil';
import { FormPessoa, type OpcaoDeLoja, type OpcaoDePerfil } from './form-pessoa';

type ComId = (id: string, anterior: EstadoEquipe, form: FormData) => Promise<EstadoEquipe>;

export interface AcoesDaEquipe {
  criar: AcaoDeEquipe;
  atualizar: ComId;
  gerarLink: ComId;
  desativar: ComId;
  reativar: ComId;
  /** Só o nível 1. */
  liberar?: ComId;
  salvarPerfil: AcaoDeEquipe;
  excluirPerfil: ComId;
}

const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
const quando = (d: Date) => QUANDO.format(d).replace(',', ' às');

const SEGMENTO =
  'whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[12px] text-surface/55 transition hover:text-surface aria-[current=true]:bg-white/[0.1] aria-[current=true]:text-surface';

export function TelaEquipe({
  aba,
  hrefBase,
  setor,
  pessoas: todas,
  perfis,
  lojas,
  ator,
  acoes,
  bloqueio,
  historico,
  historicoHref,
}: {
  aba: 'pessoas' | 'perfis';
  hrefBase: string;
  setor?: string;
  pessoas: LinhaDeAcesso[];
  perfis: LinhaDePerfil[];
  /** Lojas que o ATOR alcança (o resto nem aparece). */
  lojas: OpcaoDeLoja[];
  ator: { alcance: Alcance; acessoId: string | null };
  acoes: AcoesDaEquipe;
  /** Parceiro suspenso/aguardando para a pessoa do parceiro (nível 1 não tem). */
  bloqueio: string | null;
  /** Só para quem vê a rede inteira (o histórico cita lojas e pessoas de toda a rede). */
  historico?: LinhaDeHistorico[];
  historicoHref?: string;
}) {
  const nivel1 = ator.alcance.nivel === 'FLOWFOODS';
  const atorRede = ator.alcance.lojas === 'todas';
  const minhas = new Set(lojas.map((l) => l.id));
  const nomes = new Map(lojas.map((l) => [l.id, l.nome]));
  const concediveis = TODAS_AS_PERMISSOES.filter((p) => ator.alcance.permissoes.has(p));
  const escreve = !bloqueio;

  // Quem só tem algumas lojas vê quem trabalha nelas (e quem tem a rede), não o resto.
  const visiveis = atorRede ? todas : todas.filter((p) => p.redeInteira || p.lojaIds.some((l) => minhas.has(l)));
  const filtro = ehSetor(setor) ? setor : undefined;
  const pessoas = filtro ? visiveis.filter((p) => p.setores.includes(filtro)) : visiveis;
  const setoresEmUso = LISTA_DE_SETORES.filter((s) => visiveis.some((p) => p.setores.includes(s)));

  const opcoesDePerfil: OpcaoDePerfil[] = [
    ...ORDEM_DOS_PERFIS_BASE.map((b) => ({
      valor: b,
      rotulo: PERFIS_BASE[b].rotulo,
      resumo: PERFIS_BASE[b].resumo,
      permissoes: [...PERFIS_BASE[b].permissoes],
      setores: [],
      proprio: false,
    })),
    ...perfis.map((p) => ({
      valor: `${PREFIXO_PERFIL_PROPRIO}${p.id}`,
      rotulo: p.nome,
      resumo: `Copiado de ${PERFIS_BASE[p.base].rotulo.toLowerCase()} · ${p.permissoes.length} de ${TODAS_AS_PERMISSOES.length} funções${
        p.setores.length ? ` · ${p.setores.map((s) => SETORES[s]).join(', ')}` : ''
      }`,
      permissoes: p.permissoes,
      setores: p.setores,
      proprio: true,
    })),
  ];

  const ativas = visiveis.filter((p) => p.status === 'ATIVO').length;
  const admins = visiveis.filter((p) => p.administrador).length;

  function rotuloDeLojas(p: LinhaDeAcesso) {
    if (p.redeInteira) return 'Rede inteira';
    const vistas = p.lojaIds.filter((l) => nomes.has(l)).map((l) => nomes.get(l)!);
    const fora = p.lojaIds.length - vistas.length;
    return [vistas.join(', '), fora > 0 ? `+${fora} ${fora === 1 ? 'loja' : 'lojas'}` : ''].filter(Boolean).join(' ');
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
        <Metrica rotulo="Pessoas ativas" valor={ativas} detalhe={`${visiveis.length - ativas} desativadas`} />
        <Metrica
          rotulo="Cuidam da equipe"
          valor={admins}
          detalhe={admins === 1 ? 'pessoa com a rede inteira' : 'pessoas com a rede inteira'}
        />
        <Metrica rotulo="Perfis próprios" valor={perfis.length} detalhe="além de dono, gerente e operador" />
      </div>

      <nav
        aria-label="Equipe"
        className="flex max-w-full gap-1 overflow-x-auto rounded-[9px] border border-white/[0.09] bg-[#131211] p-1 sm:w-max"
      >
        <Link href={hrefBase} aria-current={aba === 'pessoas' ? 'true' : undefined} className={SEGMENTO}>
          Pessoas <span className="tabular-nums text-surface/40">{visiveis.length}</span>
        </Link>
        <Link href={`${hrefBase}?ver=perfis`} aria-current={aba === 'perfis' ? 'true' : undefined} className={SEGMENTO}>
          Perfis <span className="tabular-nums text-surface/40">{perfis.length + 3}</span>
        </Link>
      </nav>
      {aba === 'pessoas' && !bloqueio && (
        <a
          href="#nova-pessoa"
          className="-mt-2 inline-block rounded-[7px] bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark lg:hidden"
        >
          Nova pessoa
        </a>
      )}

      {aba === 'pessoas' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
          <div className="min-w-0 space-y-4">
            <Painel
              titulo="Pessoas com acesso"
              acessorio={
                <span className="text-[11px] tabular-nums text-surface/40">
                  {pessoas.length} {pessoas.length === 1 ? 'pessoa' : 'pessoas'}
                </span>
              }
              semRespiro
            >
              {setoresEmUso.length > 0 && (
                <nav
                  aria-label="Filtrar por setor"
                  className="flex gap-1.5 overflow-x-auto border-b border-white/[0.07] px-5 py-3"
                >
                  <Link
                    href={hrefBase}
                    aria-current={!filtro ? 'true' : undefined}
                    className="whitespace-nowrap rounded-full border border-white/[0.12] px-3 py-1 text-[12px] text-surface/60 transition hover:text-surface aria-[current=true]:border-surface aria-[current=true]:bg-surface aria-[current=true]:font-semibold aria-[current=true]:text-footer"
                  >
                    Todos os setores
                  </Link>
                  {setoresEmUso.map((s) => (
                    <Link
                      key={s}
                      href={`${hrefBase}?setor=${s}`}
                      aria-current={filtro === s ? 'true' : undefined}
                      className="whitespace-nowrap rounded-full border border-white/[0.12] px-3 py-1 text-[12px] text-surface/60 transition hover:text-surface aria-[current=true]:border-surface aria-[current=true]:bg-surface aria-[current=true]:font-semibold aria-[current=true]:text-footer"
                    >
                      {SETORES[s]}
                    </Link>
                  ))}
                </nav>
              )}
              {pessoas.length === 0 ? (
                <Vazio titulo={filtro ? `Ninguém de ${SETORES[filtro]} ainda.` : 'Ninguém do parceiro entra ainda.'}>
                  {filtro
                    ? 'Marque o setor no acesso da pessoa.'
                    : 'Crie o primeiro acesso ao lado e mande o link para a pessoa.'}
                </Vazio>
              ) : (
                <ul>
                  {pessoas.map((a) => {
                    const desativado = a.status === 'DESATIVADO';
                    const tom = desativado ? 'suspenso' : a.senhaDefinida ? 'ativo' : 'rascunho';
                    const rotulo = desativado ? 'Desativado' : a.senhaDefinida ? 'Ativo' : 'Aguardando senha';
                    const mexe = escreve && cobre(ator.alcance, a.alcance);
                    const eu = a.acessoId === ator.acessoId;
                    const linkLiberado = nivel1 || !a.emOutroParceiro;
                    return (
                      <li
                        key={a.acessoId}
                        className="space-y-3 border-t border-white/[0.06] px-5 py-4 first:border-t-0"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                          <div className="min-w-0">
                            <div className={`font-medium ${desativado ? 'text-surface/50' : 'text-surface'}`}>
                              {a.nome}
                              {eu && <span className="ml-2 text-[11px] font-normal text-surface/40">você</span>}
                            </div>
                            <div className="truncate text-[12px] text-surface/45">{a.email}</div>
                          </div>
                          <div className="flex items-center gap-2 text-[12px] text-surface/70">
                            <Ponto tom={tom} />
                            {rotulo}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                          <span className="font-semibold text-surface">{a.perfilRotulo}</span>
                          <span aria-hidden className="text-surface/25">
                            ·
                          </span>
                          <span className="text-surface/70">{rotuloDeLojas(a)}</span>
                          {a.setores.length > 0 && (
                            <>
                              <span aria-hidden className="text-surface/25">
                                ·
                              </span>
                              <span className="text-surface/55">{a.setores.map((s) => SETORES[s]).join(', ')}</span>
                            </>
                          )}
                          {a.administrador && (
                            <span className="ml-1 rounded-full border border-white/[0.14] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-surface/60">
                              Cuida da equipe
                            </span>
                          )}
                        </div>
                        {(a.permissoesExtras.length > 0 || a.permissoesRemovidas.length > 0) && (
                          <p className="text-[12px] leading-relaxed text-surface/50">
                            {a.permissoesExtras.length > 0 && (
                              <span>
                                Pode a mais:{' '}
                                <span className="text-surface/75">
                                  {a.permissoesExtras.map(rotuloDaPermissao).join('; ')}
                                </span>
                                .{' '}
                              </span>
                            )}
                            {a.permissoesRemovidas.length > 0 && (
                              <span>
                                Tirado do perfil:{' '}
                                <span className="text-surface/75">
                                  {a.permissoesRemovidas.map(rotuloDaPermissao).join('; ')}
                                </span>
                                .
                              </span>
                            )}
                          </p>
                        )}
                        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-surface/50">
                          <div>
                            <dt className="inline">Último acesso: </dt>
                            <dd className="inline tabular-nums text-surface/70">
                              {a.ultimoLogin ? quando(a.ultimoLogin) : 'nunca entrou'}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Entrar com o rosto: </dt>
                            <dd className="inline text-surface/70">
                              {a.rostos === 0 ? 'não ativou' : a.rostos === 1 ? '1 aparelho' : `${a.rostos} aparelhos`}
                            </dd>
                          </div>
                          {a.linkValeAte && !desativado && (
                            <div>
                              <dt className="inline">Link vale até: </dt>
                              <dd className="inline tabular-nums text-surface/70">{quando(a.linkValeAte)}</dd>
                            </div>
                          )}
                          {a.bloqueada && nivel1 && (
                            <div>
                              <dt className="inline">Entrada: </dt>
                              <dd className="inline text-bright">bloqueada por senha errada</dd>
                            </div>
                          )}
                        </dl>
                        {mexe ? (
                          <AcoesDaPessoa
                            nome={a.nome}
                            status={a.status}
                            formulario={
                              <FormPessoa
                                acao={acoes.atualizar.bind(null, a.acessoId)}
                                modo="editar"
                                nome={a.nome}
                                cuidavaDaEquipe={a.alcance.permissoes.has('acessos.gerir')}
                                idBase={`editar-${a.acessoId}`}
                                perfis={opcoesDePerfil}
                                lojas={lojas}
                                concediveis={concediveis}
                                atorRede={atorRede}
                                inicial={{
                                  perfil: a.perfilBase ?? `${PREFIXO_PERFIL_PROPRIO}${a.perfilId}`,
                                  setores: a.setores,
                                  redeInteira: a.redeInteira,
                                  lojaIds: a.lojaIds,
                                  extras: a.permissoesExtras,
                                  removidas: a.permissoesRemovidas,
                                }}
                              />
                            }
                            gerarLink={linkLiberado ? acoes.gerarLink.bind(null, a.acessoId) : undefined}
                            avisoDeLink="O link de senha desta pessoa sai pela FlowFoods."
                            mudarStatus={
                              eu ? undefined : (desativado ? acoes.reativar : acoes.desativar).bind(null, a.acessoId)
                            }
                            liberar={
                              nivel1 && a.bloqueada && acoes.liberar ? acoes.liberar.bind(null, a.acessoId) : undefined
                            }
                          />
                        ) : (
                          escreve && (
                            <p className="text-[12px] text-surface/40">
                              Acesso maior que o seu: só quem tem o mesmo acesso muda.
                            </p>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Painel>

            {historico && (
              <Painel
                titulo="Últimas mudanças na equipe"
                acessorio={
                  historicoHref && (
                    <Link href={historicoHref} className="text-[11px] text-surface/50 transition hover:text-surface">
                      Ver tudo →
                    </Link>
                  )
                }
                semRespiro
              >
                {historico.length === 0 ? (
                  <Vazio titulo="Nada registrado ainda." />
                ) : (
                  <ListaHistorico linhas={historico} compacta />
                )}
              </Painel>
            )}
          </div>

          <Painel titulo="Nova pessoa" id="nova-pessoa"
            className={`scroll-mt-4 self-start ${bloqueio ? 'hidden lg:block' : ''}`}>
            {bloqueio ? (
              <p className="text-sm text-surface/55">{bloqueio}</p>
            ) : (
              <div className="space-y-4">
                <p className="text-[13px] leading-relaxed text-surface/55">
                  A pessoa recebe um link para criar a própria senha. O perfil diz o que ela pode fazer; as lojas, onde.
                </p>
                <FormPessoa
                  acao={acoes.criar}
                  modo="criar"
                  idBase="nova"
                  perfis={opcoesDePerfil}
                  lojas={lojas}
                  concediveis={concediveis}
                  atorRede={atorRede}
                />
              </div>
            )}
          </Painel>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
          <Painel titulo="Perfis" semRespiro className="order-2 self-start lg:order-1">
            <ul>
              {ORDEM_DOS_PERFIS_BASE.map((b) => {
                const n = todas.filter((p) => p.perfilBase === b && p.status === 'ATIVO').length;
                return (
                  <li key={b} className="border-t border-white/[0.06] px-5 py-4 first:border-t-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-surface">{PERFIS_BASE[b].rotulo}</span>
                        <span className="text-[11px] text-surface/40">pronto</span>
                      </div>
                      <span className="text-[12px] tabular-nums text-surface/50">
                        {PERFIS_BASE[b].permissoes.length} de {TODAS_AS_PERMISSOES.length} funções · {n}{' '}
                        {n === 1 ? 'pessoa' : 'pessoas'}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-surface/55">{PERFIS_BASE[b].resumo}</p>
                  </li>
                );
              })}
              {perfis.map((p) => {
                const mexe = escreve && atorRede && p.permissoes.every((x) => ator.alcance.permissoes.has(x));
                return (
                  <li key={p.id} className="space-y-3 border-t border-white/[0.06] px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-surface">{p.nome}</span>
                        <span className="text-[11px] text-surface/40">
                          copiado de {PERFIS_BASE[p.base].rotulo.toLowerCase()}
                        </span>
                      </div>
                      <span className="text-[12px] tabular-nums text-surface/50">
                        {p.permissoes.length} de {TODAS_AS_PERMISSOES.length} funções · {p.pessoas}{' '}
                        {p.pessoas === 1 ? 'pessoa' : 'pessoas'}
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-surface/55">
                      {p.permissoes.map(rotuloDaPermissao).join(' · ')}
                    </p>
                    {p.setores.length > 0 && (
                      <p className="text-[12px] text-surface/45">
                        Pensado para: {p.setores.map((s) => SETORES[s]).join(', ')}
                      </p>
                    )}
                    {mexe && (
                      <Expansivel rotulo="Editar perfil">
                        <FormPerfil
                          acao={acoes.salvarPerfil}
                          pessoas={p.pessoas}
                          excluir={acoes.excluirPerfil.bind(null, p.id)}
                          idBase={`perfil-${p.id}`}
                          concediveis={concediveis}
                          inicial={{
                            id: p.id,
                            nome: p.nome,
                            base: p.base,
                            permissoes: p.permissoes,
                            setores: p.setores,
                          }}
                        />
                      </Expansivel>
                    )}
                  </li>
                );
              })}
            </ul>
            {perfis.length === 0 && (
              <p className="border-t border-white/[0.06] px-5 py-4 text-[13px] text-surface/45">
                Nenhum perfil próprio ainda. Crie um copiando um dos prontos e marcando só o que a função precisa.
              </p>
            )}
          </Painel>

          <Painel titulo="Novo perfil" className="order-1 self-start lg:order-2">
            {bloqueio ? (
              <p className="text-sm text-surface/55">{bloqueio}</p>
            ) : !atorRede ? (
              <p className="text-sm text-surface/55">Só quem tem acesso à rede inteira cria perfis.</p>
            ) : (
              <FormPerfil acao={acoes.salvarPerfil} idBase="perfil-novo" concediveis={concediveis} />
            )}
          </Painel>
        </div>
      )}
    </div>
  );
}
