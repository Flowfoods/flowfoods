import Link from 'next/link';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { TrilhaDaPagina } from '@/components/erp/shell/trilha';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Campo, CAMPO } from '@/components/erp/ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { COR } from '@/lib/erp/modulos';
import { InstanteDaIntegracao } from './data-da-situacao';

interface ConsultaReviewFila {
  lojaId: string;
  estado?: 'RASCUNHO' | 'APROVADA';
  depoisId?: string;
  itens: readonly { avaliacaoLocalId: string; estado: string; revisaoAtual: number; criadoEm: string }[];
  proximoId: string | null;
  selecionouSugestao: boolean;
  detalhe: { avaliacaoLocalId: string; texto: string; numero: number; criadoEm: string } | null;
}

interface PropsPainelReviewFila {
  central: string;
  parceiroNome: string;
  lojas: readonly { id: string; nome: string }[];
  consulta: ConsultaReviewFila | null;
}

const LINK_DA_FILA = `${LINK_DE_TEXTO} inline-flex min-h-11 items-center`;
const ID_DA_REVISAO = 'review-fila-revisao';

function SugestoesReview({ base, lojas, consulta }: {
  base: string; lojas: PropsPainelReviewFila['lojas']; consulta: ConsultaReviewFila;
}) {
  const { lojaId, estado, depoisId, itens, proximoId, detalhe } = consulta;
  function href(continuar?: string, avaliacao?: string) {
    const filtro = new URLSearchParams({ loja: lojaId });
    if (estado) filtro.set('estado', estado);
    if (continuar) filtro.set('depois', continuar);
    if (avaliacao) filtro.set('avaliacao', avaliacao);
    return `${base}?${filtro}${avaliacao ? `#${ID_DA_REVISAO}` : ''}`;
  }

  return <>
    <Painel titulo="Consultar fila editorial">
      <form action={base} method="get" aria-label="Filtrar sugestões da demonstração" className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,200px)_auto]">
        <Campo id="review-fila-loja" rotulo="Loja">
          <select id="review-fila-loja" name="loja" className={CAMPO} defaultValue={lojaId}>
            {lojas.map(loja => <option key={loja.id} value={loja.id}>{loja.nome}</option>)}
          </select>
        </Campo>
        <Campo id="review-fila-estado" rotulo="Estado editorial">
          <select id="review-fila-estado" name="estado" className={CAMPO} defaultValue={estado ?? ''}>
            <option value="">Todos os estados</option>
            <option value="RASCUNHO">Rascunhos</option>
            <option value="APROVADA">Aprovadas na simulação</option>
          </select>
        </Campo>
        <button type="submit" className={classeDeBotao('secundario')}>Consultar</button>
      </form>
    </Painel>
    {consulta.selecionouSugestao && (
      <div id={ID_DA_REVISAO} tabIndex={-1} className="scroll-mt-24">
        {detalhe ? (
          <Painel titulo={`Revisão ${detalhe.numero}`}>
            <p className="break-words text-[13px] text-suave">{detalhe.avaliacaoLocalId} · Registrada em <InstanteDaIntegracao valor={detalhe.criadoEm} />.</p>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-texto">{detalhe.texto}</p>
            <Link href={href(depoisId)} className={LINK_DA_FILA}>Fechar revisão</Link>
          </Painel>
        ) : <Aviso tom="neutro" titulo="Sugestão indisponível nesta consulta." />}
      </div>
    )}
    <Painel titulo="Sugestões da demonstração" semRespiro>
      {itens.length === 0 ? (
        <Vazio titulo="Nenhuma sugestão de demonstração nesta consulta." />
      ) : (
        <ul className="divide-y divide-linha">
          {itens.map(item => (
            <li key={item.avaliacaoLocalId} className="min-w-0 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 break-words text-sm font-semibold text-texto">{item.avaliacaoLocalId}</h3>
                <Selo tom={item.estado === 'APROVADA' ? 'ok' : 'neutro'}>
                  {item.estado === 'APROVADA' ? 'Aprovada na simulação' : 'Rascunho'}
                </Selo>
              </div>
              <p className="mt-1 text-[13px] text-suave">Revisão {item.revisaoAtual} · Criada em <InstanteDaIntegracao valor={item.criadoEm} />.</p>
              <Link href={href(depoisId, item.avaliacaoLocalId)} className={LINK_DA_FILA} prefetch={false}
                aria-label={`Ver revisão de ${item.avaliacaoLocalId}`}>Ver revisão</Link>
            </li>
          ))}
        </ul>
      )}
      {(depoisId || proximoId) && <nav aria-label="Páginas da fila editorial" className="flex flex-wrap gap-x-5 border-t border-linha px-4 sm:px-5">
        {depoisId && <Link href={href()} className={LINK_DA_FILA}>Voltar ao início da fila</Link>}
        {proximoId && <Link href={href(proximoId)} className={LINK_DA_FILA}>Próxima página</Link>}
      </nav>}
    </Painel>
  </>;
}

export function PainelReviewFila({ central, parceiroNome, lojas, consulta }: PropsPainelReviewFila) {
  return <div className="space-y-5">
    <TrilhaDaPagina itens={[{ rotulo: parceiroNome, href: central }, { rotulo: 'Avaliações em demonstração' }]} />
    <Voltar href={consulta ? `${central}?loja=${encodeURIComponent(consulta.lojaId)}` : central}>Voltar para Integrações</Voltar>
    <PageHeader icone="canais" cor={COR.parceiros} titulo="Avaliações em demonstração" subtitulo={parceiroNome} />
    <Aviso tom="alerta" titulo="Demonstração · dados simulados">
      A fila local é somente para consulta. Coleta e envio de respostas pelo iFood seguem previstos para Review.
    </Aviso>
    {consulta ? <SugestoesReview base={`${central}/review`} lojas={lojas} consulta={consulta} /> :
      <Vazio titulo="Nenhuma loja de teste disponível para consulta." />}
  </div>;
}
