/**
 * ERP 1.4 · Validade por conservação, sem banco — e as heranças puras da 1.3:
 * (a) o insumo produzido por um pré-preparo não entra como insumo comum;
 * (b) a limpeza de JPEG guarda só os marcadores que desenham a imagem;
 * (d) faxina de foto pendente com teto e intervalo (também ao abrir a lista).
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FAXINA, faxinarPendentes, faxinarPendentesDeVezEmQuando } from '@/lib/erp/arquivos';
import { lerFormFicha, type InsumoDaFicha, type PreparoDaFicha } from '@/lib/erp/ficha-campos';
import { limparMetadados, MENSAGEM_JPEG_ESTRANHO } from '@/lib/erp/foto-metadados';
import { GPS, JPG_LIMPO, jpgComGps } from './erp-fotos-teste';

const ins = (id: string, nome: string, extra: Partial<InsumoDaFicha> = {}): InsumoDaFicha => ({
  id,
  nome,
  unidade: 'KG',
  ativo: true,
  conteudoMilesimos: 1000,
  precoEmbalagemCentavos: 500,
  taxaEntregaCentavos: 0,
  ...extra,
});

describe('ERP 1.4 (herança a da 1.3) · insumo produzido não entra como insumo comum', () => {
  const CEBOLA = ins('cebola', 'Cebola');
  const MOLHO_INSUMO = ins('molho-insumo', 'Molho cheddar', { produzidoPor: 'Molho cheddar', precoEmbalagemCentavos: 0 });
  const MOLHO: PreparoDaFicha = { id: 'molho', nome: 'Molho cheddar', tipo: 'PRE_PREPARO', ativa: true, unidadeRendimento: 'KG' };
  const doCadastro = new Map([CEBOLA, MOLHO_INSUMO].map((i) => [i.id, i]));

  it('formulário forjado com o id do insumo produzido é recusado na linha, apontando o pré-preparo', () => {
    const r = lerFormFicha(
      { nome: 'Burger', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: 'molho-insumo', quantidade: '40', unidade: 'g' }] },
      doCadastro,
      new Set(['molho-insumo']), // nem estando "já na ficha" ele passa
      { preparos: new Map([[MOLHO.id, MOLHO]]) },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros['item-0']).toMatch(/pré-preparo “Molho cheddar”: escolha-o em “Pré-preparos”/);
  });

  it('pelo pré-preparo (subficha) entra normalmente', () => {
    const r = lerFormFicha(
      { nome: 'Burger', tipo: 'PRATO', rendimento: '1', itens: [{ subfichaId: 'molho', quantidade: '40', unidade: 'g' }, { insumoId: 'cebola', quantidade: '10', unidade: 'g' }] },
      doCadastro,
      new Set(),
      { preparos: new Map([[MOLHO.id, MOLHO]]) },
    );
    expect(r.ok).toBe(true);
  });
});

describe('ERP 1.4 (herança b da 1.3) · JPEG: só marcadores conhecidos ficam; o resto recusa', () => {
  /** O JPEG limpo com um segmento a mais logo depois do SOI. */
  const comSegmento = (marcador: number, dados: number[]) =>
    new Uint8Array([0xff, 0xd8, 0xff, marcador, 0, dados.length + 2, ...dados, ...JPG_LIMPO.subarray(2)]);
  const texto = (b: Uint8Array) => Buffer.from(b).toString('latin1');

  it('o JPEG de celular (EXIF/GPS, APP13, comentário, miniatura) sai limpo e inteiro', () => {
    const r = limparMetadados(jpgComGps(), 'jpg');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(texto(r.bytes)).not.toContain(GPS);
    expect(r.bytes[r.bytes.length - 2]).toBe(0xff);
    expect(r.bytes[r.bytes.length - 1]).toBe(0xd9);
  });

  it('APPn desconhecido (APP3, APP15) e comentário SAEM sem recusar a foto', () => {
    for (const m of [0xe3, 0xef, 0xfe]) {
      const r = limparMetadados(comSegmento(m, [...Buffer.from(`segredo ${GPS}`)]), 'jpg');
      expect(r.ok, `marcador ${m.toString(16)}`).toBe(true);
      if (r.ok) expect(texto(r.bytes)).not.toContain(GPS);
    }
  });

  it('marcador fora da lista (JPG0 F0, DHP DE, reservado 02, JPG13 FD) recusa a foto inteira', () => {
    for (const m of [0xf0, 0xde, 0x02, 0xfd]) {
      expect(limparMetadados(comSegmento(m, [1, 2, 3, 4]), 'jpg'), `marcador ${m.toString(16)}`).toEqual({ ok: false, erro: MENSAGEM_JPEG_ESTRANHO });
    }
    // TEM (FF01) não tem tamanho: também fora.
    const tem = new Uint8Array([0xff, 0xd8, 0xff, 0x01, ...JPG_LIMPO.subarray(2)]);
    expect(limparMetadados(tem, 'jpg')).toEqual({ ok: false, erro: MENSAGEM_JPEG_ESTRANHO });
  });

  it('DNL (DC) e EXP (DF) estão na lista e ficam', () => {
    for (const m of [0xdc, 0xdf]) {
      const r = limparMetadados(comSegmento(m, [0, 2]), 'jpg');
      expect(r.ok, `marcador ${m.toString(16)}`).toBe(true);
      if (r.ok) expect(Array.from(r.bytes.subarray(2, 4))).toEqual([0xff, m]);
    }
  });
});

describe('ERP 1.4 (herança d da 1.3) · faxina de pendentes barata, com teto e intervalo', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'erp-faxina-'));
  process.env.ERP_ARQUIVOS_DIR = pasta;
  afterAll(() => rmSync(pasta, { recursive: true, force: true }));
  const pendentes = (parceiro: string) => join(pasta, parceiro, 'fichas', 'pendentes');
  const criar = (parceiro: string, n: number, horasAtras: number) => {
    mkdirSync(pendentes(parceiro), { recursive: true });
    const quando = new Date(Date.now() - horasAtras * 3600_000);
    for (let i = 0; i < n; i++) {
      const nome = `${(Math.random().toString(16).slice(2) + '0'.repeat(32)).slice(0, 32)}.jpg`;
      writeFileSync(join(pendentes(parceiro), nome), 'x');
      utimesSync(join(pendentes(parceiro), nome), quando, quando);
    }
  };

  it('apaga só as de mais de 24 h, e no máximo FAXINA.apagar por vez', async () => {
    criar('p1', FAXINA.apagar + 5, 30);
    criar('p1', 3, 1);
    expect(await faxinarPendentes('p1')).toBe(FAXINA.apagar);
    expect(await faxinarPendentes('p1')).toBe(5);
    expect(readdirSync(pendentes('p1'))).toHaveLength(3);
  });

  it('de vez em quando: a segunda chamada dentro do intervalo não varre; depois dele varre de novo', async () => {
    const t0 = Date.now();
    criar('p2', 2, 30);
    expect(await faxinarPendentesDeVezEmQuando('p2', t0)).toBe(2);
    criar('p2', 1, 30);
    expect(await faxinarPendentesDeVezEmQuando('p2', t0 + 1000)).toBeNull();
    expect(readdirSync(pendentes('p2'))).toHaveLength(1);
    expect(await faxinarPendentesDeVezEmQuando('p2', t0 + FAXINA.intervaloMs + 1)).toBe(1);
  });

  it('parceiro sem pasta não é erro', async () => {
    expect(await faxinarPendentesDeVezEmQuando('sem-pasta')).toBe(0);
  });
});
