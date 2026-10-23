/**
 * Peças das telas de etiqueta (3.4): o selo da validade (sempre com palavra; a cor só acompanha), a escolha da loja (as três
 * abas são por loja) e a frase de quando.
 */

import Link from 'next/link';
import { FORMATOS, quandoNaTela, type Formato } from '@/lib/erp/etiqueta-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Contagem, Painel, Selo, Vazio } from '../../ui/superficies';

export function SeloDaValidade({ situacao }: { situacao: { texto: string; tom: 'ok' | 'alerta' | 'erro' | 'neutro' } }) {
  return <Selo tom={situacao.tom}>{situacao.texto}</Selo>;
}

/**
 * O aviso em vermelho de quando a etiqueta não sai (rodada 1, decisão 417): o lote ou a embalagem venceu (não use, separe para
 * descarte, avise a gerência) ou o lote foi estornado. Card claro com borda fina; o vermelho fica só na frase.
 */
export function AvisoDeBloqueio({ frase, children }: { frase: string; children?: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-[14px] border border-linha bg-painel px-4 py-3 text-sm sm:px-5">
      <p className="font-semibold text-erro">{frase}</p>
      {children && <div className="mt-1 text-suave">{children}</div>}
    </div>
  );
}

type Qual = 'imprimir' | 'abrir' | 'historico';

const TITULO: Record<Qual, string> = {
  imprimir: 'Etiquetas por loja',
  abrir: 'Abrir embalagem: em qual loja?',
  historico: 'Histórico de impressões por loja',
};
const APOIO: Record<Qual, string> = {
  imprimir: 'os lotes concluídos e as embalagens abertas, prontos para a etiqueta',
  abrir: 'a data e a hora em que se abriu dão a validade',
  historico: 'o que foi pedido para imprimir, quantas, como e por quem',
};

const primeiraMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function TelaLojasDasEtiquetas({ qual, lojas, base, contexto }: { qual: Qual; lojas: { id: string; nome: string; naFila?: number }[]; base: string; contexto?: string }) {
  const destino = (id: string) => (qual === 'imprimir' ? `${base}/${id}` : qual === 'abrir' ? `${base}/${id}/abrir` : `${base}/historico/${id}`);
  return (
    <div className="space-y-6">
      <PageHeader icone={qual === 'abrir' ? 'insumo' : 'etiquetas'} cor={COR.etiquetas} titulo={TITULO[qual]} subtitulo={primeiraMaiuscula([contexto, APOIO[qual]].filter(Boolean).join(' · '))} />
      <Painel semRespiro>
        {lojas.length === 0 ? (
          <Vazio titulo="Nenhuma loja no seu acesso para etiquetas.">Peça a quem cuida da equipe para incluir as lojas em que você trabalha.</Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {lojas.map((l) => (
              <li key={l.id}>
                <Link href={destino(l.id)} className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-texto/[0.03] sm:px-5">
                  <span className="min-w-0 font-medium text-texto [overflow-wrap:anywhere]">{l.nome}</span>
                  {qual === 'imprimir' && (
                    <span className="shrink-0 text-[13px] tabular-nums text-suave">{l.naFila ? `${l.naFila} esperando a impressora` : 'nada na fila'}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}

/** As emissões já feitas de um lote ou de uma embalagem aberta: cada uma leva à tela dela (imprimir, reimprimir). */
export function ListaDeEmissoes({
  emissoes,
  base,
}: {
  emissoes: { id: string; codigo: string; formato: Formato; quantas: number; quantidade: string | null; impressaEm: Date | null; emitidaPorNome: string | null; pedidos: number }[];
  /** `<etiquetas>/<loja>`: a emissão mora em `<base>/<id>`. */
  base: string;
}) {
  return (
    <Painel titulo="Etiquetas já emitidas" subtitulo="Reimprimir usa a emissão: a validade não muda" acessorio={<Contagem>{emissoes.length}</Contagem>} semRespiro>
      {emissoes.length === 0 ? (
        <Vazio>Nenhuma etiqueta emitida ainda.</Vazio>
      ) : (
        <ul className="divide-y divide-linha">
          {emissoes.map((e) => (
            <li key={e.id}>
              <Link href={`${base}/${e.id}`} className="ff-transicao flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 hover:bg-texto/[0.03] sm:px-5">
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold tabular-nums text-texto">{e.codigo}</span>
                  <span className="block text-[12px] tabular-nums text-suave">
                    {e.quantas} {e.quantas === 1 ? 'etiqueta' : 'etiquetas'} {FORMATOS[e.formato]?.rotulo ?? ''}
                    {e.quantidade ? ` · ${e.quantidade} cada` : ''}
                    {e.impressaEm ? ` · ${quandoNaTela(e.impressaEm)}` : ''}
                    {e.emitidaPorNome ? ` por ${e.emitidaPorNome}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-suave">{e.pedidos === 0 ? 'ainda não foi para a impressora' : `${e.pedidos} ${e.pedidos === 1 ? 'pedido de impressão' : 'pedidos de impressão'}`}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}
