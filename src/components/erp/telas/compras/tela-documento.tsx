// Scanner avoid-ai-design, SD4d (P2) aceito: "Nota 4521 · série 1 · Vila da Penha" e "código X · 3 PC" são linhas de apoio, no padrão "A · B" das telas de compras. (O ignore do scanner não aceita id com minúscula.)
/**
 * A nota recebida por XML (F.1b), a MESMA no nível 1 e na pessoa do parceiro. Aguardando conferência: cabeçalho, a nota (emitente,
 * loja, chave), a conferência dos itens (formulário), o total e a entrada. Conciliada: os itens como foram usados e o link da nota
 * de compra. Cancelada: o motivo. Ao lado (a partir de 1024 px): situação (descartar), cobrança e alterações. Quem só vê não tem botão.
 */

import Link from 'next/link';
import type { FormularioDeNota } from '@/lib/erp/compras';
import { formatarCep, formatarData, formatarDocumento, formatarEmbalagens } from '@/lib/erp/compra-campos';
import type { DocumentoDetalhado } from '@/lib/erp/documentos-fiscais';
import { formatarChave } from '@/lib/erp/documento-fiscal-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Linha, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { ListaHistorico } from '../historico/lista-historico';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeDocumento } from './documentos-estado';
import { fraseDoDocumento } from './documentos-estado';
import { FormCancelarDocumento } from './form-cancelar-documento';
import { FormConferencia } from './form-conferencia';
import { SeloDoDocumento } from './lista-documentos';

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function TelaDocumento({
  doc: d,
  base,
  comprasBase,
  fornecedoresBase,
  insumosBase,
  feito,
  contexto,
  podeLancar,
  podeEditarVinculos,
  podeEditarFornecedor,
  bloqueio,
  opcoesDeInsumos,
  hoje,
  acaoConferir,
  acaoCancelar,
}: {
  doc: DocumentoDetalhado;
  /** A lista de notas recebidas de quem usa a tela. */
  base: string;
  /** A lista de notas de compra (link da nota lançada). */
  comprasBase: string;
  fornecedoresBase: string;
  insumosBase?: string;
  feito?: string;
  contexto?: string;
  /** Concilia, liga e descarta NESTA loja. */
  podeLancar: boolean;
  podeEditarVinculos: boolean;
  podeEditarFornecedor: boolean;
  bloqueio: string | null;
  opcoesDeInsumos: FormularioDeNota['insumos'];
  hoje: string;
  acaoConferir: AcaoDeDocumento;
  acaoCancelar: AcaoDeDocumento;
}) {
  const mensagem = fraseDoDocumento(feito);
  const aguardando = d.situacao === 'AGUARDANDO_CONFERENCIA';
  const nome = d.fornecedor?.nome ?? d.emitente.fantasia ?? d.emitente.razao;
  const dataInicial = formatarData(d.emitidaEm > hoje ? hoje : d.emitidaEm);
  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: d.rotulo }]} />
      <Voltar href={base}>Voltar para as notas recebidas</Voltar>
      <PageHeader
        icone="importar"
        cor={COR.compras}
        titulo={nome}
        subtitulo={[contexto, d.rotulo, d.loja?.nome, `emitida em ${formatarData(d.emitidaEm)}`].filter(Boolean).join(' · ')}
        acao={<SeloDoDocumento situacao={d.situacao} />}
      />

      {mensagem && <Aviso tom="ok" titulo={mensagem} />}
      {d.situacao === 'CONCILIADO' && d.nota && feito !== 'conciliada' && feito !== 'ligada' && (
        <Aviso tom="ok" titulo="Conciliada.">
          A nota de compra{' '}
          <Link href={`${comprasBase}/${d.nota.id}`} className={LINK_DE_TEXTO}>
            {d.nota.rotulo}
          </Link>{' '}
          vem desta nota fiscal.
        </Aviso>
      )}
      {d.situacao === 'CONCILIADO' && d.nota && (feito === 'conciliada' || feito === 'ligada') && (
        <p className="text-sm">
          <Link href={`${comprasBase}/${d.nota.id}`} className={LINK_DE_TEXTO}>
            Abrir a {d.nota.rotulo.toLowerCase()} de compra
          </Link>
        </p>
      )}
      {d.situacao === 'CANCELADO' && (
        <Aviso tom="alerta" titulo="Nota fiscal descartada.">
          {d.motivo ? `Motivo: ${d.motivo}.` : ''} Ela não entra mais; a chave dela continua guardada, então o mesmo arquivo não é recebido de novo.
        </Aviso>
      )}
      {aguardando && d.fornecedor?.situacaoCadastro === 'A_COMPLETAR' && (
        <Aviso tom="alerta" titulo="Fornecedor novo, criado com os dados desta nota.">
          Falta completar o cadastro dele ({d.fornecedor.falta.join(', ')}).{' '}
          {podeEditarFornecedor ? (
            <Link href={`${fornecedoresBase}/${d.fornecedor.id}/editar`} className={LINK_DE_TEXTO}>
              Completar o cadastro
            </Link>
          ) : (
            'Quem cuida dos fornecedores completa. A nota segue normalmente.'
          )}
        </Aviso>
      )}
      {aguardando && d.parecidoSemNota && (
        <Aviso tom="neutro" titulo={`Já existe “${d.parecidoSemNota.nome}” em compras sem nota fiscal.`}>
          Se é o mesmo fornecedor, abra o cadastro dele e complete (CNPJ, razão social, e-mail). Nada é unido sozinho.{' '}
          <Link href={`${fornecedoresBase}/${d.parecidoSemNota.id}`} className={LINK_DE_TEXTO}>
            Abrir “{d.parecidoSemNota.nome}”
          </Link>
        </Aviso>
      )}
      {aguardando && !d.conferencia.fecha && (
        <Aviso tom="erro" titulo="A nota não fecha.">
          {d.conferencia.frase}
        </Aviso>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Painel titulo="A nota fiscal">
            <dl className="space-y-2 text-sm">
              <Linha rotulo="Emitente">
                {d.fornecedor ? (
                  <Link href={`${fornecedoresBase}/${d.fornecedor.id}`} className={LINK_DE_TEXTO}>
                    {d.fornecedor.nome}
                  </Link>
                ) : (
                  (d.emitente.fantasia ?? d.emitente.razao)
                )}
              </Linha>
              <Linha rotulo="Razão social">{d.emitente.razao}</Linha>
              <Linha rotulo="CNPJ/CPF">{formatarDocumento(d.emitente.documento)}</Linha>
              {d.emitente.inscricaoEstadual && <Linha rotulo="Inscrição estadual">{d.emitente.inscricaoEstadual}</Linha>}
              {(d.emitente.municipio || d.emitente.uf) && <Linha rotulo="Cidade">{[d.emitente.municipio, d.emitente.uf].filter(Boolean).join(' / ')}</Linha>}
              {d.emitente.cep && <Linha rotulo="CEP">{formatarCep(d.emitente.cep)}</Linha>}
              <Linha rotulo="Loja">{d.loja ? d.loja.nome : `CNPJ ${formatarDocumento(d.destinatarioDocumento)} (escolha a loja)`}</Linha>
              <Linha rotulo="Emitida em">{formatarData(d.emitidaEm)}</Linha>
              <Linha rotulo="Total da nota">
                <span className="font-semibold tabular-nums">{formatarDinheiro(d.totais.vNfCentavos)}</span>
              </Linha>
            </dl>
            <p className="mt-3 break-all border-t border-linha pt-3 text-[12px] tabular-nums text-suave">
              <span className="font-medium text-texto">Chave de acesso:</span> {formatarChave(d.chaveAcesso)}
            </p>
          </Painel>

          {aguardando && podeLancar ? (
            <FormConferencia
              acao={acaoConferir}
              base={base}
              doc={{
                id: d.id,
                versao: d.versao,
                loja: d.loja,
                lojasCandidatas: d.lojasCandidatas,
                fornecedoresCandidatos: d.fornecedoresCandidatos,
                itens: d.itens,
                conferencia: d.conferencia,
                notaParaLigar: d.notaParaLigar,
                totais: d.totais,
                emitidaEm: d.emitidaEm,
              }}
              opcoesDeInsumos={opcoesDeInsumos}
              hoje={hoje}
              dataInicial={dataInicial}
              bloqueio={bloqueio}
              podeEditarVinculos={podeEditarVinculos}
            />
          ) : (
            <ItensSomenteLeitura d={d} insumosBase={insumosBase} semPermissao={aguardando} />
          )}
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Situação, cobrança e alterações">
          {(d.situacao === 'AGUARDANDO_CONFERENCIA' || d.situacao === 'CONCILIADO') && podeLancar && (
            <Painel titulo="Situação">{bloqueio ? <p className="text-sm text-suave">{bloqueio}</p> : <FormCancelarDocumento acao={acaoCancelar} versao={d.versao} conciliado={d.situacao === 'CONCILIADO'} />}</Painel>
          )}
          {d.duplicatas.length > 0 && (
            <Painel titulo="Cobrança" subtitulo="Só guardada: o sistema não cria conta a pagar">
              <ul className="divide-y divide-linha text-sm tabular-nums">
                {d.duplicatas.map((p, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="text-suave">
                      {p.numero ? `${p.numero} · ` : ''}vence {formatarData(p.vencimento)}
                    </span>
                    <span className="font-semibold text-texto">{formatarDinheiro(p.valorCentavos)}</span>
                  </li>
                ))}
              </ul>
            </Painel>
          )}
          <Painel titulo="Recebida">
            <dl className="space-y-2 text-sm">
              <Linha rotulo="Recebida em">{DATA_HORA.format(d.criadoEm).replace(',', ' às')}</Linha>
              {d.criadoPorNome && <Linha rotulo="Por">{d.criadoPorNome}</Linha>}
              {d.canceladoEm && <Linha rotulo="Descartada em">{DATA_HORA.format(d.canceladoEm).replace(',', ' às')}</Linha>}
            </dl>
          </Painel>
          <Painel titulo="Alterações" semRespiro>
            {d.historico.length === 0 ? <Vazio>Nada registrado ainda.</Vazio> : <ListaHistorico linhas={d.historico} compacta doCadastro={d.rotulo} />}
          </Painel>
        </aside>
      </div>
    </div>
  );
}

/** Os itens como estão (conciliada, cancelada, ou quem só pode ver): o que a nota diz e o insumo a que cada um se ligou. */
function ItensSomenteLeitura({ d, insumosBase, semPermissao }: { d: DocumentoDetalhado; insumosBase?: string; semPermissao: boolean }) {
  return (
    <Painel titulo="Itens da nota fiscal" semRespiro>
      {semPermissao && <p className="border-b border-linha px-4 py-3 text-[13px] text-suave sm:px-5">Seu acesso permite ver esta nota, não conferir nem lançar. Quem lança as compras da loja faz a conciliação.</p>}
      <ul className="divide-y divide-linha">
        {d.itens.map((i) => (
          <li key={i.nItem} className="space-y-1 px-4 py-3 text-sm sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <p className="min-w-0 font-medium text-texto">
                <span className="tabular-nums text-suave">{i.nItem}. </span>
                {i.descricao}
              </p>
              <span className="shrink-0 font-semibold tabular-nums">{formatarDinheiro(i.liquidoCentavos)}</span>
            </div>
            <p className="text-[12px] tabular-nums text-suave">
              código {i.codigoProduto} · {formatarEmbalagens(i.qComMilesimos)} {i.unidadeComercial}
            </p>
            {i.insumoId ? (
              <p className="text-[13px] text-suave">
                {insumosBase ? (
                  <Link href={`${insumosBase}/${i.insumoId}`} className={LINK_DE_TEXTO}>
                    {i.insumoNome}
                  </Link>
                ) : (
                  i.insumoNome
                )}{' '}
                · {i.embalagemTexto}
                {i.conta ? <span className="tabular-nums"> · {i.conta.curta}</span> : null}
              </p>
            ) : (
              <p className="text-[13px] text-suave">
                <Selo>Sem insumo</Selo>
              </p>
            )}
          </li>
        ))}
      </ul>
    </Painel>
  );
}
