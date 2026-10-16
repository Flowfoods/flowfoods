/**
 * Dados que os layouts do shell (/erp e /rodolfo) entregam ao `AppShell`.
 * Tudo serializável: texto, número e server actions (as actions conferem
 * sessão e permissão de novo no servidor — o shell não decide nada).
 */

import type { Navegacao } from '@/lib/erp/modulos';
import type { OpcaoDeVisao } from '@/lib/erp/visao';
import type { Tema } from '@/lib/erp/tema';

export interface ResultadoDaBusca {
  tipo: 'tela' | 'parceiro' | 'insumo';
  rotulo: string;
  detalhe: string;
  href: string;
  /** Insumo desativado aparece marcado (achar ≠ usar). */
  desativado?: boolean;
}

export interface Notificacao {
  titulo: string;
  detalhe: string;
  href: string;
}

export type RespostaDaVisao = { ok: true } | { ok: false; mensagem: string };

/** Seletor de visão da pessoa do parceiro: as opções já vêm do servidor, filtradas pelo alcance. */
export interface VisaoDoParceiro {
  modo: 'parceiro';
  opcoes: OpcaoDeVisao[];
  valor: string | null;
  escolher: (valor: string) => Promise<RespostaDaVisao>;
}

/** Nível 1: escolhe o parceiro (navega) e, dentro dele, a loja (carregada sob demanda). */
export interface VisaoDoNivel1 {
  modo: 'nivel1';
  parceiros: { slug: string; nome: string; rotuloStatus: string }[];
  carregar: (slug: string) => Promise<{ opcoes: OpcaoDeVisao[]; valor: string | null } | null>;
  escolher: (slug: string, valor: string) => Promise<RespostaDaVisao>;
}

export interface PropsDoShell {
  navegacao: Navegacao;
  /** Linha de contexto embaixo da marca (o parceiro na sessão, ou "Nível 1 · FlowFoods"). */
  contexto: string;
  usuario: { nome: string; papel: string; email?: string };
  tema: Tema;
  menuRecolhido: boolean;
  versao: string;
  visao: VisaoDoParceiro | VisaoDoNivel1;
  notificacoes: Notificacao[];
  /** Links do menu do usuário. */
  links: { rotulo: string; href: string }[];
  /** Sair: server action (sessão do parceiro) ou null = next-auth (/rodolfo). */
  sair: (() => Promise<void>) | null;
  /** Busca de insumos no servidor. Sem ela, o ⌘K procura só telas (e parceiros). */
  buscarInsumos?: (q: string) => Promise<ResultadoDaBusca[]>;
  /** Nível 1 dentro de um parceiro: busca os insumos DELE. */
  buscarInsumosDoParceiro?: (slug: string, q: string) => Promise<ResultadoDaBusca[]>;
}
