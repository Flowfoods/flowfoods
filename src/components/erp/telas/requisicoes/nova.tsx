// Scanner avoid-ai-design, SD4d (P2) aceito: "Vila da Penha · nada sai do estoque…" é a linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–1.7.
/**
 * Nova requisição (1.8): o formulário do pedido e, para quem vê fichas,
 * "Puxar de uma ficha" — escolhe a ficha e quanto vai produzir, e a lista
 * volta pela receita (quantidade bruta; o pré-preparo vem pronto do estoque)
 * para conferir antes de pedir. A mesma tela no nível 1 e na pessoa.
 */

import type { OpcoesDoPedido } from '@/lib/erp/requisicao';
import type { LinhaDigitada } from '@/lib/erp/requisicao-campos';
import type { Setor } from '@/lib/erp/permissoes';
import { COR } from '@/lib/erp/modulos';
import { formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { CAMPO, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Aviso } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from '../estoque/estado';
import { FormPedido } from './form-pedido';

export interface ListaDaFichaNaTela {
  ficha: { id: string; nome: string; prato: boolean; unidade: 'KG' | 'L' | 'UN'; quantidadeMilesimos: number };
  linhas: LinhaDigitada[];
  avisos: string[];
}

export function TelaNovaRequisicao({
  o,
  base,
  contexto,
  acao,
  setorInicial,
  daFicha,
  erroDaFicha,
  escolha,
  bloqueio,
}: {
  o: OpcoesDoPedido;
  base: string;
  contexto?: string;
  acao: AcaoDeEstoque;
  setorInicial: Setor | null;
  daFicha: ListaDaFichaNaTela | null;
  erroDaFicha: string | null;
  escolha: { ficha: string; quantas: string };
  bloqueio: string | null;
}) {
  const daLoja = `${base}/${o.loja.id}`;
  const quadro = `${daLoja}/requisicoes`;
  const textoDaFicha = daFicha ? (daFicha.ficha.prato ? `${daFicha.ficha.quantidadeMilesimos / 1000} ${daFicha.ficha.quantidadeMilesimos === 1000 ? 'porção' : 'porções'}` : formatarQuantidade(daFicha.ficha.quantidadeMilesimos, daFicha.ficha.unidade)) : '';
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: o.loja.nome, href: quadro }, { rotulo: 'Nova' }]} />
      <Voltar href={quadro}>Voltar para as requisições</Voltar>
      <PageHeader icone="estoque" cor={COR.estoque} titulo="Nova requisição" subtitulo={[contexto, o.loja.nome, 'nada sai do estoque até alguém entregar'].filter(Boolean).join(' · ')} />
      {!o.aberto && <Aviso tom="alerta" titulo={`O estoque da ${o.loja.nome} ainda não foi aberto.`}>A requisição começa depois da contagem de abertura.</Aviso>}

      {o.fichas.length > 0 && (
        <details className="rounded-[14px] border border-linha bg-painel" open={!!(escolha.ficha || erroDaFicha)}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[13px] font-semibold text-texto sm:px-5 [&::-webkit-details-marker]:hidden">
            <span>Puxar de uma ficha técnica</span>
            <span className="text-[12px] font-normal text-suave">{daFicha ? daFicha.ficha.nome : 'vou produzir…'}</span>
          </summary>
          <form method="get" className="grid gap-3 border-t border-linha px-4 py-4 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end sm:px-5">
            <div>
              <label htmlFor="ficha" className={ROTULO}>
                Ficha
              </label>
              <select id="ficha" name="ficha" defaultValue={escolha.ficha} className={`${CAMPO} min-h-12 text-base sm:text-sm`}>
                <option value="">Escolha a ficha</option>
                {o.fichas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.tipo === 'PRE_PREPARO' ? ' · pré-preparo' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="quantas" className={ROTULO}>
                Quanto vai produzir
              </label>
              <input id="quantas" name="quantas" inputMode="decimal" defaultValue={escolha.quantas} placeholder="20 porções / 2 kg" className={`${CAMPO} min-h-12 text-right text-base tabular-nums sm:text-sm`} />
            </div>
            <button type="submit" className={classeDeBotao('secundario', 'min-h-12')}>
              Montar a lista
            </button>
            <p className="text-[12px] text-suave sm:col-span-3">
              A lista sai pela receita, já com o fator de correção. Pré-preparo da receita vem pronto do estoque (fazer o pré-preparo é outra requisição).
            </p>
            {erroDaFicha && (
              <p role="alert" className="text-[13px] text-erro sm:col-span-3">
                {erroDaFicha}
              </p>
            )}
            {daFicha?.avisos.map((a) => (
              <p key={a} className="text-[13px] text-atencao sm:col-span-3">
                {a}
              </p>
            ))}
          </form>
        </details>
      )}

      <FormPedido
        key={daFicha ? `${daFicha.ficha.id}:${daFicha.ficha.quantidadeMilesimos}` : 'livre'}
        acao={acao}
        listaDeInsumos={o.ativos}
        setorInicial={setorInicial}
        linhasIniciais={daFicha?.linhas ?? []}
        ficha={daFicha ? { id: daFicha.ficha.id, nome: daFicha.ficha.nome, quantidadeMilesimos: daFicha.ficha.quantidadeMilesimos, texto: textoDaFicha } : null}
        bloqueio={bloqueio ?? (o.aberto ? null : 'O estoque ainda não foi aberto.')}
      />
    </div>
  );
}
