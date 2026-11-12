/**
 * Classes do design system do ERP que servem a componente de servidor e de
 * cliente (link com cara de botão, por exemplo). Fonte única: nada de copiar
 * a string de botão em cada tela.
 */

export type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma';

const BASE =
  'ff-transicao inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-botao px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-10';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-acao text-sobre-acao hover:bg-acao-hover',
  // Sobre o fundo da página o botão é uma superfície (como na prévia aprovada); dentro de um painel, some na dele.
  secundario: 'border border-linha-forte bg-painel text-texto hover:border-texto/35 hover:bg-forte',
  // Sob o ponteiro, a superfície de destaque (par aprovado do vermelho): a 10 % sobre o fundo da página o texto caía a 4,35:1.
  perigo: 'border border-erro/45 text-erro hover:bg-destaque',
  fantasma: 'text-suave hover:bg-texto/5 hover:text-texto',
};

/** Classes do botão, para `<Link>` ou `<a>` que têm cara de botão. */
export function classeDeBotao(variante: Variante = 'secundario', extra = ''): string {
  return `${BASE} ${VARIANTES[variante]} ${extra}`;
}

/**
 * 3.3: o botão da tela da cozinha (no tablet compartilhado, de luva e com pressa): 56 px de altura em
 * qualquer largura e texto de 16 px. Mesmas cores e estados do botão normal.
 */
export function classeDeBotaoDaCozinha(variante: Variante = 'secundario', extra = ''): string {
  // Quebra a linha em vez de vazar: o nome de quem está com o lote pode ser longo.
  return `ff-transicao inline-flex min-h-14 items-center justify-center gap-2 rounded-botao px-5 py-2 text-center text-base font-semibold disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTES[variante]} ${extra}`;
}

/** Link de texto (canto de painel, "ver tudo"): sublinhado discreto, sem seta colada. */
export const LINK_DE_TEXTO =
  'ff-transicao rounded-[5px] text-[13px] font-medium text-texto underline decoration-linha-forte underline-offset-4 hover:decoration-texto';
