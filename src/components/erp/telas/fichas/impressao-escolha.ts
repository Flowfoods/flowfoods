/**
 * Impressão da Ficha — escolha explícita de conteúdo financeiro (decisão de 31/10/2026).
 *
 * Máquina de estados pura da tela de impressão. A página chega SEMPRE sem preços e custos (o servidor nem os envia);
 * os valores só existem aqui depois que a pessoa escolhe "Com preços e custos" e o servidor confere a permissão. A
 * escolha vale para UMA impressão: terminou a janela do navegador, os valores são descartados e a tela volta à versão
 * sem valores. Abrir de novo começa em "Sem preços e custos". Cancelar nunca imprime.
 */

export type ConteudoDaImpressao = 'sem' | 'com';

export type EstadoDaImpressao<D> =
  /** Documento sem valores; diálogo fechado. */
  | { fase: 'parado'; dados: null }
  | { fase: 'escolhendo'; escolha: ConteudoDaImpressao; erro: string | null; dados: null }
  /** "Com preços e custos" confirmado: esperando o servidor. */
  | { fase: 'carregando'; dados: null }
  /** Pronto para chamar a janela de impressão uma vez (dados = null é a versão sem valores). */
  | { fase: 'imprimir'; dados: D | null }
  /** A janela de impressão que esta tela abriu está aberta. */
  | { fase: 'imprimindo'; dados: D | null };

export type EventoDaImpressao<D> =
  | { tipo: 'abrir' }
  | { tipo: 'escolher'; escolha: ConteudoDaImpressao; podeFinanceiro: boolean }
  | { tipo: 'cancelar' }
  | { tipo: 'confirmar'; podeFinanceiro: boolean }
  | { tipo: 'carregou'; dados: D }
  | { tipo: 'falhou'; erro: string }
  | { tipo: 'chamouImpressao' }
  /** `afterprint`. */
  | { tipo: 'terminouImpressao' }
  /** `beforeprint` que não foi aberto por esta tela (Ctrl+P, menu do navegador). */
  | { tipo: 'impressaoNativa' }
  | { tipo: 'descartar' };

export const SEM_PERMISSAO_FINANCEIRA = 'Seu acesso não inclui preços e custos. Imprima a versão sem valores.';

export function estadoInicialDaImpressao<D>(): EstadoDaImpressao<D> {
  return { fase: 'parado', dados: null };
}

const parado = <D>(): EstadoDaImpressao<D> => ({ fase: 'parado', dados: null });

export function transicaoDaImpressao<D>(estado: EstadoDaImpressao<D>, evento: EventoDaImpressao<D>): EstadoDaImpressao<D> {
  switch (evento.tipo) {
    case 'abrir':
      // Cada pedido recomeça em "Sem preços e custos" e sem valores na tela. Com a janela aberta ou carregando, ignora.
      if (estado.fase === 'carregando' || estado.fase === 'imprimindo') return estado;
      return { fase: 'escolhendo', escolha: 'sem', erro: null, dados: null };
    case 'escolher':
      if (estado.fase !== 'escolhendo') return estado;
      if (evento.escolha === 'com' && !evento.podeFinanceiro) return { ...estado, escolha: 'sem', erro: SEM_PERMISSAO_FINANCEIRA };
      return { ...estado, escolha: evento.escolha, erro: null };
    case 'cancelar':
      // Cancelar não imprime. Uma resposta que chegar depois é ignorada (`carregou` só vale em `carregando`).
      if (estado.fase === 'escolhendo' || estado.fase === 'carregando') return parado();
      return estado;
    case 'confirmar':
      if (estado.fase !== 'escolhendo') return estado;
      if (estado.escolha === 'sem') return { fase: 'imprimir', dados: null };
      if (!evento.podeFinanceiro) return { ...estado, escolha: 'sem', erro: SEM_PERMISSAO_FINANCEIRA };
      return { fase: 'carregando', dados: null };
    case 'carregou':
      return estado.fase === 'carregando' ? { fase: 'imprimir', dados: evento.dados } : estado;
    case 'falhou':
      return estado.fase === 'carregando' ? { fase: 'escolhendo', escolha: 'com', erro: evento.erro, dados: null } : estado;
    case 'chamouImpressao':
      return estado.fase === 'imprimir' ? { fase: 'imprimindo', dados: estado.dados } : estado;
    case 'terminouImpressao':
      return estado.fase === 'imprimir' || estado.fase === 'imprimindo' ? parado() : estado;
    case 'impressaoNativa':
      // Impressão que esta tela não abriu nunca leva valores: descarta antes de o navegador montar o papel.
      return estado.dados === null ? estado : parado();
    case 'descartar':
      return estado.fase === 'carregando' ? estado : parado();
  }
}
