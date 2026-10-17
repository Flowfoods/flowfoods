// Scanner avoid-ai-design, SD4d (P2) aceito: "Vila da Penha · nada sai do estoque…" é a linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–1.8.
/**
 * Nova produção (3.1): escolhe o pré-preparo e quanto vai produzir ("Montar a lista"); a lista de insumos volta pela
 * receita (bruta, com o fator de correção) e é editável antes de planejar. Planejar cria o lote e a requisição dos insumos
 * juntos; nada sai do estoque até o estoque entregar. A mesma tela no nível 1 e na pessoa do parceiro.
 */

import type { FichaParaProduzir, OpcoesDaProducao } from '@/lib/erp/producao';
import type { LinhaDigitada } from '@/lib/erp/requisicao-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarQuantidade, UNIDADES } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { CAMPO, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Aviso, Painel, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from '../estoque/estado';
import { FormPlanejar } from './form-planejar';

export interface ListaParaPlanejar {
  ficha: { id: string; nome: string; unidade: 'KG' | 'L' | 'UN'; quantidadeMilesimos: number };
  linhas: LinhaDigitada[];
  avisos: string[];
}

export function TelaNovaProducao({
  o,
  base,
  contexto,
  acao,
  lista,
  erroDaLista,
  escolha,
  bloqueio,
}: {
  o: OpcoesDaProducao;
  base: string;
  contexto?: string;
  acao: AcaoDeEstoque;
  lista: ListaParaPlanejar | null;
  erroDaLista: string | null;
  escolha: { ficha: string; quantas: string };
  bloqueio: string | null;
}) {
  const quadro = `${base}/${o.loja.id}`;
  const fichaDaLista: FichaParaProduzir | undefined = lista ? o.fichas.find((f) => f.id === lista.ficha.id) : undefined;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: o.loja.nome, href: quadro }, { rotulo: 'Nova produção' }]} />
      <Voltar href={quadro}>Voltar para a produção</Voltar>
      <PageHeader icone="producao" cor={COR.producao} titulo="Nova produção" subtitulo={[contexto, o.loja.nome, 'nada sai do estoque até o estoque entregar'].filter(Boolean).join(' · ')} />
      {!o.aberto && <Aviso tom="alerta" titulo={`O estoque da ${o.loja.nome} ainda não foi aberto.`}>A produção começa depois da contagem de abertura.</Aviso>}

      {o.fichas.length === 0 ? (
        <Painel>
          <Vazio titulo="Nenhum pré-preparo para produzir.">Só se produz pré-preparo (molho, base, calda…): cadastre a ficha técnica dele em Fichas e produtos.</Vazio>
        </Painel>
      ) : (
        <Painel titulo="1. O que vai produzir" subtitulo="Escolha o pré-preparo e quanto: a lista de insumos sai da receita">
          <form method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
            <div>
              <label htmlFor="ficha" className={ROTULO}>
                Pré-preparo
              </label>
              <select id="ficha" name="ficha" defaultValue={escolha.ficha} className={`${CAMPO} min-h-12 text-base sm:text-sm`}>
                <option value="">Escolha o pré-preparo</option>
                {o.fichas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} · {UNIDADES[f.unidade].sigla}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="quantas" className={ROTULO}>
                Quanto vai produzir
              </label>
              <input id="quantas" name="quantas" inputMode="decimal" defaultValue={escolha.quantas} placeholder="Ex.: 5" className={`${CAMPO} min-h-12 text-right text-base tabular-nums sm:text-sm`} />
            </div>
            <button type="submit" className={classeDeBotao('secundario', 'min-h-12')}>
              Montar a lista
            </button>
            <p className="text-[12px] text-suave sm:col-span-3">Na unidade do rendimento da ficha (kg, L ou un): 5 é cinco quilos de molho.</p>
            {erroDaLista && (
              <p role="alert" className="text-[13px] text-erro sm:col-span-3">
                {erroDaLista}
              </p>
            )}
            {lista?.avisos.map((a) => (
              <p key={a} className="text-[13px] text-atencao sm:col-span-3">
                {a}
              </p>
            ))}
          </form>
        </Painel>
      )}

      {lista && fichaDaLista ? (
        <FormPlanejar
          key={`${lista.ficha.id}:${lista.ficha.quantidadeMilesimos}`}
          acao={acao}
          listaDeInsumos={o.ativos}
          linhasIniciais={lista.linhas}
          ficha={{ id: lista.ficha.id, nome: lista.ficha.nome, quantidade: escolha.quantas, texto: formatarQuantidade(lista.ficha.quantidadeMilesimos, lista.ficha.unidade), validade: fichaDaLista.validade }}
          bloqueio={bloqueio ?? (o.aberto ? null : 'O estoque ainda não foi aberto.')}
        />
      ) : (
        o.fichas.length > 0 && <p className="text-sm text-suave">Escolha o pré-preparo e quanto vai produzir para ver a lista de insumos.</p>
      )}
    </div>
  );
}
