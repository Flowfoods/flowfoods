/**
 * Montagem das telas de estoque comuns ao nível 1 e à pessoa do parceiro que
 * juntam cabeçalho + peça de cliente (a contagem). As rotas só resolvem
 * contexto e permissão e passam dados e actions prontos.
 */

import type { ContagemDeAbertura } from '@/lib/erp/estoque';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import { TelaContagem } from './contagem';
import type { AcaoDeContar } from './estado';
import { fraseDoEstoque } from './estado';

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function TelaPaginaDaContagem({
  c,
  base,
  contexto,
  feito,
  acao,
  podeConcluir,
}: {
  c: ContagemDeAbertura;
  base: string;
  contexto?: string;
  feito?: string;
  acao: AcaoDeContar;
  podeConcluir: boolean;
}) {
  const loja = `${base}/${c.loja.id}`;
  const mensagem = fraseDoEstoque(feito);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <TrilhaDaPagina itens={[{ rotulo: c.loja.nome, href: loja }, { rotulo: 'Contagem de abertura' }]} />
      <Voltar href={loja}>Voltar para o estoque da {c.loja.nome}</Voltar>
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo="Contagem de abertura"
        subtitulo={[contexto, c.loja.nome, c.contagem ? `começada ${DATA_HORA.format(c.contagem.criadoEm).replace(',', ' às')}${c.contagem.iniciadaPorNome ? ` por ${c.contagem.iniciadaPorNome}` : ''}` : null].filter(Boolean).join(' · ')}
      />
      {mensagem && <Aviso tom="ok" titulo={mensagem} />}
      <p className="text-sm text-suave">
        Conte o que tem na loja agora. Caixa fechada vai em embalagens; o aberto, no solto (kg ou g). Deixe vazio o que ainda não contou; o que não tem, marque “Não tem”.
      </p>
      <TelaContagem contagemId={c.contagem?.id ?? c.loja.id} itens={c.itens} acao={acao} conferirHref={`${loja}/abertura/conferir`} saldoHref={loja} podeConcluir={podeConcluir} />
    </div>
  );
}
