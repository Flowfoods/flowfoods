/**
 * Janela de módulo (UX-MOD-2, piloto de 15/11/2026): quais telas abrem numa janela por cima da página em que a pessoa
 * estava, e o que a janela mostra. Puro, testável.
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

/**
 * Se o que a pessoa digitou num campo conta como alteração não salva (fechar a janela pergunta antes). Conta o campo de um
 * formulário que grava; não conta busca nem filtro (formulário GET, `role="search"` ou marcado com `data-filtro`) nem
 * campo solto fora de formulário.
 */
export function contaComoRascunho(formulario: { metodo: string | null; papel: string | null; filtro: boolean } | null): boolean {
  if (!formulario) return false;
  if (formulario.filtro || formulario.papel === 'search') return false;
  return (formulario.metodo ?? '').trim().toLowerCase() !== 'get';
}

/** Limite de passos ao fechar (volta o histórico até sair da janela): um laço que não termina não pode prender a pessoa. */
export const PASSOS_MAXIMOS_AO_FECHAR = 50;
