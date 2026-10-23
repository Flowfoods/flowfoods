// Scanner avoid-ai-design, SD4d (P2) aceito: "Lote L2310 · vence 10/11/2026 · marca Tirolez" é a linha de apoio da lista, no padrão "A · B" das telas da 1.1–3.3.
/**
 * Lote e vencimento de uma nota (3.4, decisão 406): por insumo da nota, os lotes do fornecedor registrados (como vieram na
 * embalagem), a sugestão do XML quando a nota veio dele (o `rastro`: só sugestão, a pessoa confirma) e o formulário para
 * registrar. Nada é obrigatório nem inventado. A nota não muda (nem o estoque, nem o custo). Ver = "ver compras" na loja da
 * nota; registrar e tirar = "lançar nota de compra" nela. Nenhum valor em R$.
 */

import type { LotesDaNota } from '@/lib/erp/etiquetas';
import { diaPorExtenso, quandoNaTela } from '@/lib/erp/etiqueta-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso, Contagem, Painel } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from '../estoque/estado';
import { FormLoteDaNota, FormTirarLote, FormUsarSugestao } from './form-lote-nota';

export function TelaLotesDaNota({
  n,
  hrefNota,
  contexto,
  feito,
  podeRegistrar,
  bloqueio,
  acoes,
  envio,
}: {
  n: LotesDaNota;
  hrefNota: string;
  contexto?: string;
  feito?: string;
  /** "Lançar nota de compra" na loja da nota. */
  podeRegistrar: boolean;
  bloqueio: string | null;
  acoes: { registrar: AcaoDeEstoque; tirar: AcaoDeEstoque };
  envio: string;
}) {
  const edita = podeRegistrar && n.lancada && !bloqueio;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: n.rotulo, href: hrefNota }, { rotulo: 'Lote e vencimento' }]} />
      <Voltar href={hrefNota}>Voltar para a nota</Voltar>
      <PageHeader icone="compras" cor={COR.compras} titulo="Lote e vencimento" subtitulo={[contexto, n.rotulo, n.fornecedor, n.loja, diaPorExtenso(n.entradaEm)].filter(Boolean).join(' · ')} />
      {feito && <Aviso tom="ok" titulo={feito} />}
      {n.cancelada && <Aviso tom="alerta" titulo="Nota cancelada.">Os lotes se registram na nota que vale; os já registrados ficam no histórico.</Aviso>}
      {bloqueio && podeRegistrar && <Aviso tom="neutro" titulo={bloqueio} />}
      <p className="text-sm text-suave">
        O lote e o vencimento de cada insumo, como vieram na embalagem. Nada é obrigatório nem inventado: o que a embalagem não diz fica em branco. Na hora de abrir a embalagem, a cozinha escolhe o lote daqui e a etiqueta usa o vencimento dele.
      </p>

      {n.insumos.length === 0 ? (
        <Aviso tom="neutro" titulo="Esta nota não tem insumo ligado." />
      ) : (
        n.insumos.map((i) => (
          <Painel key={i.id} titulo={i.nome} subtitulo={`${i.quantidade} nesta nota${i.embalagens.length ? ` · ${i.embalagens.join(', ')}` : ''}`} acessorio={<Contagem>{i.lotes.length === 1 ? '1 lote' : `${i.lotes.length} lotes`}</Contagem>}>
            <div className="space-y-4">
              {i.lotes.length > 0 && (
                <ul className="divide-y divide-linha rounded-[10px] border border-linha">
                  {i.lotes.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3.5 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block font-semibold text-texto [overflow-wrap:anywhere]">{l.codigo ? `Lote ${l.codigo}` : 'Lote sem código'}</span>
                        <span className="block text-[12px] tabular-nums text-suave [overflow-wrap:anywhere]">
                          {[l.vencimento ? `vence ${diaPorExtenso(l.vencimento)}` : 'vencimento não informado', l.fabricacao ? `fabricado ${diaPorExtenso(l.fabricacao)}` : null, l.marca ? `marca ${l.marca}` : null, l.doXml ? 'como no XML' : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <span className="block text-[12px] tabular-nums text-suave">
                          registrado por {l.registradoPor} em {quandoNaTela(l.registradoEm)}
                          {l.aberturas ? ` · ${l.aberturas} ${l.aberturas === 1 ? 'embalagem aberta' : 'embalagens abertas'}` : ''}
                        </span>
                      </span>
                      {edita && l.aberturas === 0 && <FormTirarLote acao={acoes.tirar} loteId={l.id} rotulo={l.codigo ? `lote ${l.codigo}` : 'lote sem código'} />}
                    </li>
                  ))}
                </ul>
              )}
              {i.sugestoes.length > 0 && (
                <div className="space-y-2 rounded-[10px] border border-linha px-3.5 py-3">
                  <p className="text-[13px] font-semibold text-texto">O XML da nota diz</p>
                  <ul className="space-y-2.5">
                    {i.sugestoes.map((s, k) => (
                      <li key={`${s.codigo}-${s.vencimento}-${k}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm">
                        <span className="min-w-0 tabular-nums text-texto [overflow-wrap:anywhere]">
                          Lote {s.codigo}
                          {s.vencimento ? ` · vence ${diaPorExtenso(s.vencimento)}` : ' · sem vencimento no XML'}
                          {s.fabricacao ? ` · fabricado ${diaPorExtenso(s.fabricacao)}` : ''}
                          {s.quantidade ? ` · ${s.quantidade}` : ''}
                        </span>
                        {edita && <FormUsarSugestao acao={acoes.registrar} insumoId={i.id} envioInicial={`${envio}-s${k}${i.id.slice(-6)}`.slice(0, 64)} sugestao={s} />}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[12px] text-suave">É o que o fornecedor declarou na nota fiscal. Confira na embalagem antes de registrar.</p>
                </div>
              )}
              {edita ? (
                <details className="group rounded-[10px] border border-linha" open={i.lotes.length === 0 && i.sugestoes.length === 0}>
                  <summary className="ff-transicao flex min-h-11 cursor-pointer list-none items-center px-3.5 text-sm font-semibold text-texto hover:bg-texto/[0.03]">Registrar um lote</summary>
                  <div className="border-t border-linha px-3.5 py-3">
                    <FormLoteDaNota acao={acoes.registrar} insumoId={i.id} envioInicial={`${envio}-m${i.id.slice(-8)}`.slice(0, 64)} />
                  </div>
                </details>
              ) : (
                i.lotes.length === 0 && <p className="text-[13px] text-suave">Nenhum lote registrado.</p>
              )}
            </div>
          </Painel>
        ))
      )}

      {n.semInsumo.length > 0 && (
        <Painel titulo="No XML, em itens sem insumo ligado" subtitulo="Para registrar, ligue o item ao insumo na conferência da nota fiscal">
          <ul className="space-y-1.5 text-sm">
            {n.semInsumo.map((s, k) => (
              <li key={k} className="tabular-nums text-texto [overflow-wrap:anywhere]">
                {s.item}: lote {s.codigo}
                {s.vencimento ? `, vence ${diaPorExtenso(s.vencimento)}` : ''}
              </li>
            ))}
          </ul>
        </Painel>
      )}
      {n.foraDaNota > 0 && <p className="text-[12px] text-suave">{n.foraDaNota === 1 ? 'Um lote registrado é' : `${n.foraDaNota} lotes registrados são`} de insumo que saiu da nota numa edição: fica no histórico e na abertura.</p>}
    </div>
  );
}
