import { describe, expect, it } from 'vitest';
import { materiaisDoFormulario } from '@/lib/erp/ficha-unificada-campos';

const campos = ['emb_canal', 'emb_insumo', 'emb_quantidade', 'emb_unidade'] as const;
const valores = ['DELIVERY_PROPRIO', 'embalagemA', '1,5', 'un'];
function formulario(comLinha = true) {
  const f = new FormData(); f.set('materiaisNoFormulario', 'sim'); f.set('versaoMateriais', 'origem-gravada');
  if (comLinha) campos.forEach((c, i) => f.append(c, valores[i])); return f;
}

describe('3C · envelope de materiais preserva omissão e exige envio íntegro', () => {
  it('formulário antigo não limpa associações nem transforma campos soltos em intenção', () => {
    const f = formulario(); f.delete('materiaisNoFormulario');
    expect(materiaisDoFormulario(f)).toEqual({ ok: true, materiais: undefined });
  });
  it('bloco explicitamente vazio retira; token vazio inicial é um texto válido', () => {
    const f = formulario(false); f.set('versaoMateriais', '');
    expect(materiaisDoFormulario(f)).toEqual({ ok: true, materiais: { versao: '', linhas: [] } });
  });
  it('preserva linhas dos dois canais e texto bruto para a validação de domínio', () => {
    const f = formulario(); ['IFOOD', 'embalagemB', 'texto inválido', 'g'].forEach((v, i) => f.append(campos[i], v));
    expect(materiaisDoFormulario(f)).toEqual({ ok: true, materiais: { versao: 'origem-gravada', linhas: [
      { canal: 'DELIVERY_PROPRIO', insumoId: 'embalagemA', quantidade: '1,5', unidade: 'un' },
      { canal: 'IFOOD', insumoId: 'embalagemB', quantidade: 'texto inválido', unidade: 'g' },
    ] } });
  });
  it('linha aberta em branco é ignorada, mas quantidade preenchida sem item permanece inválida para o domínio', () => {
    const f = formulario(false); ['IFOOD', '', '', 'un'].forEach((v, i) => f.append(campos[i], v));
    expect(materiaisDoFormulario(f)).toMatchObject({ ok: true, materiais: { linhas: [] } });
    f.set('emb_quantidade', '2');
    expect(materiaisDoFormulario(f)).toMatchObject({ ok: true, materiais: { linhas: [{ insumoId: '', quantidade: '2' }] } });
  });
  it.each(['LOJA', 'OUTRO', ''])('canal %s é recusado mesmo em linha vazia, sem virar retirada', canal => {
    const f = formulario(false); [canal, '', '', 'un'].forEach((v, i) => f.append(campos[i], v));
    expect(materiaisDoFormulario(f)).toMatchObject({ ok: false });
  });
  it('placeholder com unidade desconhecida é recusado; espaços em quantidade seguem para validação', () => {
    const f = formulario(false); ['IFOOD', '', '', 'unidade-forjada'].forEach((v, i) => f.append(campos[i], v));
    expect(materiaisDoFormulario(f)).toMatchObject({ ok: false });
    f.set('emb_unidade', 'un'); f.set('emb_quantidade', ' ');
    expect(materiaisDoFormulario(f)).toMatchObject({ ok: true, materiais: { linhas: [{ insumoId: '', quantidade: ' ' }] } });
  });
  it.each(campos)('lista paralela truncada em %s é erro, nunca retirada parcial', campo => {
    const f = formulario(); f.delete(campo); expect(materiaisDoFormulario(f)).toMatchObject({ ok: false });
  });
  it.each(campos)('arquivo no campo textual %s é recusado sem conversão silenciosa', campo => {
    const f = formulario(); f.set(campo, new File(['x'], 'texto.txt')); expect(materiaisDoFormulario(f)).toMatchObject({ ok: false });
  });
  it.each(['ausente', 'duplicada', 'arquivo'])('versão %s não pode representar origem válida', tipo => {
    const f = formulario();
    if (tipo === 'ausente') f.delete('versaoMateriais');
    else if (tipo === 'duplicada') f.append('versaoMateriais', 'outra-origem');
    else f.set('versaoMateriais', new File(['x'], 'origem.txt'));
    expect(materiaisDoFormulario(f)).toMatchObject({ ok: false });
  });
  it.each(['nao', 'duplicado', 'arquivo'])('marcador %s é recusado sem reinterpretar intenção', tipo => {
    const f = formulario();
    if (tipo === 'duplicado') f.append('materiaisNoFormulario', 'sim');
    else if (tipo === 'arquivo') f.set('materiaisNoFormulario', new File(['sim'], 'sim.txt'));
    else f.set('materiaisNoFormulario', tipo);
    expect(materiaisDoFormulario(f)).toMatchObject({ ok: false });
  });
});
