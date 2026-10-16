import { describe, expect, it } from 'vitest';
import {
  custoDaEmbalagem,
  custoDaQuantidade,
  dividirArredondado,
  formatarQuantidade,
  lerDinheiro,
  lerQuantidade,
} from '@/lib/erp/unidades';

describe('ERP · quantidade em milésimos', () => {
  it('lê vírgula brasileira sem passar por float', () => {
    expect(lerQuantidade('1,5')).toBe(1500);
    expect(lerQuantidade('0,750')).toBe(750);
    expect(lerQuantidade('2,27')).toBe(2270);
    expect(lerQuantidade('1.234,5')).toBe(1_234_500);
    expect(lerQuantidade(' 12 ')).toBe(12_000);
  });

  it('recusa o que não é quantidade', () => {
    for (const t of ['', '-1', '1,2345', 'abc', '1.5', '1,2,3', '9999999999']) {
      expect(lerQuantidade(t), t).toBeNull();
    }
  });

  it('formata de volta na unidade certa', () => {
    expect(formatarQuantidade(5000, 'KG')).toBe('5 kg');
    expect(formatarQuantidade(2270, 'KG')).toBe('2,27 kg');
    expect(formatarQuantidade(750, 'L')).toBe('750 ml');
    expect(formatarQuantidade(12_000, 'UN')).toBe('12 un');
  });
});

describe('ERP · dinheiro em centavos', () => {
  it('lê preço com ou sem R$', () => {
    expect(lerDinheiro('89,90')).toBe(8990);
    expect(lerDinheiro('R$ 1.299,00')).toBe(129_900);
    expect(lerDinheiro('0')).toBe(0);
    expect(lerDinheiro('0,1')).toBe(10);
  });

  it('recusa terceira casa de centavo', () => {
    expect(lerDinheiro('1,999')).toBeNull();
  });

  it('o clássico 0,1 + 0,2 não existe aqui', () => {
    expect((lerDinheiro('0,1') ?? 0) + (lerDinheiro('0,2') ?? 0)).toBe(30);
  });
});

describe('ERP · custo por unidade base', () => {
  it('arredonda metade para cima, num critério só', () => {
    expect(dividirArredondado(5, 2)).toBe(3);
    expect(dividirArredondado(4, 3)).toBe(1);
    // R$ 96,50 por 2,27 kg = R$ 42,5110… → R$ 42,51/kg
    expect(custoDaQuantidade(custoDaEmbalagem(9650, 0, 2270)!, 1000)).toBe(4251);
    // R$ 18,00 por 12 un = R$ 1,50/un
    expect(custoDaQuantidade(custoDaEmbalagem(1800, 0, 12_000)!, 1000)).toBe(150);
  });
});
