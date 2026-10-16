// Scanner avoid-ai-design, SD4d (P2) aceito: "Vila da Penha · prazo 17/10 às 23:59 · começada por Gil" é linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–1.6.
/**
 * Montagem das telas de estoque comuns ao nível 1 e à pessoa do parceiro que
 * juntam cabeçalho + peça de cliente (a contagem). As rotas só resolvem
 * contexto e permissão e passam dados e actions prontos.
 *
 * Regra Nº 2 (1.7): UMA página de contar para a abertura (1.6), a contagem
 * do dia a dia e o fechamento do período — muda o título, a explicação e para
 * onde vai o "conferir".
 */

import type { ReactNode } from 'react';
import type { ContagemDeAbertura, ItemDaContagem } from '@/lib/erp/estoque';
import type { ContagemDaLoja } from '@/lib/erp/contagem';
import { ROTULO_DA_CONTAGEM } from '@/lib/erp/contagem-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import { TelaContagem } from './contagem';
import type { AcaoDeContar } from './estado';
import { fraseDoEstoque } from './estado';

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const quando = (d: Date) => DATA_HORA.format(d).replace(',', ' às');

function TelaDeContar({
  loja,
  base,
  contagemId,
  titulo,
  subtitulo,
  explicacao,
  aviso,
  feito,
  itens,
  acao,
  conferirHref,
  rotuloConferir,
  podeConcluir,
  paraOPiso,
}: {
  loja: { id: string; nome: string };
  base: string;
  contagemId: string;
  titulo: string;
  subtitulo: string;
  explicacao: ReactNode;
  aviso?: ReactNode;
  feito?: string;
  itens: ItemDaContagem[];
  acao: AcaoDeContar;
  conferirHref: string;
  rotuloConferir?: string;
  podeConcluir: boolean;
  paraOPiso?: string[];
}) {
  const aqui = `${base}/${loja.id}`;
  const mensagem = fraseDoEstoque(feito);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <TrilhaDaPagina itens={[{ rotulo: loja.nome, href: aqui }, { rotulo: titulo }]} />
      <Voltar href={aqui}>Voltar para o estoque da {loja.nome}</Voltar>
      <PageHeader icone="estoque" cor={COR.estoque} titulo={titulo} subtitulo={subtitulo} />
      {mensagem && <Aviso tom="ok" titulo={mensagem} />}
      {aviso}
      <p className="text-sm text-suave">{explicacao}</p>
      <TelaContagem
        contagemId={contagemId}
        itens={itens}
        acao={acao}
        conferirHref={conferirHref}
        rotuloConferir={rotuloConferir}
        saldoHref={aqui}
        podeConcluir={podeConcluir}
        paraOPiso={paraOPiso}
      />
    </div>
  );
}

/** Contagem de abertura (1.6). */
export function TelaPaginaDaContagem({ c, base, contexto, feito, acao, podeConcluir }: { c: ContagemDeAbertura; base: string; contexto?: string; feito?: string; acao: AcaoDeContar; podeConcluir: boolean }) {
  return (
    <TelaDeContar
      loja={c.loja}
      base={base}
      contagemId={c.contagem?.id ?? c.loja.id}
      titulo="Contagem de abertura"
      subtitulo={[contexto, c.loja.nome, c.contagem ? `começada ${quando(c.contagem.criadoEm)}${c.contagem.iniciadaPorNome ? ` por ${c.contagem.iniciadaPorNome}` : ''}` : null].filter(Boolean).join(' · ')}
      explicacao="Conte o que tem na loja agora. Caixa fechada vai em embalagens; o aberto, no solto (kg ou g). Deixe vazio o que ainda não contou; o que não tem, marque “Não tem”."
      feito={feito}
      itens={c.itens}
      acao={acao}
      conferirHref={`${base}/${c.loja.id}/abertura/conferir`}
      podeConcluir={podeConcluir}
    />
  );
}

/** Contagem do dia a dia ou do fechamento do período (1.7). */
export function TelaPaginaDaContagemDoDia({ c, base, contexto, feito, acao, podeConcluir }: { c: ContagemDaLoja; base: string; contexto?: string; feito?: string; acao: AcaoDeContar; podeConcluir: boolean }) {
  const fechamento = c.contagem.tipo === 'FECHAMENTO';
  const prazo = c.contagem.fechaAutomaticoEm;
  const conferir = `${base}/${c.loja.id}/contagens/${c.contagem.id}/conferir`;
  return (
    <TelaDeContar
      loja={c.loja}
      base={base}
      contagemId={c.contagem.id}
      titulo={c.contagem.titulo ?? (fechamento ? 'Fechamento do período' : 'Contagem')}
      subtitulo={[contexto, c.loja.nome, prazo ? `prazo ${quando(prazo)}` : null, c.contagem.iniciadaPorNome ? `começada por ${c.contagem.iniciadaPorNome}` : null].filter(Boolean).join(' · ')}
      explicacao={
        fechamento
          ? 'Conte o que ainda não foi contado no período. Os marcados “para o piso” são os de maior valor: com eles, a cobertura chega ao mínimo para fechar. Vazio = não contado (fica como está no livro).'
          : 'Conte o que tem agora. O número é comparado com o que o livro dizia na hora em que você contou; nota que chegar depois continua no estoque. Se tudo bater, a contagem fecha sozinha.'
      }
      aviso={
        c.estado === 'VENCIDA' ? (
          <Aviso tom="alerta" titulo={`${ROTULO_DA_CONTAGEM.VENCIDA}: o prazo acabou.`}>
            Números novos não entram. Peça ao gerente outra contagem.
          </Aviso>
        ) : undefined
      }
      feito={feito}
      itens={c.itens}
      acao={acao}
      conferirHref={conferir}
      rotuloConferir={fechamento ? 'Conferir e fechar' : 'Conferir divergências'}
      podeConcluir={podeConcluir}
      paraOPiso={c.paraOPiso}
    />
  );
}
