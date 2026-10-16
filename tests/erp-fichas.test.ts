/**
 * ERP 1.2 · Ficha técnica — a parte pura: item digitado em g/kg/ml/L/un vira
 * milésimos do insumo; rendimento; custo EXATO (fração) e "custo incompleto";
 * planilha (CSV com linhas ruins, aspas, ; ou ,, Windows-1252); casamento com
 * os insumos; foto conferida pelos bytes; histórico legível.
 */
import { describe, expect, it } from 'vitest';
import {
  contaDaFicha,
  custoDaFicha,
  custoDoInsumo,
  formatarRendimento,
  itemParaCampo,
  lerFiltrosDeFicha,
  lerFormFicha,
  queryDosFiltrosDeFicha,
  rendimentoParaCampo,
  retratoDaFicha,
  type InsumoDaFicha,
} from '@/lib/erp/ficha-campos';
import { casarComInsumos, chaveDeNome, decodificarPlanilha, lerCsv, lerPlanilhaDeFichas } from '@/lib/erp/ficha-planilha';
import { conferirFoto, LIMITE_DA_FOTO, tipoPelosBytes } from '@/lib/erp/foto';
import { caminhoDaFoto } from '@/lib/erp/arquivos';
import { descreverMudancas } from '@/lib/erp/historico';
import { diferenca } from '@/lib/erp/insumo-campos';
import { centavosDaFracao, custoDaEmbalagem, custoExatoDaQuantidade, formatarFracao, somar, ZERO } from '@/lib/erp/unidades';

const nbsp = (s: string) => s.replace(/ /g, ' ');

const ins = (id: string, nome: string, unidade: 'KG' | 'L' | 'UN', conteudo: number, preco: number, frete = 0, ativo = true): InsumoDaFicha => ({
  id,
  nome,
  unidade,
  ativo,
  conteudoMilesimos: conteudo,
  precoEmbalagemCentavos: preco,
  taxaEntregaCentavos: frete,
});

const BLEND = ins('blend', 'Blend bovino', 'KG', 5000, 8990, 500); // R$ 94,90 por 5 kg
const PAO = ins('pao', 'Pão brioche', 'UN', 12_000, 1800); // R$ 18,00 a dúzia
const OLEO = ins('oleo', 'Óleo de soja', 'L', 900, 849, 40); // R$ 8,89 por 900 ml
const PICLES = ins('picles', 'Picles', 'KG', 2000, 0); // Sem preço
const GUARD = ins('guard', 'Guardanapo', 'UN', 1_000_000, 400); // R$ 4,00 o milheiro
const VELHO = ins('velho', 'Molho antigo', 'KG', 1000, 1000, 0, false);
const MAPA = new Map([BLEND, PAO, OLEO, PICLES, GUARD, VELHO].map((i) => [i.id, i]));

const xburger = (itens: { insumoId: string; quantidade: string; unidade: string }[], extra: Record<string, string> = {}) => ({
  nome: 'X-Burger',
  tipo: 'PRATO',
  rendimento: '1',
  descricao: 'Pão, blend 180 g e picles',
  modoPreparo: 'Selar o blend.\n\n\n\nMontar.',
  itens,
  ...extra,
});

describe('ERP 1.2 · item digitado em g/kg, ml/L ou un vira milésimos do insumo (no servidor)', () => {
  it('converte cada unidade na escala certa', () => {
    const r = lerFormFicha(
      xburger([
        { insumoId: 'blend', quantidade: '180', unidade: 'g' },
        { insumoId: 'pao', quantidade: '1', unidade: 'un' },
        { insumoId: 'oleo', quantidade: '0,05', unidade: 'L' },
        { insumoId: 'guard', quantidade: '2', unidade: 'un' },
      ]),
      MAPA,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.itens).toEqual([
      { insumoId: 'blend', quantidadeMilesimos: 180 },
      { insumoId: 'pao', quantidadeMilesimos: 1000 },
      { insumoId: 'oleo', quantidadeMilesimos: 50 },
      { insumoId: 'guard', quantidadeMilesimos: 2000 },
    ]);
    expect(r.dados).toMatchObject({ tipo: 'PRATO', rendimentoMilesimos: 1000, unidadeRendimento: 'UN' });
    // Modo de preparo guarda as quebras de linha, sem empilhar linhas vazias.
    expect(r.dados.modoPreparo).toBe('Selar o blend.\n\nMontar.');
  });

  it('recusa unidade de outra família, meio grama, zero, insumo repetido, desativado e de fora do cadastro', () => {
    const r = lerFormFicha(
      xburger([
        { insumoId: 'oleo', quantidade: '50', unidade: 'g' },
        { insumoId: 'blend', quantidade: '0,5', unidade: 'g' },
        { insumoId: 'pao', quantidade: '0', unidade: 'un' },
        { insumoId: 'pao', quantidade: '1', unidade: 'un' },
        { insumoId: 'velho', quantidade: '1', unidade: 'kg' },
        { insumoId: 'de-outro-parceiro', quantidade: '1', unidade: 'kg' },
        { insumoId: 'blend', quantidade: '1', unidade: 'kg' },
      ]),
      MAPA,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros['item-0']).toMatch(/medido em litro: use ml ou L/);
    expect(r.erros['item-1']).toMatch(/só números inteiros/);
    expect(r.erros['item-2']).toMatch(/maior que zero/);
    // Repetido é erro mesmo que a primeira linha tenha outro problema: uma linha por insumo.
    expect(r.erros['item-3']).toMatch(/já está na ficha \(item 3\)/);
    expect(r.erros['item-4']).toMatch(/desativado/);
    expect(r.erros['item-5']).toMatch(/não encontrado/);
    expect(r.erros['item-6']).toMatch(/já está na ficha \(item 2\)/);
  });

  it('insumo desativado que JÁ estava na ficha continua aceito na edição', () => {
    const r = lerFormFicha(xburger([{ insumoId: 'velho', quantidade: '30', unidade: 'g' }]), MAPA, new Set(['velho']));
    expect(r.ok).toBe(true);
  });

  it('sem item, nome curto e descrição longa são recusados', () => {
    const r = lerFormFicha({ nome: 'X', tipo: 'PRATO', descricao: 'a'.repeat(281), itens: [] }, MAPA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.erros).sort()).toEqual(['descricao', 'itens', 'nome']);
  });
});

describe('ERP 1.2 · rendimento: prato em porções inteiras; pré-preparo em kg/g, L/ml ou un', () => {
  const um = [{ insumoId: 'blend', quantidade: '1', unidade: 'kg' }];
  it('lê e devolve para o campo', () => {
    const prato = lerFormFicha({ nome: 'Combo', tipo: 'PRATO', rendimento: '4', itens: um }, MAPA);
    expect(prato.ok && prato.dados.rendimentoMilesimos).toBe(4000);
    const molho = lerFormFicha({ nome: 'Molho', tipo: 'PRE_PREPARO', rendimento: '750', rendimentoUnidade: 'g', itens: um }, MAPA);
    expect(molho.ok && [molho.dados.rendimentoMilesimos, molho.dados.unidadeRendimento]).toEqual([750, 'KG']);
    const caldo = lerFormFicha({ nome: 'Caldo', tipo: 'PRE_PREPARO', rendimento: '2,5', rendimentoUnidade: 'L', itens: um }, MAPA);
    expect(caldo.ok && [caldo.dados.rendimentoMilesimos, caldo.dados.unidadeRendimento]).toEqual([2500, 'L']);
    expect(formatarRendimento(4000, 'UN', 'PRATO')).toBe('4 porções');
    expect(formatarRendimento(1000, 'UN', 'PRATO')).toBe('1 porção');
    expect(formatarRendimento(750, 'KG', 'PRE_PREPARO')).toBe('750 g');
    expect(rendimentoParaCampo(750, 'KG', 'PRE_PREPARO')).toEqual({ texto: '750', em: 'g' });
    expect(rendimentoParaCampo(2500, 'L', 'PRE_PREPARO')).toEqual({ texto: '2,5', em: 'L' });
    expect(itemParaCampo(180, 'KG')).toEqual({ quantidade: '180', unidade: 'g' });
    expect(itemParaCampo(1500, 'KG')).toEqual({ quantidade: '1,5', unidade: 'kg' });
  });

  it('recusa porção quebrada, pré-preparo sem unidade e zero', () => {
    const e = (x: Record<string, string>) => {
      const r = lerFormFicha({ nome: 'Ficha', itens: um, ...x }, MAPA);
      return r.ok ? null : r.erros.rendimento;
    };
    expect(e({ tipo: 'PRATO', rendimento: '1,5' })).toMatch(/inteiro/);
    expect(e({ tipo: 'PRE_PREPARO', rendimento: '2' })).toMatch(/kg, g, L, ml ou un/);
    expect(e({ tipo: 'PRE_PREPARO', rendimento: '0', rendimentoUnidade: 'kg' })).toMatch(/maior que zero/);
  });
});

describe('ERP 1.2 · custo da ficha exato, arredondado só na tela; "Sem preço" = custo incompleto', () => {
  const item = (i: InsumoDaFicha, q: number) => ({ nome: i.nome, quantidadeMilesimos: q, fatorCorrecaoMilesimos: 1000, custo: custoDoInsumo(i) });

  it('soma exata: blend 180 g (341,64 c) + pão (150 c) + 2 guardanapos (0,8 c) = R$ 4,92 (não 342 + 150 + 1 = 4,93)', () => {
    const c = custoDaFicha([item(BLEND, 180), item(PAO, 1000), item(GUARD, 2000)], 1000);
    expect(c.semPreco).toEqual([]);
    expect(centavosDaFracao(c.total)).toBe(492n);
    expect(nbsp(formatarFracao(c.total))).toBe('R$ 4,92');
    expect(nbsp(formatarFracao(c.itens[2]!))).toBe('R$ 0,008');
    expect(nbsp(formatarFracao(c.itens[0]!))).toBe('R$ 3,42');
  });

  it('custo por porção = total ÷ rendimento', () => {
    const c = custoDaFicha([item(BLEND, 720), item(PAO, 4000)], 4000);
    // 720 g a R$ 18,98/kg = 1366,56 c; 4 pães = 600 c → 1966,56 c ÷ 4 = 491,64 c
    expect(centavosDaFracao(c.porRendimento)).toBe(492n);
    expect(nbsp(contaDaFicha(c, 4000, 'UN', 'PRATO'))).toBe('R$ 19,67 ÷ 4 porções = R$ 4,92 por porção');
  });

  it('insumo sem preço: o custo é incompleto, dito com o nome — nunca R$ 0,00 no lugar dele', () => {
    const c = custoDaFicha([item(BLEND, 180), item(PICLES, 20)], 1000);
    expect(c.semPreco).toEqual(['Picles']);
    expect(c.itens[1]).toBeNull();
    expect(nbsp(contaDaFicha(c, 1000, 'UN', 'PRATO'))).toBe('R$ 3,42 ÷ 1 porção = R$ 3,42 por porção, sem contar “Picles” (sem preço).');
  });

  it('fator de correção já entra na conta (1.3): FC 1,25 em 100 g = custo de 125 g', () => {
    const custo = custoDaEmbalagem(1000, 0, 1000)!; // R$ 10,00/kg
    expect(centavosDaFracao(custoExatoDaQuantidade(custo, 100, 1250))).toBe(125n);
  });

  it('números enormes não perdem precisão (BigInt), e somar com zero é neutro', () => {
    const f = custoExatoDaQuantidade(custoDaEmbalagem(2_000_000_000, 0, 1)!, 2_000_000_000);
    expect(somar(ZERO, f)).toEqual(f);
    expect(centavosDaFracao(f)).toBe(4_000_000_000_000_000_000n);
  });
});

describe('ERP 1.2 · planilha: CSV com linhas ruins, aspas, ; ou , e Windows-1252', () => {
  const CSV = [
    'Ficha;Tipo;Rende;Unidade_rende;Descrição;Modo de preparo;Insumo;Quantidade;Unidade',
    'X-Burger;prato;1;porção;Pão, blend e picles;"Selar o blend.',
    'Montar com ""capricho"".";Pão brioche;1;un',
    'X-Burger;;;;;;Blend bovino;180;g',
    ';;;;;;Cebola;1;kg',
    '',
    'Molho da casa;pré-preparo;750;g;;;Óleo de soja;100;ml',
    'X-Burger;pré-preparo;;;;;Picles;20;gr',
    'Batata;prato;1;;;;Batata palha;;kg',
  ].join('\r\n');

  it('lê registro com quebra de linha dentro das aspas e marca a linha em que começa', () => {
    const r = lerCsv(CSV);
    expect(r[1].linha).toBe(2);
    expect(r[1].campos[5]).toBe('Selar o blend.\r\nMontar com "capricho".');
    expect(r[2].linha).toBe(4);
  });

  it('agrupa por ficha; linha sem ficha, tipo divergente e quantidade vazia viram erro com a linha', () => {
    const l = lerPlanilhaDeFichas(CSV);
    expect(l.erros).toEqual([{ linha: 5, mensagem: 'Linha sem o nome da ficha (coluna “ficha”).' }]);
    const x = l.fichas.find((f) => f.nome === 'X-Burger')!;
    expect(x.linhas).toEqual([2, 4, 8]);
    expect(x.tipo).toBe('PRATO');
    expect(x.descricao).toBe('Pão, blend e picles');
    expect(x.itens.map((i) => [i.insumo, i.quantidade, i.unidade])).toEqual([
      ['Pão brioche', '1', 'un'],
      ['Blend bovino', '180', 'g'],
      ['Picles', '20', 'g'],
    ]);
    expect(x.erros).toEqual([{ linha: 8, mensagem: 'Tipo diferente do que veio antes para “X-Burger”.' }]);
    const molho = l.fichas.find((f) => f.nome === 'Molho da casa')!;
    expect([molho.tipo, molho.rende, molho.rendeEm]).toEqual(['PRE_PREPARO', '750', 'g']);
    expect(l.linhasLidas).toBe(6);
  });

  it('cabeçalho sem as colunas obrigatórias: um erro só, na linha 1', () => {
    const l = lerPlanilhaDeFichas('nome,insumo\nX,Y');
    expect(l.fichas).toEqual([]);
    expect(l.erros[0].mensagem).toMatch(/Faltam as colunas ficha, quantidade, unidade/);
  });

  it('aceita vírgula como separador e o CSV do Excel brasileiro (Windows-1252, com BOM ou sem)', () => {
    const bytes = new Uint8Array([...Buffer.from('ficha,insumo,quantidade,unidade\nPur', 'latin1'), 0xea, ...Buffer.from(',Batata,1,kg\n', 'latin1')]);
    const t = decodificarPlanilha(bytes);
    expect(t).toContain('Purê');
    expect(lerPlanilhaDeFichas(t).fichas[0].nome).toBe('Purê');
    expect(decodificarPlanilha(new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from('ficha')]))).toBe('ficha');
  });

  it('casa insumo pelo nome sem diferenciar maiúscula; o que não existe vira erro e sugestão', () => {
    const porNome = new Map([[chaveDeNome('Pão Brioche'), [{ id: 'pao' }]], [chaveDeNome('Blend bovino'), [{ id: 'blend' }]]]);
    const x = lerPlanilhaDeFichas(CSV).fichas.find((f) => f.nome === 'X-Burger')!;
    const c = casarComInsumos(x, porNome);
    expect(c.entrada.itens.map((i) => i.insumoId)).toEqual(['pao', 'blend']);
    expect(c.linhaDoItem).toEqual([2, 4]);
    expect(c.faltam).toEqual(['Picles']);
    expect(c.erros).toEqual([{ linha: 8, mensagem: 'Insumo “Picles” não está cadastrado.' }]);
  });
});

describe('ERP 1.2 · foto conferida pelos bytes, nome sorteado e caminho isolado', () => {
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const webp = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 ')]);

  it('aceita JPEG, PNG e WebP pelo conteúdo; recusa SVG, GIF, vazio e acima de 8 MB', () => {
    expect([tipoPelosBytes(jpg), tipoPelosBytes(png), tipoPelosBytes(webp)]).toEqual(['jpg', 'png', 'webp']);
    expect(conferirFoto(jpg)).toEqual({ ok: true, extensao: 'jpg', mime: 'image/jpeg', bytes: 7 });
    expect(conferirFoto(new TextEncoder().encode('<svg onload="alert(1)"/>'))).toEqual({ ok: false, erro: 'Use uma foto em JPG, PNG ou WebP.' });
    expect(conferirFoto(new TextEncoder().encode('GIF89a...')).ok).toBe(false);
    expect(conferirFoto(new Uint8Array()).ok).toBe(false);
    const grande = new Uint8Array(LIMITE_DA_FOTO + 1);
    grande.set(jpg);
    expect(conferirFoto(grande)).toEqual({ ok: false, erro: 'Foto acima de 8 MB. Tire outra ou reduza antes de enviar.' });
  });

  it('caminho = <base>/<parceiro>/fichas/<nome sorteado>; nada de ../', () => {
    const nome = `${'a'.repeat(32)}.jpg`;
    expect(caminhoDaFoto('ckparceiroA', nome, '/data/erp')).toBe(`/data/erp/ckparceiroA/fichas/${nome}`);
    expect(() => caminhoDaFoto('../outro', nome, '/data/erp')).toThrow();
    expect(() => caminhoDaFoto('ckparceiroA', '../../etc/passwd', '/data/erp')).toThrow();
    expect(() => caminhoDaFoto('ckparceiroA', 'foto.svg', '/data/erp')).toThrow();
  });
});

describe('ERP 1.2 · histórico da ficha: legível, só o que mudou', () => {
  const nomes = new Map([BLEND, PAO].map((i) => [i.id, i]));
  const dados = {
    nome: 'X-Burger',
    tipo: 'PRATO' as const,
    descricao: 'Pão e blend',
    modoPreparo: null,
    rendimentoMilesimos: 1000,
    unidadeRendimento: 'UN' as const,
    itens: [
      { insumoId: 'pao', quantidadeMilesimos: 1000 },
      { insumoId: 'blend', quantidadeMilesimos: 180 },
    ],
  };

  it('criação: rende, itens em frase e "com foto"', () => {
    const m = descreverMudancas(null, retratoDaFicha(dados, nomes, `${'b'.repeat(32)}.png`));
    expect(m.map((x) => [x.campo, x.depois])).toEqual([
      ['nome', 'X-Burger'],
      ['tipo', 'Prato'],
      ['rende', '1 porção'],
      ['descrição', 'Pão e blend'],
      ['foto', 'com foto'],
      ['insumos', 'Pão brioche 1 un · Blend bovino 180 g'],
    ]);
  });

  it('edição: troca de foto e de quantidade, com antes e depois', () => {
    const antes = retratoDaFicha(dados, nomes, `${'b'.repeat(32)}.png`);
    const depois = retratoDaFicha({ ...dados, itens: [dados.itens[0], { insumoId: 'blend', quantidadeMilesimos: 200 }] }, nomes, `${'c'.repeat(32)}.jpg`);
    const d = diferenca(antes, depois)!;
    expect(d.campos).toEqual(['foto', 'itens']);
    expect(descreverMudancas(d.antes, d.depois).map((x) => [x.campo, x.antes, x.depois])).toEqual([
      ['foto', 'foto anterior', 'foto nova'],
      ['insumos', 'Pão brioche 1 un · Blend bovino 180 g', 'Pão brioche 1 un · Blend bovino 200 g'],
    ]);
  });
});

describe('ERP 1.2 · filtros da lista de fichas na URL', () => {
  it('lê, devolve e ignora valor desconhecido', () => {
    const f = lerFiltrosDeFicha({ q: ' burger ', tipo: 'PRATO', situacao: 'xyz', custo: 'incompleto', pagina: '2' });
    expect(f).toEqual({ q: 'burger', tipo: 'PRATO', situacao: 'ativas', incompleto: true, pagina: 2 });
    expect(queryDosFiltrosDeFicha(f)).toBe('q=burger&tipo=PRATO&custo=incompleto&pagina=2');
    expect(lerFiltrosDeFicha({ tipo: '__proto__' }).tipo).toBeNull();
  });
});

describe('ERP 1.2 · rota de arquivo do /erp confere a permissão', () => {
  it('toda route.ts sob src/app/erp chama pode(...) ou exigirPermissao(...) com a sessão', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const andar = (d: string): string[] =>
      readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? andar(join(d, n)) : [join(d, n)]));
    const rotas = andar(join('src', 'app', 'erp')).filter((f) => f.endsWith('route.ts'));
    expect(rotas.length).toBeGreaterThan(0);
    for (const f of rotas) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).toMatch(/exigirParceiroDaSessao\(\)/);
      expect(t, f).toMatch(/pode\(ctx\.alcance, '[a-z]+\.[a-z]+'\)|exigirPermissao\(ctx, /);
    }
  });
});
