/**
 * Classes do design system do ERP que servem a componente de servidor e de
 * cliente (link com cara de botão, por exemplo). Fonte única: nada de copiar
 * a string de botão em cada tela.
 */

export type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma';

const BASE =
  'ff-transicao inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[7px] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-10';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-acao text-white hover:bg-acao-hover',
  secundario: 'border border-linha-forte text-texto hover:border-texto/35 hover:bg-texto/5',
  perigo: 'border border-erro/45 text-erro hover:bg-erro/10',
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
  return `ff-transicao inline-flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-[7px] px-5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTES[variante]} ${extra}`;
}

/** Link de texto (canto de painel, "ver tudo"): sublinhado discreto, sem seta colada. */
export const LINK_DE_TEXTO =
  'ff-transicao rounded-[5px] text-[13px] font-medium text-texto underline decoration-linha-forte underline-offset-4 hover:decoration-texto';
