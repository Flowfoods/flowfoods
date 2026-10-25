/**
 * Início de trabalho (24/10/2026, referência: painéis da Nina e Início do
 * iFood): o que a pessoa precisa ver ao abrir o ERP — poucos números e "o que
 * precisa de você", com o atalho para resolver. Cada bloco só existe com a
 * permissão dele (faturamento, preços, estoque); quem não tem nada disso vê só
 * as áreas, como antes. Reaproveita as leituras das telas (nenhuma conta nova).
 */

import { obterMes } from './faturamento';
import { pode, type Alcance } from './permissoes';
import { saudeDoCardapio } from './saude-do-cardapio';
import { situacaoDoEstoque } from './estoque';
import { hojeNoRio } from './compra-campos';
import type { ClienteDoParceiro } from './tenant';

export interface IndicadorDoDia {
  chave: string;
  rotulo: string;
  /** Centavos (dinheiro), contagem "x de y" ou um número simples (painel do nível 1: respostas, pedidos). */
  valor: { tipo: 'dinheiro'; centavos: number } | { tipo: 'fracao'; de: number; total: number } | { tipo: 'numero'; numero: number | null };
  contexto: string;
  href: string;
}

export interface PendenciaDoDia {
  chave: string;
  titulo: string;
  texto: string;
  href: string;
  acao: string;
}

export interface PainelDoDia {
  indicadores: IndicadorDoDia[];
  pendencias: PendenciaDoDia[];
}

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export async function painelDoDia(cliente: ClienteDoParceiro, alcance: Alcance, base: string, hoje = hojeNoRio()): Promise<PainelDoDia> {
  const indicadores: IndicadorDoDia[] = [];
  const pendencias: PendenciaDoDia[] = [];
  const mes = hoje.slice(0, 7);

  const [fat, saude, estoque] = await Promise.all([
    pode(alcance, 'faturamento.ver') ? obterMes(cliente, alcance, { mes }, hoje) : null,
    pode(alcance, 'fichas.ver') && pode(alcance, 'precos.ver') ? saudeDoCardapio(cliente) : null,
    pode(alcance, 'estoque.ver') ? situacaoDoEstoque(cliente, alcance) : null,
  ]);

  if (fat && fat.lojas.length > 0) {
    const lancados = new Set(fat.lojas.flatMap((l) => l.dias.filter((d) => d.total !== null).map((d) => d.data)));
    indicadores.push({
      chave: 'faturamento',
      rotulo: `Faturamento de ${MESES[Number(mes.slice(5, 7)) - 1]}`,
      valor: { tipo: 'dinheiro', centavos: fat.total.valorCentavos },
      contexto: lancados.size ? `${plural(lancados.size, 'dia lançado', 'dias lançados')} · ${plural(fat.total.pedidos, 'pedido', 'pedidos')}` : 'nenhum dia lançado ainda',
      href: `${base}/faturamento`,
    });
    if (fat.faltas > 0) {
      pendencias.push({
        chave: 'faturamento-faltas',
        titulo: `${plural(fat.faltas, 'canal sem lançamento', 'canais sem lançamento')} neste mês`,
        texto: 'Dia que a loja vendeu e ninguém lançou deixa o faturamento e o DRE incompletos.',
        href: `${base}/faturamento`,
        acao: 'Lançar o que falta',
      });
    }
  }

  if (saude && saude.pratos > 0) {
    indicadores.push({
      chave: 'cardapio',
      rotulo: 'Pratos prontos para o preço',
      valor: { tipo: 'fracao', de: saude.prontos, total: saude.pratos },
      contexto: 'CMV calculado em todos os canais que o prato vende',
      href: `${base}/fichas`,
    });
    if (saude.custoIncompleto > 0) {
      pendencias.push({
        chave: 'cardapio-custo',
        titulo: `${plural(saude.custoIncompleto, 'prato', 'pratos')} com custo incompleto`,
        texto: 'Falta preço em algum insumo da receita: sem ele não há CMV nem sugestão de preço.',
        href: `${base}/fichas?custo=incompleto`,
        acao: 'Ver as fichas',
      });
    } else if (saude.prontos < saude.pratos) {
      pendencias.push({
        chave: 'cardapio-preco',
        titulo: `${plural(saude.pratos - saude.prontos, 'prato espera', 'pratos esperam')} meta ou preço`,
        texto: 'O custo está completo; falta a meta de CMV do canal ou o preço escolhido.',
        href: `${base}/fichas`,
        acao: 'Ver a saúde do cardápio',
      });
    }
  }

  if (estoque && estoque.length > 0) {
    const ativas = estoque.filter((l) => l.ativa);
    const abertas = ativas.filter((l) => l.estado === 'ABERTO').length;
    indicadores.push({
      chave: 'estoque',
      rotulo: 'Lojas com estoque aberto',
      valor: { tipo: 'fracao', de: abertas, total: ativas.length },
      contexto: abertas === ativas.length ? 'compras e requisições já mexem no saldo' : 'a primeira contagem vira o saldo inicial',
      href: `${base}/estoque`,
    });
    const emContagem = ativas.filter((l) => l.estado === 'EM_CONTAGEM');
    const naoAbertas = ativas.filter((l) => l.estado === 'NAO_ABERTO');
    if (emContagem.length > 0) {
      const c = emContagem[0].contagem;
      pendencias.push({
        chave: 'estoque-contagem',
        titulo: `Contagem de abertura em andamento${emContagem.length === 1 ? ` em ${emContagem[0].nome}` : ` em ${emContagem.length} lojas`}`,
        texto: c ? `${c.contados} de ${c.total} itens contados. Termine para o saldo começar a valer.` : 'Termine para o saldo começar a valer.',
        href: `${base}/estoque`,
        acao: 'Continuar a contagem',
      });
    }
    if (naoAbertas.length > 0) {
      pendencias.push({
        chave: 'estoque-abrir',
        titulo: `${plural(naoAbertas.length, 'loja', 'lojas')} sem estoque aberto`,
        texto: 'Sem saldo inicial, a compra não entra no estoque e o CMV real do mês fica sem base.',
        href: `${base}/estoque`,
        acao: 'Abrir o estoque',
      });
    }
  }

  return { indicadores, pendencias };
}
