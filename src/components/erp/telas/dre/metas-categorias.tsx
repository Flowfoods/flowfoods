/**
 * Metas por categoria (I.2a): a MESMA tela no nível 1 e na pessoa do parceiro. A rede define o conjunto de todas as lojas; cada
 * loja segue a rede ou personaliza o conjunto inteiro. Só quem define metas (`metas.editar`, com a rede inteira) chega aqui.
 */

import Link from 'next/link';
import type { SituacaoDasMetasPorCategoria } from '@/lib/erp/metas-categorias';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { FiltroEmLinks } from '../../ui/filtros';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Contagem, Painel, Selo, Vazio } from '../../ui/superficies';
import { ListaHistorico } from '../historico/lista-historico';
import type { AcaoLocal } from './estado';
import { FormMetasPorCategoria } from './form-metas-categorias';

const lista = (nomes: readonly string[]) => (nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`);

export function TelaDasMetasPorCategoria({
  s,
  base,
  raiz,
  contexto,
  acao,
  bloqueio,
}: {
  s: SituacaoDasMetasPorCategoria;
  /** `/erp/dre/metas-categorias` ou `/rodolfo/erp/<slug>/dre/metas-categorias`. */
  base: string;
  raiz: string;
  contexto: string;
  acao: AcaoLocal;
  bloqueio: string | null;
}) {
  const loja = s.escopo.tipo === 'loja' ? s.escopo : null;
  const comMeta = s.categorias.filter((c) => c.campo !== '').length;
  return (
    <div className="space-y-6">
      <PageHeader icone="cadastro" cor={COR.dre} titulo="Metas por categoria" subtitulo={`${loja ? loja.nome : contexto} · quanto cada categoria deve pesar na receita bruta`}>
        <FiltroEmLinks
          rotulo="Metas da rede ou de uma loja"
          quebra
          opcoes={[{ href: base, rotulo: 'Rede', ativo: !loja }, ...s.lojas.map((l) => ({ href: `${base}?loja=${l.id}`, rotulo: l.nome, ativo: loja?.lojaId === l.id }))]}
        />
      </PageHeader>

      {bloqueio && (
        <Aviso tom="alerta" titulo="Somente leitura.">
          {bloqueio}
        </Aviso>
      )}

      {s.categorias.length === 0 ? (
        <Painel>
          <Vazio titulo="A casa ainda não tem categorias.">As categorias dos insumos vêm antes das metas.</Vazio>
        </Painel>
      ) : (
        <Painel
          titulo={loja ? `Metas de ${loja.nome}` : 'Metas da rede'}
          subtitulo={
            loja
              ? s.segueARede
                ? 'Esta loja segue a rede. Personalize para ter metas só dela.'
                : 'Esta loja tem metas próprias, que a rede não muda.'
              : 'A rede vale para todas as lojas que seguem a rede. A meta total é a do CMV do DRE; as categorias dividem esse total.'
          }
          acessorio={
            <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              <Contagem>{comMeta} com meta</Contagem>
              {loja && (s.segueARede ? <Selo>Segue a rede</Selo> : <Selo tom="alerta">Metas próprias</Selo>)}
            </span>
          }
          semRespiro
        >
          {!loja && s.lojas.length > 0 && (
            <div className="space-y-1 px-4 pb-4 pt-4 text-[13px] sm:px-5">
              {s.seguem.length > 0 && (
                <p className="text-texto">
                  O que mudar aqui <strong className="font-semibold">vale para {lista(s.seguem.map((l) => l.nome))}</strong>.
                </p>
              )}
              {s.personalizadas.length > 0 && (
                <p className="text-suave">
                  Não muda {lista(s.personalizadas.map((l) => l.nome))}, que {s.personalizadas.length === 1 ? 'tem' : 'têm'} metas próprias.
                </p>
              )}
            </div>
          )}
          <div className={!loja && s.lojas.length > 0 ? '' : 'pt-4'}>
            <FormMetasPorCategoria
              key={`${s.versao}:${loja?.lojaId ?? 'rede'}`}
              acao={acao}
              alvo={loja ? 'loja' : 'rede'}
              categorias={s.categorias.map((c) => ({ id: c.id, chave: c.chave, nome: c.nome, ordem: c.ordem, ativa: c.ativa, sistema: c.sistema, usa: c.usa, campo: c.campo, campoDaRede: c.campoDaRede }))}
              totalCampo={s.totalCampo}
              totalBp={s.totalBp}
              segueInicial={s.segueARede}
              versao={s.versao}
              valeDesde={s.periodoAtual.inicio}
              periodoAtual={s.periodoAtual.nome}
              bloqueio={bloqueio}
            />
          </div>
          {s.historico.length > 0 && (
            <details className="border-t border-linha px-4 py-3 sm:px-5">
              <summary className="cursor-pointer text-[13px] font-medium text-texto">Últimas mudanças nas metas por categoria</summary>
              <div className="mt-3 -mx-4 sm:-mx-5">
                <ListaHistorico linhas={s.historico} />
              </div>
            </details>
          )}
        </Painel>
      )}

      <p className="text-[12px] leading-relaxed text-suave">
        A meta é o percentual da receita bruta, a mesma base do DRE e do farol.{' '}
        <Link href={`${raiz}/dre/cmv-categorias`} className={LINK_DE_TEXTO}>
          Ver o CMV por categoria
        </Link>
        {' · '}
        <Link href={`${raiz}/dre/plano`} className={LINK_DE_TEXTO}>
          Plano e metas do DRE
        </Link>
      </p>
    </div>
  );
}
