import { describe, expect, it } from 'vitest';
import { lerParecer } from '@/lib/integracoes/core/homologacao-campos';

const base = { estado: 'HOMOLOGADO', validacaoEm: '2026-11-07', liberacaoEm: '2026-11-08', referencia: 'https://developer.ifood.com.br/pt-BR/developer/applications/app-bi/details', conferido: 'sim' };
const hoje = '2026-11-08';

describe('parecer externo Analytics', () => {
  it('mantém datas distintas e não transforma aprovação técnica em liberação', () => {
    expect(lerParecer(base, hoje)).toMatchObject({ ok: true, dados: { validacaoEm: '2026-11-07', liberacaoEm: '2026-11-08' } });
    expect(lerParecer({ ...base, estado: 'EM_ANDAMENTO', liberacaoEm: '' }, hoje)).toMatchObject({ ok: true, dados: { estado: 'EM_ANDAMENTO', liberacaoEm: null } });
    expect(lerParecer({ ...base, liberacaoEm: '' }, hoje)).toMatchObject({ ok: false, erros: { liberacaoEm: expect.any(String) } });
  });
  it.each(['2026-02-30', '2026-11-09', '2026-11-07T12:00:00Z', '07/11/2026', '1999-01-01'])('recusa data %s', data => {
    expect(lerParecer({ ...base, validacaoEm: data }, hoje).ok).toBe(false);
  });
  it('exige ordem de datas, estado conhecido e conferência explícita', () => {
    for (const delta of [{ liberacaoEm: '2026-11-06' }, { validacaoEm: '' }, { estado: 'NAO_SE_APLICA' }, { estado: 'ATIVO' }, { conferido: '' }, { estado: 'RECUSADO' }]) expect(lerParecer({ ...base, ...delta }, hoje).ok).toBe(false);
  });
  it.each([
    'http://developer.ifood.com.br/pt-BR/developer/applications',
    'https://developer.ifood.com.br.evil.test/pt-BR/developer/applications',
    'https://user:secret@developer.ifood.com.br/pt-BR/developer/applications',
    'https://developer.ifood.com.br/pt-BR/developer/applications?token=segredo',
    'https://developer.ifood.com.br/pt-BR/developer/applications#segredo',
    'https://storage.example/report.pdf?signature=segredo',
    'Bearer segredo', '',
  ])('não guarda referência imprópria %s', referencia => expect(lerParecer({ ...base, referencia }, hoje).ok).toBe(false));
  it('permite registrar pendência ou recusa sem inventar datas', () => {
    for (const estado of ['PENDENTE', 'RECUSADO']) expect(lerParecer({ ...base, estado, validacaoEm: '', liberacaoEm: '' }, hoje)).toMatchObject({ ok: true, dados: { validacaoEm: null, liberacaoEm: null } });
  });
});
