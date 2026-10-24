/**
 * F4 — busca do item ao montar a ficha: pelo nome ou pela categoria, sem acento e sem caixa, agrupada na ordem da casa.
 */
import { describe, expect, it } from 'vitest';
import { dobrar, filtrarOpcoes, type OpcaoDoSeletor } from '@/lib/erp/seletor-campos';

const op = (nome: string, grupo: string, ordemDoGrupo: number): OpcaoDoSeletor => ({ valor: nome, nome, grupo, ordemDoGrupo });
const OPCOES = [
  op('Cebola branca', 'Hortifrúti', 2),
  op('Peito de frango', 'Proteína', 1),
  op('Coxa de frango', 'Proteína', 1),
  op('Molho da casa', 'Pré-preparos da casa', -1),
  op('Sal grosso', 'Sem categoria', Number.MAX_SAFE_INTEGER),
  op('Pão brioche', 'Panificação', 3),
];

describe('F4 · busca do item da ficha', () => {
  it('sem texto: tudo, pré-preparos primeiro, categorias na ordem da casa e nomes em ordem', () => {
    const r = filtrarOpcoes(OPCOES, '');
    expect(r.grupos.map((g) => g.grupo)).toEqual(['Pré-preparos da casa', 'Proteína', 'Hortifrúti', 'Panificação', 'Sem categoria']);
    expect(r.grupos[1].opcoes.map((o) => o.nome)).toEqual(['Coxa de frango', 'Peito de frango']);
    expect(r.total).toBe(6);
  });

  it('acha pelo nome sem acento e sem caixa, com as palavras em qualquer ordem', () => {
    expect(filtrarOpcoes(OPCOES, 'PAO').grupos.flatMap((g) => g.opcoes.map((o) => o.nome))).toEqual(['Pão brioche']);
    expect(filtrarOpcoes(OPCOES, 'frango peito').grupos.flatMap((g) => g.opcoes.map((o) => o.nome))).toEqual(['Peito de frango']);
  });

  it('acha pela categoria: "proteina" traz as duas carnes; "hortifruti ceb" traz a cebola', () => {
    expect(filtrarOpcoes(OPCOES, 'proteina').total).toBe(2);
    expect(filtrarOpcoes(OPCOES, 'hortifruti ceb').grupos.flatMap((g) => g.opcoes.map((o) => o.nome))).toEqual(['Cebola branca']);
  });

  it('nada achado: lista vazia (a tela diz o que fazer); limite corta e conta o resto', () => {
    expect(filtrarOpcoes(OPCOES, 'xyz').grupos).toEqual([]);
    const muitos = Array.from({ length: 250 }, (_, i) => op(`Item ${String(i).padStart(3, '0')}`, 'Outros', 9));
    const r = filtrarOpcoes(muitos, 'item');
    expect(r.grupos[0].opcoes).toHaveLength(200);
    expect(r.cortadas).toBe(50);
  });

  it('dobrar: tira acento, caixa e espaço sobrando', () => {
    expect(dobrar('  Açúcar   Refinado ')).toBe('acucar refinado');
  });
});
