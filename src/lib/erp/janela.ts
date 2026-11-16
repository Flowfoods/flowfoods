/**
 * Janela de módulo (UX-MOD-2, piloto de 15/11/2026): quais telas abrem numa janela por cima da página em que a pessoa
 * estava, o que a janela mostra e as regras de navegação e de rascunho dela. Puro, testável.
 *
 * Piloto só do nível 1, dentro de um parceiro, na área Rede e Equipe. As rotas não mudam: o link direto, a recarga e a
 * abertura em outra aba continuam mostrando a tela inteira; a janela é a interceptação da navegação feita DENTRO do
 * parceiro (`@janela/(rede)/(.)<tela>` em `src/app/rodolfo/(painel)/erp/[slug]`). A tela é a mesma página, com as mesmas
 * conferências de acesso no servidor; a janela só muda onde ela aparece.
 */

import { ALCANCE_FLOWFOODS } from './permissoes';
import { TODOS_OS_MODULOS_COM_LIBERACAO } from './liberacao';
import { modulosDoParceiro, type ChaveIcone } from './modulos';

/** Área do piloto. */
export const AREA_DA_JANELA = 'rede';

/**
 * Telas da área que abrem na janela (o nome da pasta da rota). Integrações fica fora: no nível 1 ela só leva à Central de
 * Integrações, que é outra área; se abrisse na janela, a janela piscaria e sairia.
 */
export const TELAS_DA_JANELA = ['lojas', 'equipe', 'historico'] as const;
export type TelaDaJanela = (typeof TELAS_DA_JANELA)[number];

const ehTela = (s: string | undefined): s is TelaDaJanela => !!s && (TELAS_DA_JANELA as readonly string[]).includes(s);

export interface AreaDaJanela {
  nome: string;
  icone: ChaveIcone;
  cor: string;
  /** As telas da área que a janela mostra, na ordem do menu (as mesmas do menu: nunca divergem dele). */
  abas: { href: string; rotulo: string }[];
}

/** O que a janela mostra para o parceiro aberto em `base` (`/rodolfo/erp/<slug>`). */
export function areaDaJanela(base: string): AreaDaJanela {
  const area = modulosDoParceiro(ALCANCE_FLOWFOODS, base, TODOS_OS_MODULOS_COM_LIBERACAO).find((m) => m.chave === AREA_DA_JANELA);
  if (!area) throw new Error('A área Rede e Equipe não está no menu do parceiro.');
  const daJanela = new Set<string>(TELAS_DA_JANELA.map((t) => `${base}/${t}`));
  const abas = area.grupos.flatMap((g) => g.itens).filter((i) => daJanela.has(i.href)).map(({ href, rotulo }) => ({ href, rotulo }));
  return { nome: area.nome, icone: area.icone, cor: area.cor, abas };
}

// ─── Endereços ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** O caminho de um endereço, sem busca nem âncora. */
export function caminhoDe(endereco: string): string {
  return endereco.split(/[?#]/)[0];
}

/** A tela da janela que um caminho abre (`/rodolfo/erp/<slug>/<tela>`), de qualquer parceiro; `null` fora delas. */
export function telaDaJanela(caminho: string): { base: string; tela: TelaDaJanela } | null {
  const m = /^(\/rodolfo\/erp\/[^/?#]+)\/([^/?#]+)$/.exec(caminhoDe(caminho));
  return m && ehTela(m[2]) ? { base: m[1], tela: m[2] } : null;
}

/** Se o caminho é uma tela da janela DESTE parceiro (`base`). */
export function ehDaJanela(caminho: string, base: string): boolean {
  return telaDaJanela(caminho)?.base === base;
}

const semGrupos = (segmentos: readonly string[]) => segmentos.filter((s) => !s.startsWith('('));

/** A tela aberta no espaço `@janela`, pelos segmentos dele (`["(rede)", "(.)equipe"]` → `equipe`); `null` sem janela. */
export function telaAbertaNaJanela(segmentos: readonly string[]): TelaDaJanela | null {
  const s = segmentos.find((x) => x.startsWith('(.)'))?.slice(3);
  return ehTela(s) ? s : null;
}

/** O caminho da página de trás, pelos segmentos do espaço principal do parceiro (os grupos de rota não entram). */
export function caminhoDoFundo(base: string, segmentos: readonly string[]): string {
  const limpos = semGrupos(segmentos);
  return limpos.length ? `${base}/${limpos.join('/')}` : base;
}

/**
 * Se um destino abre como tela inteira (carga do endereço) em vez de abrir na janela:
 * - a página de trás já é uma das telas da janela (a tela inteira, aberta por link direto, recarga ou endereço antigo):
 *   a janela repetiria a tela por cima dela, com os mesmos ids atrás e na frente;
 * - o destino é uma tela da janela de OUTRO parceiro: a interceptação do Next guardaria o parceiro da página de trás.
 * `fundo`: os segmentos do espaço principal do parceiro aberto em `base`.
 */
export function destinoViraTelaInteira(destino: string, base: string, fundo: readonly string[]): boolean {
  const t = telaDaJanela(destino);
  if (!t) return false;
  return t.base !== base || ehTela(semGrupos(fundo)[0]);
}

/**
 * O shell descreve a página de trás, não a janela: com a janela aberta, o endereço é o da janela, mas a trilha, o menu
 * ativo, a ajuda e o Voltar do shell continuam os da página de trás. `segmentosDoPainel`: os segmentos abaixo do layout do
 * shell do nível 1 (`/rodolfo`), que seguem sempre o espaço principal. Devolve o caminho da página de trás, ou `null` quando
 * não há janela aberta (o caminho do endereço vale).
 */
export function fundoDaJanelaNoShell(caminho: string, segmentosDoPainel: readonly string[]): string | null {
  const t = telaDaJanela(caminho);
  if (!t) return null;
  const limpos = semGrupos(segmentosDoPainel);
  if (limpos[0] !== 'erp') return null;
  const fundo = `/rodolfo/${limpos.join('/')}`;
  if (fundo === caminhoDe(caminho)) return null;
  return fundo === t.base || fundo.startsWith(`${t.base}/`) ? fundo : null;
}

/**
 * Onde o botão de reabrir a janela minimizada aparece, sem cobrir a página: na barra do topo do shell (a partir de 768 px)
 * ou, abaixo disso, numa faixa no alto do conteúdo, no fluxo da página.
 */
export const ID_DA_JANELA_NA_BARRA = 'ff-janela-na-barra';
export const ID_DA_JANELA_NO_CONTEUDO = 'ff-janela-no-conteudo';

/** Limite da pilha de passos e dos passos ao fechar: um laço que não termina não pode prender a pessoa. */
export const PASSOS_MAXIMOS_AO_FECHAR = 50;

/**
 * Passos dentro da janela (o Voltar dela). A troca de aba e os links da tela SUBSTITUEM o endereço (a janela é uma entrada
 * só no histórico do navegador; o voltar do navegador fecha a janela); a pilha guarda por onde a pessoa passou.
 * O endereço novo empilha; o penúltimo desempilha (é o Voltar); o mesmo não conta.
 */
export function proximaPilha(pilha: string[], endereco: string): string[] {
  if (pilha.length === 0) return [endereco];
  if (pilha[pilha.length - 1] === endereco) return pilha;
  if (pilha.length > 1 && pilha[pilha.length - 2] === endereco) return pilha.slice(0, -1);
  return [...pilha, endereco].slice(-PASSOS_MAXIMOS_AO_FECHAR);
}

// ─── Rascunho ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Se o formulário conta para a pergunta de alteração não salva. Conta o formulário que grava; não conta busca nem filtro
 * (formulário GET, `role="search"` ou marcado com `data-filtro`) nem campo solto fora de formulário.
 */
export function contaComoRascunho(formulario: { metodo: string | null; papel: string | null; filtro: boolean } | null): boolean {
  if (!formulario) return false;
  if (formulario.filtro || formulario.papel === 'search') return false;
  return (formulario.metodo ?? '').trim().toLowerCase() !== 'get';
}

/** Um campo de formulário, só o que a regra do rascunho lê (no navegador, o próprio elemento; nos testes, um objeto). */
export interface CampoDoRascunho {
  tagName: string;
  type?: string;
  disabled?: boolean;
  value?: string;
  defaultValue?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  multiple?: boolean;
  selectedIndex?: number;
  files?: { length: number } | null;
  options?: ArrayLike<{ selected: boolean; defaultSelected: boolean }>;
  hasAttribute?: (nome: string) => boolean;
}

const SEM_VALOR_DIGITADO = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

/**
 * Se o campo está diferente do que a tela desenhou (o valor original do HTML: `defaultValue`, `defaultChecked`,
 * `defaultSelected`). Campo desligado, oculto, botão ou marcado com `data-filtro` não conta.
 */
export function campoAlterado(c: CampoDoRascunho): boolean {
  if (c.disabled || c.hasAttribute?.('data-filtro')) return false;
  const tag = c.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return (c.value ?? '') !== (c.defaultValue ?? '');
  if (tag === 'SELECT') {
    const opcoes = Array.from(c.options ?? []);
    if (c.multiple) return opcoes.some((o) => o.selected !== o.defaultSelected);
    // Escolha única: sem `selected` no HTML, a primeira opção é a desenhada; com mais de um, vale o último.
    let desenhada = 0;
    opcoes.forEach((o, i) => {
      if (o.defaultSelected) desenhada = i;
    });
    return opcoes.length > 0 && (c.selectedIndex ?? 0) !== desenhada;
  }
  if (tag !== 'INPUT') return false;
  const tipo = (c.type ?? 'text').toLowerCase();
  if (SEM_VALOR_DIGITADO.has(tipo)) return false;
  if (tipo === 'checkbox' || tipo === 'radio') return !!c.checked !== !!c.defaultChecked;
  if (tipo === 'file') return (c.files?.length ?? 0) > 0;
  return (c.value ?? '') !== (c.defaultValue ?? '');
}

/** O que está nos campos agora, para saber se mudou desde o último envio. */
export function fotografiaDosCampos(campos: ArrayLike<CampoDoRascunho>): string {
  return JSON.stringify(
    Array.from(campos).map((c) => {
      const tipo = (c.type ?? '').toLowerCase();
      if (tipo === 'checkbox' || tipo === 'radio') return c.checked ? 1 : 0;
      if (tipo === 'file') return c.files?.length ?? 0;
      if (c.tagName.toUpperCase() === 'SELECT') return Array.from(c.options ?? []).map((o) => (o.selected ? 1 : 0)).join('');
      return c.value ?? '';
    }),
  );
}

/**
 * Se um formulário guarda alteração não salva, avaliado na hora da pergunta (fechar, voltar, sair, buscar, recarregar):
 * - algum campo está diferente do que a tela desenhou; e
 * - o formulário não foi enviado assim. O que foi enviado e não voltou com erro conta como entregue: a tela redesenha com o
 *   valor salvo (então nada difere) ou mantém o que a pessoa digitou. Erro na tela depois do envio (`comErro`) rearma.
 * Cada formulário conta sozinho: enviar um não tira a proteção do que foi digitado em outro.
 * `enviado`: a fotografia dos campos no último envio deste formulário, ou `null` se nunca foi enviado.
 */
export function formularioComRascunho(f: { campos: ArrayLike<CampoDoRascunho>; enviado: string | null; comErro: boolean }): boolean {
  if (!Array.from(f.campos).some(campoAlterado)) return false;
  if (f.enviado === null || f.comErro) return true;
  return fotografiaDosCampos(f.campos) !== f.enviado;
}
