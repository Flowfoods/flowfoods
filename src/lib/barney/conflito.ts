/**
 * Conflito de interesse — Grupo Bibi Sucos.
 *
 * Rodolfo é gestor de Delivery, Fidelidade e IA do Grupo Bibi Sucos (16 lojas,
 * RJ). Prospectar concorrente direto do empregador cria problema real, então a
 * trava é de IMPORTAÇÃO: o lead entra no banco com status `CONFLITO` e nunca
 * fica elegível para cadência. Não é filtro de tela — filtro de tela se
 * desmarca.
 *
 * Regra (`ledsflowfoods/SKILL.md`): nos territórios onde o Bibi opera —
 * Tijuca, Norte Shopping, Botafogo e Rio Sul — excluir as categorias suco,
 * açaí e saladaria. O resto do território segue livre.
 */

import { CONFLITO_CATEGORIAS, CONFLITO_TERRITORIOS } from './regras';
import { normalizar } from './texto';

export interface EntradaConflito {
  categoria?: string | null;
  bairro?: string | null;
  /** Endereço entra na checagem porque "Norte Shopping" costuma vir só ali. */
  endereco?: string | null;
  nome?: string | null;
}

export interface ResultadoConflito {
  emConflito: boolean;
  /** Frase pronta para a timeline do lead e para o relatório de importação. */
  motivo?: string;
  territorio?: string;
  categoria?: string;
}

/**
 * O território é buscado em bairro + endereço + nome porque um quiosque de açaí
 * no Norte Shopping frequentemente tem bairro "Cachambi" e só o endereço (ou o
 * próprio nome) revela o shopping.
 */
function acharTerritorio(e: EntradaConflito): string | undefined {
  const alvo = normalizar([e.bairro, e.endereco, e.nome].filter(Boolean).join(' '));
  return CONFLITO_TERRITORIOS.find((t) => alvo.includes(t));
}

function acharCategoria(e: EntradaConflito): string | undefined {
  // Categoria e nome: "Bibi Sucos" e "Point do Açaí" se denunciam no nome mesmo
  // quando a categoria vem genérica como "Restaurante".
  const alvo = normalizar([e.categoria, e.nome].filter(Boolean).join(' '));
  return CONFLITO_CATEGORIAS.find((c) => alvo.includes(normalizar(c)));
}

export function checarConflito(e: EntradaConflito): ResultadoConflito {
  const territorio = acharTerritorio(e);
  if (!territorio) return { emConflito: false };

  const categoria = acharCategoria(e);
  if (!categoria) return { emConflito: false };

  return {
    emConflito: true,
    territorio,
    categoria,
    motivo:
      `Conflito de interesse: ${categoria} em ${territorio} — território do Grupo Bibi Sucos. ` +
      `Bloqueado para cadência na importação.`,
  };
}
