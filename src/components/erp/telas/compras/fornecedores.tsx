// Scanner avoid-ai-design, SD4d (P2) aceito: "12.345.678/0001-95 · Seu Jorge" é a linha de apoio da lista densa, no padrão "A · B" das telas da 1.1–1.4. (O ignore do scanner não aceita id com minúscula.)
/**
 * Fornecedores (1.5) — lista e detalhe, os MESMOS no nível 1 e na pessoa do
 * parceiro. O detalhe mostra o que ele já vendeu (último preço por insumo) e
 * as últimas notas nas lojas de quem vê.
 */

import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { CadastroDoFornecedor, FornecedorDetalhado, LinhaDeFornecedor, SituacaoDoFornecedor } from '@/lib/erp/compras';
import { documentoAConferir, formatarCep, formatarData, formatarDocumento, formatarWhatsapp, numeroDaNota } from '@/lib/erp/compra-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarCusto, formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { CAMPO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Linha, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { ListaHistorico } from '../historico/lista-historico';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { FormSituacao } from '../cadastro/form-situacao';
import { BotaoOuMotivo, Voltar } from '../cadastro/partes';
import { AvisoDeSalvo } from '../cadastro/anuncio';
import { fraseDoFornecedor, fraseDoSalvoDoFornecedor } from './estado';

const SITUACOES: Record<SituacaoDoFornecedor, string> = { ativos: 'Ativos', desativados: 'Desativados', todos: 'Todos' };
const CADASTROS: Record<CadastroDoFornecedor, string> = { todos: 'Qualquer cadastro', 'a-completar': 'A completar', completos: 'Completos' };

export function TelaListaFornecedores({
  base,
  notasBase,
  contexto,
  linhas,
  q,
  situacao,
  cadastro = 'todos',
  novoHref,
  bloqueio,
}: {
  base: string;
  notasBase: string;
  contexto: string;
  linhas: LinhaDeFornecedor[];
  q: string;
  situacao: SituacaoDoFornecedor;
  cadastro?: CadastroDoFornecedor;
  novoHref?: string;
  bloqueio: string | null;
}) {
  const filtrado = !!q || situacao !== 'ativos' || cadastro !== 'todos';
  return (
    <div className="space-y-6">
      <PageHeader
        icone="fornecedor"
        cor={COR.compras}
        titulo="Fornecedores"
        subtitulo={`${contexto} · ${linhas.length} ${linhas.length === 1 ? 'fornecedor' : 'fornecedores'}${filtrado ? (linhas.length === 1 ? ' encontrado' : ' encontrados') : ''}`}
        acao={
          novoHref ? (
            <BotaoOuMotivo href={novoHref} bloqueio={bloqueio} variante="primario">
              <Plus size={16} aria-hidden />
              Novo fornecedor
            </BotaoOuMotivo>
          ) : undefined
        }
      >
        <form role="search" action={base} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(14rem,26rem)_10rem_14rem_auto_auto]">
          <label htmlFor="fornecedores-q" className="sr-only">
            Buscar fornecedor pelo nome ou CNPJ
          </label>
          <input id="fornecedores-q" name="q" type="search" defaultValue={q} placeholder="Nome ou CNPJ" className={`${CAMPO} col-span-2 sm:col-span-1`} />
          <label htmlFor="fornecedores-situacao" className="sr-only">
            Situação
          </label>
          <select id="fornecedores-situacao" name="situacao" defaultValue={situacao} className={`${CAMPO} pr-8`}>
            {(Object.keys(SITUACOES) as SituacaoDoFornecedor[]).map((k) => (
              <option key={k} value={k}>
                {SITUACOES[k]}
              </option>
            ))}
          </select>
          <label htmlFor="fornecedores-cadastro" className="sr-only">
            Cadastro
          </label>
          <select id="fornecedores-cadastro" name="cadastro" defaultValue={cadastro} className={`${CAMPO} pr-8`}>
            {(Object.keys(CADASTROS) as CadastroDoFornecedor[]).map((k) => (
              <option key={k} value={k}>
                {CADASTROS[k]}
              </option>
            ))}
          </select>
          <button type="submit" className={classeDeBotao('secundario')}>
            Filtrar
          </button>
          {filtrado && (
            <Link href={base} className={classeDeBotao('fantasma', 'px-3')}>
              Limpar
            </Link>
          )}
        </form>
      </PageHeader>

      <Painel semRespiro>
        {linhas.length === 0 ? (
          filtrado ? (
            <Vazio titulo="Nenhum fornecedor com esse filtro." />
          ) : (
            <Vazio
              titulo="Nenhum fornecedor ainda."
              acao={
                novoHref && !bloqueio ? (
                  <Link href={novoHref} className={classeDeBotao('primario')}>
                    Cadastrar o primeiro fornecedor
                  </Link>
                ) : undefined
              }
            >
              Quem vende para a casa: distribuidor, atacarejo, feira. Precisa dele para lançar a nota.
            </Vazio>
          )
        ) : (
          <ul className="divide-y divide-linha">
            {linhas.map((f) => (
              <li key={f.id}>
                <Link href={`${base}/${f.id}`} className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-texto/[0.03] sm:px-5">
                  <span className="min-w-0">
                    <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 font-medium ${f.ativo ? 'text-texto' : 'text-suave'}`}>
                      <span className="truncate">{f.nome}</span>
                      {!f.ativo && <Selo>Desativado</Selo>}
                      {f.situacaoCadastro === 'A_COMPLETAR' && <Selo tom="alerta">A completar</Selo>}
                      {f.semNotaFiscal && <Selo>Sem nota fiscal</Selo>}
                      {documentoAConferir(f.documento) && <Selo tom="alerta">Documento a conferir</Selo>}
                    </span>
                    <span className="block truncate text-[12px] tabular-nums text-suave">
                      {[formatarDocumento(f.documento) ?? 'sem CNPJ', formatarWhatsapp(f.whatsapp), f.whatsapp ? null : f.contato].filter(Boolean).join(' · ')}
                    </span>
                    {f.situacaoCadastro === 'A_COMPLETAR' && f.falta.length > 0 && (
                      <span className="block truncate text-[12px] text-suave">Falta: {f.falta.join(', ')}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-[12px] tabular-nums text-suave">
                    {f.notas > 0 ? (
                      <>
                        <span className="block text-sm font-semibold text-texto">
                          {f.notas} {f.notas === 1 ? 'nota' : 'notas'}
                        </span>
                        última {formatarData(f.ultimaNota!, true)}
                      </>
                    ) : (
                      'nenhuma nota lançada'
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>
      <p className="text-[13px] text-suave">
        As notas de cada um estão em{' '}
        <Link href={notasBase} className={LINK_DE_TEXTO}>
          Notas de compra
        </Link>
        , com filtro por fornecedor.
      </p>
    </div>
  );
}

export function TelaDetalheFornecedor({
  fornecedor: f,
  base,
  notasBase,
  insumosBase,
  feito,
  contexto,
  podeEditar,
  bloqueio,
  acaoSituacao,
}: {
  fornecedor: FornecedorDetalhado;
  base: string;
  notasBase: string;
  insumosBase?: string;
  feito?: string;
  contexto?: string;
  podeEditar: boolean;
  bloqueio: string | null;
  acaoSituacao: AcaoDeCadastro;
}) {
  const mensagem = fraseDoFornecedor(feito);
  // F.1a: criado e editado dizem O QUE foi salvo, com o nome lido do banco (nunca da URL).
  const salvo = fraseDoSalvoDoFornecedor(feito, f.nome);
  const aCompletar = f.situacaoCadastro === 'A_COMPLETAR';
  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: f.nome }]} />
      <Voltar href={base}>Voltar para os fornecedores</Voltar>
      <PageHeader
        icone="fornecedor"
        cor={COR.compras}
        titulo={f.nome}
        aviso={
          salvo ? (
            <AvisoDeSalvo titulo={salvo.titulo} apoio={salvo.apoio}>
              {salvo.criou && podeEditar && !bloqueio && (
                <Link href={`${base}/novo`} className={classeDeBotao('secundario')}>
                  Cadastrar outro fornecedor
                </Link>
              )}
              <Link href={base} className={classeDeBotao('secundario')}>
                Ver todos os fornecedores
              </Link>
            </AvisoDeSalvo>
          ) : undefined
        }
        subtitulo={<PartesSemQuebra partes={[contexto, f.razaoSocial, formatarDocumento(f.documento) ?? 'sem CNPJ', formatarWhatsapp(f.whatsapp) ?? f.contato]} />}
        acao={
          podeEditar && f.ativo ? (
            <BotaoOuMotivo href={`${base}/${f.id}/editar`} bloqueio={bloqueio} variante="primario">
              {aCompletar ? 'Completar o cadastro' : 'Editar fornecedor'}
            </BotaoOuMotivo>
          ) : undefined
        }
      />
      {mensagem && !salvo && <Aviso tom="ok" titulo={mensagem} />}
      {aCompletar && (
        <Aviso tom="alerta" titulo="Cadastro a completar.">
          Falta: {f.falta.join(', ')}. {podeEditar && f.ativo ? 'Complete em Editar fornecedor.' : 'Quem cuida do cadastro de fornecedores completa.'} As notas dele continuam valendo.
        </Aviso>
      )}
      {f.documentoAConferir && (
        <Aviso tom="alerta" titulo="Documento a conferir.">
          O CNPJ/CPF gravado ({f.documento}) não passa na conferência dos dígitos verificadores. Confira com a nota e corrija em Editar fornecedor.
        </Aviso>
      )}
      {f.mesmaEmpresa.length > 0 && (
        <Aviso tom="neutro" titulo="Mesma empresa, outro estabelecimento.">
          Outros cadastros com a mesma raiz de CNPJ:{' '}
          {f.mesmaEmpresa.map((o, n) => (
            <span key={o.id}>
              {n > 0 && ', '}
              <Link href={`${base}/${o.id}`} className={LINK_DE_TEXTO}>
                {o.nome}
              </Link>
              {' '}({formatarDocumento(o.documento)}{o.ativo ? '' : ', desativado'})
            </span>
          ))}
          . São cadastros separados: nada é unido.
        </Aviso>
      )}
      {!f.ativo && feito !== 'desativado' && <Aviso tom="alerta" titulo="Fornecedor desativado.">As notas dele continuam; nota nova não pode escolher.</Aviso>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Painel titulo="O que já vendeu" subtitulo="Último preço de cada insumo nas notas lançadas, com o frete rateado" semRespiro>
            {f.insumos.length === 0 ? (
              <Vazio>Nenhuma nota lançada dele ainda.</Vazio>
            ) : (
              <ul className="divide-y divide-linha">
                {f.insumos.map((i) => (
                  <li key={i.insumoId} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <span className="min-w-0 truncate font-medium text-texto">
                      {insumosBase ? (
                        <Link href={`${insumosBase}/${i.insumoId}`} className="ff-transicao rounded-[5px] underline-offset-4 hover:underline">
                          {i.nome}
                        </Link>
                      ) : (
                        i.nome
                      )}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="font-semibold">{formatarCusto(i.custo, i.unidade)}</span>
                      <span className="block text-[12px] text-suave">em {formatarData(i.entradaEm)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
          <Painel
            titulo="Últimas notas"
            semRespiro
            acessorio={
              <Link href={`${notasBase}?fornecedor=${f.id}&situacao=todas`} className={`${LINK_DE_TEXTO} inline-flex min-h-0 items-center [@media(pointer:coarse)]:min-h-11`}>
                Ver todas
              </Link>
            }
          >
            {f.notas.length === 0 ? (
              <Vazio>Nenhuma nota nas suas lojas.</Vazio>
            ) : (
              <ul className="divide-y divide-linha">
                {f.notas.map((n) => (
                  <li key={n.id}>
                    <Link href={`${notasBase}/${n.id}`} className="ff-transicao flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-texto/[0.03] sm:px-5">
                      <span className="min-w-0">
                        <span className={`block font-medium ${n.status === 'CANCELADA' ? 'text-suave line-through' : 'text-texto'}`}>
                          Nota {numeroDaNota(n)}
                        </span>
                        <span className="block text-[12px] tabular-nums text-suave">
                          {n.loja} · {formatarData(n.entradaEm)}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">{n.status === 'CANCELADA' ? <Selo>Cancelada</Selo> : formatarDinheiro(n.totalCentavos)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </div>
        <aside className="min-w-0 space-y-4" aria-label="Cadastro, situação e alterações">
          <Painel titulo="Cadastro">
            <dl className="space-y-2 text-sm">
              <Linha rotulo="Razão social">{f.razaoSocial ?? 'não informada'}</Linha>
              <Linha rotulo="CNPJ/CPF">{formatarDocumento(f.documento) ?? 'não informado'}</Linha>
              <Linha rotulo="Inscrição estadual">{f.inscricaoEstadual ?? 'não informada'}</Linha>
              <Linha rotulo="Compras sem nota fiscal">{f.semNotaFiscal ? 'Sim' : 'Não'}</Linha>
              <Linha rotulo="Endereço">
                {[f.endereco, [f.municipio, f.uf].filter(Boolean).join('/'), formatarCep(f.cep)].filter(Boolean).join(' · ') || 'não informado'}
              </Linha>
              <Linha rotulo="Contato comercial">{f.contatoComercial ?? 'não informado'}</Linha>
              <Linha rotulo="WhatsApp">{formatarWhatsapp(f.whatsapp) ?? 'não informado'}</Linha>
              <Linha rotulo="E-mail">{f.email ? <span className="break-all">{f.email}</span> : 'não informado'}</Linha>
              <Linha rotulo="Prazo de pagamento">{f.prazoPagamentoDias === null ? 'não informado' : `${f.prazoPagamentoDias} ${f.prazoPagamentoDias === 1 ? 'dia' : 'dias'}`}</Linha>
              {f.contato && <Linha rotulo="Contato (cadastro antigo)">{f.contato}</Linha>}
              <Linha rotulo="Cadastro">{aCompletar ? 'A completar' : 'Completo'}</Linha>
              <Linha rotulo="Situação">{f.ativo ? 'Ativo' : 'Desativado'}</Linha>
            </dl>
          </Painel>
          {podeEditar && (
            <Painel titulo="Situação">
              {bloqueio ? <p className="text-sm text-suave">{bloqueio}</p> : <FormSituacao acao={acaoSituacao} ativo={f.ativo} oQue="fornecedor" idBase="situacao-fornecedor" />}
            </Painel>
          )}
          <Painel titulo="Alterações" semRespiro>
            {f.historico.length === 0 ? <Vazio>Nada registrado ainda.</Vazio> : <ListaHistorico linhas={f.historico} compacta doCadastro={f.nome} />}
          </Painel>
        </aside>
      </div>
    </div>
  );
}

/** "A · B · C" em que cada parte (CNPJ, "Seu Jorge (21) 99999-0000") não quebra no meio; a linha quebra entre elas. */
function PartesSemQuebra({ partes }: { partes: (string | null | undefined)[] }) {
  const lista = partes.filter((p): p is string => !!p);
  return (
    <>
      {lista.map((p, n) => (
        <span key={n}>
          {n > 0 && ' · '}
          {/* Texto livre do cadastro antigo pode ser longo: só as partes curtas (CNPJ, WhatsApp) ficam inteiras numa linha. */}
          <span className={p.length <= 40 ? 'whitespace-nowrap' : 'break-words'}>{p}</span>
        </span>
      ))}
    </>
  );
}
