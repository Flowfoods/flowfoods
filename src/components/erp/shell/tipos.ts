/**
 * Dados que os layouts do shell (/erp e /rodolfo) entregam ao `AppShell`.
 * Tudo serializável: texto, número e server actions (as actions conferem
 * sessão e permissão de novo no servidor — o shell não decide nada).
 */

import type { EntradaParaATela, PreferenciaDeAjuda } from '@/lib/erp/ajuda-rota';
import type { Navegacao } from '@/lib/erp/modulos';
import type { OpcaoDeVisao } from '@/lib/erp/visao';
import type { Tema } from '@/lib/erp/tema';

export interface ResultadoDaBusca {
  tipo: 'tela' | 'acao' | 'parceiro' | 'insumo' | 'ficha';
  rotulo: string;
  detalhe: string;
  href: string;
  /** Insumo ou ficha desativada aparece marcada (achar ≠ usar). */
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

/**
 * Ajuda contextual (0.6). As entradas já vêm do servidor sem os blocos que a
 * pessoa não pode ler. `preferencia` nula = nível 1 dentro do parceiro: só o
 * botão "?", sem caixas e sem pergunta (não é uma `UsuarioErp`).
 */
export interface AjudaDoShell {
  entradas: EntradaParaATela[];
  preferencia: PreferenciaDeAjuda | null;
  /** Formulários da caixa (funcionam sem JavaScript). Nulo quando não há preferência. */
  acoes: {
    fechar: (form: FormData) => Promise<void>;
    dicas: (form: FormData) => Promise<void>;
    /** Pontos de ajuda: o card abriu sozinho / "Não mostrar novamente". */
    pontoVisto: (ponto: string) => Promise<void>;
    pontoNunca: (form: FormData) => Promise<void>;
  } | null;
  /** Dia de hoje no horário de Brasília (o mesmo dia que o servidor grava), para a regra dos 7 dias. */
  hoje: number;
  contato: { url: string; display: string };
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
  /** Ajuda contextual (0.6). Sem ela, não há botão "?" nem caixa. */
  ajuda?: AjudaDoShell;
  /** Nível 1 dentro de um parceiro: busca os insumos DELE. */
  buscarInsumosDoParceiro?: (slug: string, q: string) => Promise<ResultadoDaBusca[]>;
}
