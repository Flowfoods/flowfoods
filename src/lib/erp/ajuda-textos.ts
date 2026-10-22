/**
 * Ajuda contextual (0.6) — SÓ texto. Uma entrada por tela (ou por telas que
 * se explicam do mesmo jeito: novo e editar). Chave = rota relativa à base.
 *
 * Como mexer (regra da casa, toda subfase):
 *  - tela nova ou rota nova: entrada nova aqui, no MESMO diff (o teste reprova rota sem ajuda);
 *  - função da tela mudou: ajuste o texto E suba a `versao` da entrada, depois rode
 *    `npm run ajuda:lock`. A caixa volta, com "MUDOU", para quem já tinha fechado;
 *  - texto curto, carioca, sem jargão: "a conta é refeita na hora de salvar", nunca "o servidor refaz";
 *  - sem "!", sem emoji, sem HTML, sem markdown. Até 320 caracteres por bloco; 1 a 4 frases para todos.
 *
 * `para` = quem tem QUALQUER uma dessas permissões lê o bloco (o operador não lê sobre preço).
 * É conforto: a permissão de verdade é decidida na página.
 */

import type { EntradaDeAjuda } from './ajuda';

export const ENTRADAS: EntradaDeAjuda[] = [
  {
    chave: 'inicio',
    area: 'inicio',
    rotas: [''],
    titulo: 'Áreas da Rede',
    versao: 1,
    aula: [
      { texto: 'Aqui ficam as áreas do restaurante: cadastros e cardápio, compras e fornecedores, estoque e movimentações, rede e equipe.' },
      { texto: 'Cada card abre na primeira tela que você pode usar. As outras telas da área ficam nas abas, no alto.' },
      { texto: 'Só aparece o que o seu acesso libera.' },
    ],
  },
  {
    chave: 'acesso',
    area: 'rede',
    rotas: ['acesso'],
    titulo: 'Seu acesso',
    versao: 1,
    aula: [
      { texto: 'Aqui estão os seus dados, o que você pode fazer no ERP e a entrada pelo rosto no celular.' },
      { texto: 'Trocou de aparelho? Ative o rosto de novo nele. Senha esquecida: fale com a FlowFoods.' },
    ],
    secoes: [
      {
        id: 'dicas',
        titulo: 'As caixas de dica',
        blocos: [
          { texto: 'Cada tela pode abrir uma caixinha explicando como ela funciona. Fechou uma, ela não volta, a não ser que o texto mude.' },
          { texto: 'No quadro Dicas, desta tela, você liga e desliga as caixinhas ou pede para ver de novo as que fechou. O botão ? no alto continua sempre à mão.' },
        ],
      },
    ],
  },
  {
    chave: 'insumos',
    area: 'cadastros',
    rotas: ['insumos'],
    titulo: 'Insumos',
    versao: 3,
    aula: [
      { texto: 'Tudo o que a casa compra e usa: ingrediente, embalagem, material de limpeza e uso e pré-preparo.' },
      { texto: 'Antes da primeira compra vale o custo inicial de referência; depois, o último preço da nota lançada.' },
      { texto: '“Custo não informado” quer dizer que falta o custo e que as fichas que usam o insumo ficam incompletas.' },
      { texto: 'Tipo, categoria e conservação são três coisas diferentes, e dá para filtrar por elas.' },
      { texto: 'Cadastre do jeito que você compra: a caixa de 5 kg, não o grama.', para: ['insumos.editar'] },
    ],
    secoes: [
      {
        id: 'conservacao',
        titulo: 'Conservação a confirmar',
        blocos: [
          { texto: 'Antes, o sistema assumia Seco quando ninguém escolhia a conservação. O que ficou em Seco, em Proteína, Laticínios ou Hortifruti, aparece como “a confirmar”.' },
          { texto: 'Nada foi mudado. Abra o insumo: se for outra conservação, troque em Editar; se for mesmo seco, confirme.', para: ['insumos.editar'] },
        ],
      },
    ],
  },
  {
    chave: 'insumo-novo',
    area: 'cadastros',
    rotas: ['insumos/novo', 'insumos/[id]/editar'],
    titulo: 'Cadastrar insumo',
    versao: 3,
    aula: [
      { texto: 'O nome do insumo se digita uma vez só, e quem veio de uma nota ou ficha volta para lá ao salvar.' },
      { texto: 'Nome, categoria, conservação e unidade base são obrigatórios; o que faltar aparece junto do campo.' },
      { texto: 'Tipo é o papel do item, categoria é a natureza dele para o CMV e conservação é onde ele fica guardado.' },
      { texto: 'O custo inicial de referência vale até a primeira compra lançada e não cria nota nem despesa.' },
    ],
    secoes: [
      {
        id: 'campos',
        titulo: 'Campo a campo',
        blocos: [
          { texto: 'A conservação não vem escolhida: “Selecione a conservação” é só a orientação e não se salva. Coxa de frango é Proteína, congelada ou não.' },
          { texto: 'Prazo de uso após abertura é opcional, em horas ou dias: quanto o produto dura depois de aberto. Não é o vencimento do lote; em branco, fica “não informado”.' },
          { texto: 'Unidade base é como você controla (kg, L ou un); embalagem de compra é quanto vem em cada uma; o custo inicial é o que você paga por ela. Ex.: saco de 5 kg por R$ 25 → R$ 5,00/kg.' },
          { texto: 'Sem custo ainda, marque “Ainda não sei o custo”: o insumo fica com “Custo não informado” e as fichas dele, incompletas, até haver custo ou compra.' },
          { texto: 'A marca de referência é opcional: não trava compra nem cotação e não é o fornecedor.' },
          { texto: 'Veio de uma nota ou ficha? O que você tinha preenchido lá é recuperado na volta. Salvou, a tela confirma com o nome, e um toque repetido não cria outro.' },
        ],
      },
    ],
  },
  {
    chave: 'insumo',
    area: 'cadastros',
    rotas: ['insumos/[id]'],
    titulo: 'Detalhe do insumo',
    versao: 3,
    aula: [
      { texto: 'O custo de hoje e a origem dele (o último preço de compra ou o custo inicial de referência), e quanto tem em cada loja do seu acesso.' },
      { texto: 'Conservação e prazo de uso após abertura ficam lado a lado, sem confundir com o vencimento do lote.' },
      { texto: 'A categoria fica ao lado, com a forma como foi escolhida; em “Outros / a classificar” o insumo espera revisão.' },
      { texto: 'Mais embaixo, o que você pagou em cada nota e qual fornecedor saiu mais barato.', para: ['compras.ver'] },
    ],
  },
  {
    chave: 'insumo-categorias',
    area: 'cadastros',
    rotas: ['insumos/categorias'],
    titulo: 'Categorias de insumo',
    versao: 2,
    aula: [
      { texto: 'A categoria diz o que o insumo é para o CMV, como Proteína, Hortifruti ou Mercearias e secos; não é setor nem onde fica guardado.' },
      { texto: 'A lista vale para a rede inteira: as dez do plano já vêm prontas, e dá para criar, renomear e mudar a ordem.' },
      { texto: 'Categoria com insumos, com meta por categoria ou no estoque guardado de um fechamento não se exclui, desativa-se: os insumos continuam nela e o histórico fica.' },
      { texto: '“Outros / a classificar” é do sistema e fica sempre por último.' },
      { texto: 'Só quem gere as categorias mexe aqui; os demais veem a lista.', para: ['insumos.ver'] },
    ],
  },
  {
    chave: 'insumo-classificar',
    area: 'cadastros',
    rotas: ['insumos/classificar'],
    titulo: 'Classificar insumos',
    versao: 1,
    aula: [
      { texto: 'Insumos cadastrados antes das categorias ficam sem categoria; aqui ganham uma, pelo nome, sem mudar preço, unidade, saldo nem ficha.' },
      { texto: 'A prévia mostra para onde cada um iria, sem gravar nada; na dúvida, vai para “Outros / a classificar”, com o motivo.' },
      { texto: 'Na fila de revisão, marque vários e escolha a categoria: cada mudança fica no histórico, com o antes e o depois.' },
      { texto: 'Aplicar vale uma vez; dá para desfazer um lote, e só volta o que ninguém mexeu depois.', para: ['insumos.categorias'] },
    ],
  },
  {
    chave: 'insumo-embalagem',
    area: 'cadastros',
    rotas: ['insumos/[id]/embalagens/[varianteId]'],
    titulo: 'Outra embalagem',
    versao: 2,
    aula: [
      { texto: 'É outra forma de comprar o mesmo insumo: caixa, fardo, outra marca.' },
      { texto: 'O nome pedido aqui é o da embalagem (ex.: caixa de 5 kg); o nome do insumo continua o mesmo.' },
      { texto: 'A tela do insumo diz qual embalagem sai mais barata.' },
    ],
  },
  {
    chave: 'fichas',
    area: 'cadastros',
    rotas: ['fichas'],
    titulo: 'Fichas e produtos',
    versao: 1,
    aula: [
      { texto: 'Cada receita da casa, com o custo por porção.' },
      { texto: 'Pré-preparo (molho, base) entra dentro de outras fichas e leva o custo junto.' },
      { texto: '“Incompleto” quer dizer que falta preço em algum insumo.' },
      { texto: 'A margem de cada canal aparece ao lado; em cinza quando vale o preço sugerido.', para: ['precos.ver'] },
    ],
  },
  {
    chave: 'ficha-nova',
    area: 'cadastros',
    rotas: ['fichas/nova', 'fichas/[id]/editar'],
    titulo: 'Montar a ficha',
    versao: 2,
    aula: [
      { texto: 'Monte a receita com a quantidade limpa, sem casca e sem osso. O fator de correção cobre a perda da limpeza: cebola 1,18 quer dizer que 354 g sujas dão 300 g limpas.' },
      { texto: 'Pré-preparo diz quanto rende pronto. Diga também onde guarda e quanto dura.' },
    ],
  },
  {
    chave: 'ficha-importar',
    area: 'cadastros',
    rotas: ['fichas/importar'],
    titulo: 'Importar planilha',
    versao: 1,
    aula: [
      { texto: 'Baixe o modelo, preencha uma linha por insumo e envie.' },
      { texto: 'Antes de gravar, você vê o que é novo, o que muda e o que tem erro. Enviar a mesma planilha de novo não duplica nada.' },
    ],
  },
  {
    chave: 'producao',
    area: 'producao',
    rotas: ['producao'],
    titulo: 'Produção',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja para ver os lotes: planejados, em produção e os concluídos de hoje.' },
      { texto: 'Lote atrasado ganha uma faixa vermelha.' },
    ],
  },
  {
    chave: 'producao-lista',
    area: 'producao',
    rotas: ['producao/lista'],
    titulo: 'Lista do dia',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja para ver a lista do dia: o que ela vai produzir e o que isso pede do estoque.' },
      { texto: 'Ao lado de cada loja, quantos pré-preparos a lista de hoje tem e quantos ainda não viraram lote.' },
    ],
  },
  {
    chave: 'producao-lista-loja',
    area: 'producao',
    rotas: ['producao/lista/[lojaId]'],
    titulo: 'Lista do dia da loja',
    versao: 3,
    aula: [
      { texto: 'O que a loja vai produzir no dia, e o que isso pede do estoque: quanto vai usar de cada insumo, quanto tem e quanto falta.' },
      { texto: 'Falta escrito em vermelho quer dizer que o estoque não dá. Abaixo de zero quer dizer que o estoque está errado ou que falta lançar nota.' },
      { texto: 'Monte a lista, salve e confira o que falta. Depois, gere os lotes: cada pré-preparo vira um lote, com a requisição dos insumos.', para: ['producao.planejar'] },
      { texto: 'Quem define a lista é a gerência. Para fazer, pegue o pré-preparo em Tarefas: ele vira lote com o seu nome e a hora.', para: ['producao.registrar'] },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'Como a conta é feita',
        blocos: [
          { texto: 'O vai usar sai da receita de cada ficha, já com o fator de correção, igual ao que a requisição do lote vai pedir.' },
          { texto: 'Se a receita usa outro pré-preparo, como a base do molho, conta primeiro o que tem dele no estoque e o que a lista produz. O que ainda falta entra pela receita dele.' },
          { texto: 'Depois que vira lote, conta só o que ainda falta sair pela requisição. O que já saiu está no estoque, então nada é contado duas vezes.' },
          { texto: 'Loja sem a contagem de abertura não tem saldo: a lista mostra só o que vai usar.' },
        ],
      },
      {
        id: 'compra',
        titulo: 'Para quem compra',
        blocos: [
          { texto: 'A lista não faz pedido. Quem compra vê o que falta e lança a nota em Compras.', para: ['compras.ver', 'compras.lancar'] },
          { texto: 'A compra estimada usa o último preço pago. Insumo sem preço fica de fora, e a tela diz qual. A cozinha vê só as quantidades.', para: ['compras.ver', 'compras.lancar'] },
          { texto: 'O quanto ainda cabe é o mesmo do Orçamento de compra, com a compra estimada somada.', para: ['compras.ver', 'compras.lancar'] },
        ],
      },
    ],
  },
  {
    chave: 'producao-quadro',
    area: 'producao',
    rotas: ['producao/[lojaId]'],
    titulo: 'Produção da loja',
    versao: 2,
    aula: [
      { texto: 'Cada cartão é um lote: o pré-preparo, o código, quanto, para quando e se os insumos já saíram do estoque.' },
      { texto: 'Lote atrasado ganha uma faixa vermelha e os dias de atraso.' },
      { texto: 'Planeje em “Nova produção”. Quando o lote ficar pronto, abra o cartão e conclua.', para: ['producao.registrar'] },
    ],
    secoes: [
      {
        id: 'andamento',
        titulo: 'Como o lote anda',
        blocos: [
          { texto: 'Planejada: o lote existe e a requisição dos insumos já foi para o estoque. Em produção: alguém pegou, e o cartão diz quem. Concluída: o lote entrou no estoque.' },
          { texto: 'Concluídas e canceladas aparecem só no dia. Os lotes antigos ficam no Histórico.' },
        ],
      },
    ],
  },
  {
    chave: 'producao-nova',
    area: 'producao',
    rotas: ['producao/nova', 'producao/[lojaId]/nova'],
    titulo: 'Nova produção',
    versao: 1,
    aula: [
      { texto: 'Escolha o pré-preparo e quanto vai produzir. A lista de insumos sai da receita, já com o fator de correção.' },
      { texto: 'Confira a lista e mude o que precisar. Ao planejar, a requisição dos insumos vai sozinha para o estoque; nada sai até o estoque entregar.' },
    ],
    secoes: [
      {
        id: 'codigo',
        titulo: 'O código do lote',
        blocos: [{ texto: 'O lote ganha um código com a data e o número do dia, como 261017-01. O código não se repete, mesmo se o lote for cancelado, e é ele que vai na etiqueta.' }],
      },
    ],
  },
  {
    chave: 'producao-lote',
    area: 'producao',
    rotas: ['producao/[lojaId]/[ordemId]'],
    titulo: 'Lote',
    versao: 2,
    aula: [
      { texto: 'O que foi planejado, os insumos que saíram pela requisição, quem está fazendo e, depois de concluído, quanto saiu de verdade.' },
      { texto: 'O lote que outra pessoa pegou só ela ou a gerência conclui, solta ou cancela.', para: ['producao.registrar'] },
      { texto: 'Para concluir, os insumos precisam estar entregues; se sobrou insumo, devolva pela requisição antes.', para: ['producao.registrar'] },
      { texto: 'Cancelar só vale se nada saiu do estoque, ou se tudo voltou. Estornar um lote concluído é de quem ajusta o saldo.', para: ['producao.registrar'] },
      { texto: 'O custo do lote é o que saiu do estoque, dividido pelo que saiu de verdade, ao lado do que a ficha prevê.', para: ['insumos.ver'] },
    ],
    secoes: [
      {
        id: 'custo',
        titulo: 'A conta do custo',
        blocos: [
          { texto: 'São 117,81 reais de insumos para 4,6 kg de molho: 25,61 reais por quilo. Se algum insumo saiu sem preço, o lote fica com custo incompleto e a tela diz qual, nunca com zero.', para: ['insumos.ver'] },
          { texto: 'O custo de referência do pré-preparo continua o da ficha. O lote mostra o que custou de verdade e não mexe nele.', para: ['insumos.ver'] },
        ],
      },
    ],
  },
  {
    chave: 'producao-concluir',
    area: 'producao',
    rotas: ['producao/[lojaId]/[ordemId]/concluir', 'producao/tarefas/[lojaId]/[ordemId]/concluir'],
    titulo: 'Concluir o lote',
    versao: 2,
    aula: [
      { texto: 'Diga quanto saiu de verdade; zero se o lote se perdeu, e então nada entra no estoque.' },
      { texto: 'Passou de 10% para mais ou para menos, ou perdeu tudo: escreva o motivo.' },
      { texto: 'Escolha onde o lote vai ficar: a validade nasce daí e não muda se a ficha mudar depois.' },
      { texto: 'O custo por quilo aparece ao vivo, enquanto você digita.', para: ['insumos.ver'] },
      { texto: 'Quem pegou o lote fica como quem fez, mesmo se a gerência concluir por ele.', para: ['producao.planejar'] },
    ],
  },
  {
    chave: 'producao-tarefas',
    area: 'producao',
    rotas: ['producao/tarefas'],
    titulo: 'Tarefas da cozinha',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja para ver as tarefas de hoje da cozinha.' },
      { texto: 'Ao lado de cada loja, quantas tarefas estão para pegar e quantas já estão em produção.' },
    ],
  },
  {
    chave: 'producao-tarefas-loja',
    area: 'producao',
    rotas: ['producao/tarefas/[lojaId]'],
    titulo: 'Tarefas da cozinha da loja',
    versao: 1,
    aula: [
      { texto: 'As tarefas de hoje da loja: pegue a que você vai fazer e o lote fica com você, com o seu nome e a hora.' },
      { texto: 'Com os insumos entregues e o lote pronto, toque em Concluir e diga quanto saiu de verdade.' },
      { texto: 'Se não for terminar, solte o lote com o motivo: ele volta para alguém pegar.' },
      { texto: 'No tablet da cozinha, cada um entra com o próprio acesso: confira o seu nome no alto antes de pegar.' },
      { texto: 'A gerência solta o lote de qualquer pessoa ou passa para outra, sempre com o motivo.', para: ['producao.planejar'] },
    ],
    secoes: [
      {
        id: 'pegar',
        titulo: 'Como funciona o pegar',
        blocos: [
          { texto: 'Pegar é começar: o lote passa para Em produção. Duas pessoas não pegam o mesmo lote: quem chega depois vê quem pegou.' },
          { texto: 'O pré-preparo da lista que ainda não virou lote vira lote na hora em que alguém pega, com a requisição dos insumos. Nada sai do estoque até o estoque entregar.' },
          { texto: 'Pegar e soltar não mexem no estoque. Quem conclui é quem pegou, ou a gerência.' },
        ],
      },
    ],
  },
  {
    chave: 'producao-historico',
    area: 'producao',
    rotas: ['producao/historico'],
    titulo: 'Histórico da produção',
    versao: 1,
    aula: [{ texto: 'Escolha a loja para ver o que a cozinha produziu, quanto, quem fez e quando.' }],
  },
  {
    chave: 'producao-historico-loja',
    area: 'producao',
    rotas: ['producao/historico/[lojaId]'],
    titulo: 'Histórico da produção da loja',
    versao: 1,
    aula: [
      { texto: 'Os lotes encerrados no período: o que foi feito, quanto saiu contra o planejado, quem fez e quanto tempo levou.' },
      { texto: 'Filtre por pessoa, pré-preparo e dia. Quem fez é quem pegou o lote; sem pegar, quem concluiu.' },
      { texto: 'O custo do lote é o que saiu do estoque pelos insumos. Insumo sem preço deixa o custo incompleto, nunca zero.', para: ['insumos.ver'] },
    ],
    secoes: [
      {
        id: 'tempo',
        titulo: 'O tempo de cada lote',
        blocos: [{ texto: 'Conta de quando a pessoa pegou o lote, ou de quando os insumos saíram do estoque se foi depois, até a conclusão. Lote concluído sem pegar pela tela da cozinha fica sem tempo.' }],
      },
    ],
  },
  {
    chave: 'producao-indicadores',
    area: 'producao',
    rotas: ['producao/indicadores'],
    titulo: 'Indicadores da produção',
    versao: 1,
    aula: [{ texto: 'Escolha a loja para ver os indicadores da produção de cada pessoa.' }],
  },
  {
    chave: 'producao-indicadores-loja',
    area: 'producao',
    rotas: ['producao/indicadores/[lojaId]'],
    titulo: 'Indicadores da produção da loja',
    versao: 2,
    aula: [
      { texto: 'De cada pessoa, no período: lotes concluídos, quanto produziu de cada pré-preparo, rendimento contra o planejado, tempo, perdidos e cancelados.' },
      { texto: 'É um retrato para conversar com a equipe, não uma nota. Com menos de 5 lotes, a amostra é pequena e ainda não diz muito.' },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'Como a conta é feita',
        blocos: [
          { texto: 'Rendimento médio: cada lote pesa igual, e os perdidos ficam à parte. Por pré-preparo: o que saiu somado, dividido pelo planejado somado.' },
          { texto: 'Fora de 10%: lote que saiu mais de 10% acima ou abaixo do planejado. Tempo: de pegar, ou da entrega dos insumos, até concluir.' },
          { texto: 'Cancelou: os que a própria pessoa cancelou. Os que a gerência cancelou enquanto estavam com ela ficam à parte e não contam para ela.' },
          { texto: 'Lote concluído pela FlowFoods, sem pessoa da equipe, fica fora das pessoas.' },
        ],
      },
    ],
  },
  {
    chave: 'ficha',
    area: 'cadastros',
    rotas: ['fichas/[id]'],
    titulo: 'Detalhe da ficha',
    versao: 3,
    aula: [
      { texto: 'Foto, receita e custo por porção, com a conta à mostra.' },
      { texto: 'Pré-preparo: “Produzir” planeja um lote dele, com os insumos tirados da receita.', para: ['producao.registrar'] },
      { texto: 'Em “Preço e margem por canal” estão o custo de cada canal (loja, delivery, iFood), o preço sugerido pela margem-alvo e se o prato está no alvo.', para: ['precos.ver'] },
      { texto: 'Preço em branco vale o sugerido e acompanha o custo. Só quem edita preço muda o preço de venda.', para: ['precos.ver'] },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'Como a conta é feita',
        blocos: [
          { texto: 'Embalagem entra inteira, pelo custo de referência (o último preço pago). A taxa do iFood é comissão mais pagamento online, sobre o preço.', para: ['precos.ver'] },
          { texto: 'A margem bruta é o preço menos os insumos e as embalagens. A margem líquida é a bruta menos a taxa do canal: o que sobra para pagar a casa e o lucro. Despesa fixa não entra nesta conta.', para: ['precos.ver'] },
          { texto: 'O preço sugerido é o custo dividido pelo que sobra depois da taxa e da margem-alvo, arredondado para cima no centavo: é o menor preço que atinge o alvo. Campo vazio vale o sugerido e acompanha o custo.', para: ['precos.ver'] },
        ],
      },
    ],
  },
  {
    chave: 'ficha-embalagens',
    area: 'cadastros',
    rotas: ['fichas/[id]/canais'],
    titulo: 'Embalagens por canal',
    versao: 1,
    aula: [
      { texto: 'O que vai no saco em cada canal: caixa, sacola, guardanapo.' },
      { texto: 'Delivery e iFood têm listas próprias. A loja não leva embalagem.' },
    ],
  },
  {
    chave: 'precificacao',
    area: 'cadastros',
    rotas: ['fichas/canais'],
    titulo: 'Precificação',
    versao: 1,
    aula: [
      { texto: 'Quanto o iFood leva (comissão e pagamento online) e a margem que você quer em cada canal.' },
      { texto: 'Sem a taxa do iFood, o custo dele fica incompleto.' },
      { texto: 'Confira os números no seu contrato com o iFood.', para: ['precos.editar'] },
    ],
  },
  {
    chave: 'compras',
    area: 'compras',
    rotas: ['compras'],
    titulo: 'Compras',
    versao: 1,
    aula: [
      { texto: 'As notas de compra de cada loja.' },
      { texto: 'Nota lançada muda o custo do insumo e entra no estoque, se a loja já abriu o estoque.' },
      { texto: 'A mesma nota não entra duas vezes.', para: ['compras.lancar'] },
    ],
  },
  {
    chave: 'compras-orcamento',
    area: 'compras',
    rotas: ['compras/orcamento'],
    titulo: 'Orçamento de compra',
    versao: 4,
    // A loja que passou precisa ficar à vista: a aula abre numa linha (com a pergunta da 1ª vez, abre sozinha).
    recolhida: true,
    aula: [
      { texto: 'Quanto ainda dá para comprar neste período sem furar a meta do CMV, loja por loja.' },
      { texto: 'É um aviso, não um bloqueio: a nota que passa do orçamento é lançada igual, e a prévia da nota mostra quanto ela passa.' },
      { texto: 'Sem número, o motivo vem escrito: falta a meta do CMV ou faturamento lançado nas últimas 4 semanas.' },
      { texto: 'Cada nota é de uma loja e a sobra de uma não cobre a que passou; quem não vê o DRE vê o limite seguro, um valor aproximado e sempre para menos.' },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'Como a conta é feita',
        blocos: [
          { texto: 'A meta é a da loja: a própria, quando ela definiu a dela nas metas por categoria; senão, a da rede. Na rede com metas diferentes, o teto é a soma dos tetos das lojas.', para: ['dre.ver'] },
          { texto: 'O teto é a meta do CMV vezes a receita prevista do período. O que cabe é o teto menos o que a loja já comprou no período, pela data da nota, com o frete.', para: ['dre.ver'] },
          { texto: 'A receita prevista é o que a loja já vendeu nos dias com faturamento completo, mais cada dia que falta pela média do mesmo dia da semana nas últimas 4 semanas. Sábado entra como sábado, segunda como segunda.', para: ['dre.ver'] },
          { texto: 'Dia sem todos os canais lançados não conta como zero: entra pela média. Dia antes do primeiro lançamento da loja fica fora. Dia da semana sem nenhum dia completo nas 4 semanas conta só o que já foi lançado. Com menos de 14 dias completos, a loja fica sem número.', para: ['dre.ver'] },
          { texto: 'É a única tela que projeta: o DRE vai até ontem, sem projeção.', para: ['dre.ver'] },
          { texto: 'A rede só tem número quando cada loja ativa tem. Uma loja sem número deixa a rede sem número, com o nome dela, para o buraco de uma não ficar escondido atrás da outra.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'ritmo',
        titulo: 'O ritmo das compras',
        blocos: [
          { texto: 'O ritmo é o CMV pelas compras até ontem contra a meta, com o farol do DRE: as mesmas 5 faixas da linha do CMV. Comprar muito no começo do mês acende o farol mesmo cabendo no orçamento: o farol fala do ritmo, o orçamento fala do período.', para: ['dre.ver'] },
          { texto: 'Sem cor quando falta faturamento em algum dia do período, ou quando uma loja que vendeu ainda não tem nota.', para: ['dre.ver'] },
        ],
      },
    ],
  },
  {
    chave: 'compra-nova',
    area: 'compras',
    rotas: ['compras/nova', 'compras/[id]/editar'],
    titulo: 'Lançar nota',
    versao: 4,
    aula: [
      { texto: 'Digite o valor total de cada linha, como está na nota.' },
      { texto: 'O frete é dividido entre os itens, e a soma tem que bater com o total da nota.' },
      { texto: '“Conferir o impacto” mostra o que muda de custo e no orçamento de compra da loja antes de lançar: passar do orçamento é aviso, a nota entra igual.' },
      { texto: 'A data da nota decide o período dela: se o DRE já fechou esse período, a nota não entra nem se edita. É também essa data que põe a nota no CMV de compra do período.', para: ['compras.lancar'] },
      { texto: 'Só lance como nota o que é comida e embalagem para vender. Limpeza e descartável da operação vão como despesa, e o pagamento ao fornecedor de uma nota já lançada não é despesa: a nota já é o custo.', para: ['compras.lancar'] },
    ],
  },
  {
    chave: 'compra',
    area: 'compras',
    rotas: ['compras/[id]'],
    titulo: 'Detalhe da nota',
    versao: 3,
    aula: [
      { texto: 'A nota, o frete de cada item e o que ela fez no estoque.' },
      { texto: 'Nota do período em curso mostra como ficou o orçamento de compra da loja: quanto ainda cabe, ou quanto passou. É só aviso.' },
      { texto: 'Errou? Edite ou cancele com o motivo: o custo e o estoque voltam.', para: ['compras.lancar'] },
      { texto: 'Nota com data em período que o DRE já fechou não se edita nem se cancela.', para: ['compras.lancar'] },
    ],
  },
  {
    chave: 'fornecedores',
    area: 'compras',
    rotas: ['compras/fornecedores'],
    titulo: 'Fornecedores',
    versao: 2,
    aula: [
      { texto: 'Quem vende para a casa e o último preço de cada insumo.' },
      { texto: 'Selo A completar é cadastro antigo sem e-mail ou WhatsApp: abra e complete. As notas dele continuam valendo.' },
      { texto: 'Os contatos são só para consulta: o sistema não manda mensagem a eles sozinho.' },
    ],
  },
  {
    chave: 'fornecedor-novo',
    area: 'compras',
    rotas: ['compras/fornecedores/novo', 'compras/fornecedores/[id]/editar'],
    titulo: 'Cadastrar fornecedor',
    versao: 2,
    aula: [
      { texto: 'Obrigatório: nome fantasia, razão social, CNPJ ou CPF, e-mail e WhatsApp com DDD. O CNPJ não repete; filial tem outro CNPJ e é outro cadastro.' },
      { texto: 'Feira ou atacarejo sem nota: marque Compras sem nota fiscal e informe só o nome e o WhatsApp.' },
    ],
  },
  {
    chave: 'fornecedor',
    area: 'compras',
    rotas: ['compras/fornecedores/[id]'],
    titulo: 'Detalhe do fornecedor',
    versao: 2,
    aula: [
      { texto: 'O cadastro, o que esse fornecedor já vendeu, com o último preço de cada insumo, e as últimas notas das lojas que você vê.' },
      { texto: 'Cadastro a completar mostra o que falta. Outro cadastro com a mesma raiz de CNPJ aparece como outro estabelecimento da mesma empresa: nada é unido.' },
    ],
  },
  {
    chave: 'estoque',
    area: 'estoque',
    rotas: ['estoque'],
    titulo: 'Estoque: visão geral',
    versao: 1,
    aula: [
      { texto: 'Cada loja e a situação do estoque dela: não aberto, em contagem ou aberto.' },
      { texto: 'Depois de aberto, nota lançada e requisição mexem no saldo sozinhas.' },
    ],
    secoes: [
      {
        id: 'abertura',
        titulo: 'Como abre o estoque de uma loja',
        blocos: [
          { texto: '1. Contar. Quem conta abre a lista no celular e digita o que tem: caixas fechadas e o solto. Salva sozinho, e dá para contar em várias vezes e com várias pessoas.' },
          { texto: '2. Conferir. O gerente vê o que falta, o que deu zero e o valor do estoque pelo custo de referência.' },
          { texto: '3. Concluir. A contagem vira o saldo inicial. Daí em diante, nota lançada na loja entra no estoque na hora.' },
        ],
      },
    ],
  },
  {
    chave: 'estoque-contagens',
    area: 'estoque',
    rotas: ['estoque/contagens'],
    titulo: 'Contagens',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja para ver a contagem dela: cobertura do período, contagens abertas e fechamento.' },
      { texto: 'Com uma loja só no seu acesso, você já cai no período dela.' },
    ],
  },
  {
    chave: 'estoque-loja',
    area: 'estoque',
    rotas: ['estoque/[lojaId]'],
    titulo: 'Estoque da loja',
    versao: 1,
    aula: [
      { texto: 'O saldo e o valor de cada insumo na loja, e o livro de tudo o que entrou e saiu.' },
      { texto: 'Planeje a contagem do dia a dia e acompanhe se o período chega ao piso. “Recontar” corrige um número que ficou errado.', para: ['estoque.ajustar'] },
    ],
  },
  {
    chave: 'estoque-abertura',
    recolhida: true,
    area: 'estoque',
    rotas: ['estoque/[lojaId]/abertura'],
    titulo: 'Contagem de abertura',
    versao: 1,
    aula: [
      { texto: 'Conte o que tem na loja agora. Caixa fechada vai em embalagens; o aberto, no solto.' },
      { texto: 'Deixe vazio o que ainda não contou; o que não tem, marque “Não tem”.' },
      { texto: 'A tela salva sozinha, até sem sinal.' },
    ],
  },
  {
    chave: 'estoque-abertura-conferir',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/abertura/conferir'],
    titulo: 'Conferir a abertura',
    versao: 1,
    aula: [
      { texto: 'O que falta contar, o que deu zero e o valor do estoque.' },
      { texto: 'Concluir transforma a contagem no saldo inicial e não se desfaz. Correção depois é uma contagem nova.' },
    ],
  },
  {
    chave: 'contagem-nova',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/nova'],
    titulo: 'Planejar a contagem',
    versao: 1,
    aula: [
      { texto: 'Escolha o lugar (seco, refrigerado...) e quais insumos contar: os vencidos, todos do lugar ou só os mais caros.' },
      { texto: 'Um pedaço por vez. Um insumo só entra em uma contagem aberta.' },
    ],
  },
  {
    chave: 'contagem',
    recolhida: true,
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/[contagemId]'],
    titulo: 'Contagem',
    versao: 1,
    aula: [
      { texto: 'Conte o que tem agora. O número é comparado com o que o livro dizia na hora em que você contou; nota que chegar depois continua no estoque.' },
      { texto: 'Se tudo bater, a contagem fecha sozinha.' },
      { texto: 'No fechamento do período, conte o que falta: os marcados “para o piso” são os mais caros e levam a cobertura ao mínimo.' },
    ],
  },
  {
    chave: 'contagem-conferir',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/[contagemId]/conferir'],
    titulo: 'Conferir a contagem',
    versao: 1,
    aula: [
      { texto: 'O contado contra o que o livro dizia, em quilo e em reais. Perda aparece em vermelho e sobra em verde.' },
      { texto: 'Aplicar acerta o saldo. O fechamento do período só aplica com a cobertura no piso.' },
    ],
  },
  {
    chave: 'periodo',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/periodo'],
    titulo: 'Período e contagens',
    versao: 5,
    aula: [
      { texto: 'Quanto do estoque foi contado no período, por valor e por itens. O período é o mesmo do DRE: mensal, quinzenal ou semanal, definido em Períodos, na área Faturamento e DRE.' },
      { texto: 'O fechamento só vale com a cobertura acima do piso da loja.' },
      { texto: 'Depois que o DRE fecha o período, o fechamento do estoque dele não começa nem se aplica mais, mas descartar um em andamento continua valendo.' },
      { texto: 'As regras da contagem (piso, frequência, tolerância) ficam aqui; só quem cadastra lojas muda.', para: ['lojas.gerir'] },
    ],
    secoes: [
      {
        id: 'cmv-real',
        titulo: 'O fechamento e o CMV real',
        blocos: [
          { texto: 'O valor do fechamento é o estoque final do período e vira o estoque inicial do seguinte: é a base do CMV real no DRE.' },
          { texto: 'Ao aplicar, o sistema também guarda o estoque insumo por insumo, com a categoria de cada um naquele dia. É o que vai abrir o CMV real por categoria; fechamento de antes não tem e não é reconstruído.' },
          { texto: 'Contar depois do fim do período não estraga a conta: o que entrou ou saiu entre o fim e a contagem é separado pela data. Insumo sem preço entra com zero, e o DRE avisa quantos são.' },
        ],
      },
    ],
  },
  {
    chave: 'requisicoes',
    area: 'estoque',
    rotas: ['estoque/requisicoes', 'estoque/[lojaId]/requisicoes'],
    titulo: 'Requisições',
    versao: 2,
    aula: [
      { texto: 'O setor pede, o estoque entrega e o saldo baixa na entrega.' },
      { texto: 'Pedido atrasado ganha uma faixa vermelha.' },
    ],
  },
  {
    chave: 'requisicao-nova',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/nova'],
    titulo: 'Nova requisição',
    versao: 1,
    aula: [
      { texto: 'Diga o setor, para quando e o que precisa.' },
      { texto: 'Vai produzir uma receita? “Puxar de uma ficha técnica” já traz os insumos.' },
    ],
  },
  {
    chave: 'requisicao',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/[requisicaoId]'],
    titulo: 'Detalhe da requisição',
    versao: 2,
    aula: [
      { texto: 'O pedido, o que saiu, o que voltou e o que falta.' },
      { texto: 'Sobrou? “Receber de volta” devolve ao estoque.', para: ['requisicao.atender'] },
      { texto: 'Requisição de produção diz de qual lote é. Ela só se cancela pelo lote, e quando o lote é concluído o custo fecha: não há mais entrega nem devolução.' },
    ],
  },
  {
    chave: 'requisicao-atender',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/[requisicaoId]/atender'],
    titulo: 'Entregar a requisição',
    versao: 1,
    aula: [
      { texto: 'Entregue o que está saindo; pode ser em partes.' },
      { texto: 'Se o livro diz que não tem mas o produto está aí, confirme: o saldo negativo vira alerta nas divergências.' },
    ],
  },
  {
    chave: 'divergencias',
    area: 'estoque',
    rotas: ['estoque/divergencias', 'estoque/[lojaId]/divergencias'],
    titulo: 'Divergências',
    versao: 1,
    aula: [
      { texto: 'O que a contagem acusa sem requisição, em reais.' },
      { texto: '“Pequeno e repetido” é a diferença que passa despercebida. Por setor mostra onde olhar, não quem culpar.' },
    ],
  },
  {
    chave: 'faturamento',
    area: 'dre',
    rotas: ['faturamento'],
    titulo: 'Faturamento',
    versao: 1,
    aula: [
      { texto: 'Quanto cada loja vendeu em cada canal, dia a dia: faturamento, pedidos e clientes atendidos.' },
      { texto: 'O ticket médio é o faturamento dividido pelos pedidos, refeito na hora. Canal que a loja vende e ficou sem lançamento aparece como falta.' },
      { texto: 'Conta a venda dos produtos dos pedidos concluídos, sem a taxa de entrega e já sem o desconto que a casa pagou.' },
      { texto: 'Lance o dia em Lançar o dia, ou várias datas de uma vez em Importar planilha. Dia em que a loja não vendeu leva 0, não fica em branco.', para: ['faturamento.lancar'] },
    ],
    secoes: [
      {
        id: 'o-numero',
        titulo: 'O que entra no número',
        blocos: [
          { texto: 'Entra a venda dos produtos dos pedidos concluídos no dia, depois de tirar o desconto ou cupom que a casa pagou.' },
          { texto: 'Não entra taxa de entrega cobrada do cliente, gorjeta, 10 % de serviço nem pedido cancelado.' },
          { texto: 'No iFood, use o total dos itens menos o incentivo que a loja bancou. A comissão do iFood entra depois, no resultado.' },
          { texto: 'Clientes são atendimentos do dia, não pessoas diferentes. No delivery e no iFood, em branco vale o número de pedidos.' },
        ],
      },
      {
        id: 'falta',
        titulo: 'Falta não é zero',
        blocos: [
          { texto: 'Falta é canal que a loja vende, sem lançamento, desde que ela começou a lançar até ontem. Hoje ainda está em aberto.' },
          { texto: 'Dia em que a loja não vendeu conta como lançado: marque Não vendeu e o canal fecha com zero.' },
          { texto: 'Unidade que só faz delivery: tire a Loja dos canais dela em Lojas e marcas, e a falta de salão para de aparecer.', para: ['lojas.gerir'] },
        ],
      },
    ],
  },
  {
    chave: 'faturamento-lancar',
    area: 'dre',
    rotas: ['faturamento/lancar'],
    titulo: 'Lançar o dia',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja e a data, que começa em hoje. Com uma loja só no seu acesso, você já cai no dia dela.' },
      { texto: 'Só dá para lançar até hoje e até três anos para trás.' },
    ],
  },
  {
    chave: 'faturamento-dia',
    area: 'dre',
    rotas: ['faturamento/[lojaId]/[data]'],
    titulo: 'Faturamento do dia',
    versao: 4,
    // Tela de lançar no celular: os campos ficam à vista, a aula abre numa linha (como nas telas de contar).
    recolhida: true,
    aula: [
      { texto: 'Um bloco por canal da loja, com faturamento, pedidos e clientes; o que ficar em branco continua sem lançamento.' },
      { texto: 'Canal que não vendeu leva Não vendeu e grava zero.' },
      { texto: 'Clientes em branco vale o número de pedidos. O ticket médio sai da conta, não é digitado.' },
      { texto: 'Errou? Salve de novo com o número certo: o antes e o depois ficam guardados. Lançamento do dia ou da loja errada sai com Remover, e o motivo é obrigatório.', para: ['faturamento.lancar'] },
    ],
    secoes: [
      {
        id: 'periodo-fechado',
        titulo: 'Dia de período fechado',
        blocos: [
          { texto: 'Quando o período do resultado é fechado, os dias dele não aceitam mais lançar, corrigir nem remover. Onde o período começa e termina fica em Períodos, na área Faturamento e DRE. Para mexer num dia fechado, peça à FlowFoods para reabrir o período: a tela já diz isso.' },
        ],
      },
    ],
  },
  {
    chave: 'faturamento-importar',
    area: 'dre',
    rotas: ['faturamento/importar'],
    titulo: 'Importar planilha de faturamento',
    versao: 1,
    aula: [
      { texto: 'Baixe o modelo, preencha uma linha por loja, canal e dia e envie o arquivo. Antes de gravar você vê a prévia, linha a linha.' },
      { texto: 'Mandar a mesma planilha de novo não duplica nada: o dia é o mesmo, e só é corrigido se o número mudou.' },
    ],
    secoes: [
      {
        id: 'colunas',
        titulo: 'As colunas do modelo',
        blocos: [
          { texto: 'data (dd/mm/aaaa), loja (o nome do cadastro), canal (loja, delivery ou ifood), faturamento (4.350,00), pedidos e clientes.' },
          { texto: 'Dia sem venda: faturamento 0 e pedidos 0. Clientes pode ficar em branco.' },
          { texto: 'Use ponto e vírgula entre as colunas. Linha com erro fica de fora e diz o motivo; as outras entram.' },
          { texto: 'Célula que começa com = + - ou @ é recusada: cole só o valor, sem fórmula.' },
        ],
      },
    ],
  },
  {
    chave: 'lojas',
    area: 'rede',
    rotas: ['lojas'],
    titulo: 'Lojas e marcas',
    versao: 3,
    aula: [
      { texto: 'As lojas e as marcas do grupo. Estoque, compras, contagem e faturamento são sempre de uma loja.' },
      { texto: 'Cadastrar loja ou marca é com quem tem a rede inteira.', para: ['lojas.gerir'] },
      { texto: 'O CNPJ da loja é quem recebe as notas fiscais de compra. Informe em CNPJ da loja, na linha dela; duas lojas da mesma empresa podem ter o mesmo.', para: ['lojas.gerir'] },
      { texto: 'Cada loja mostra em quais canais vende. Para mudar, abra Canais de venda na linha dela.', para: ['lojas.gerir'] },
    ],
  },
  {
    chave: 'equipe',
    area: 'rede',
    rotas: ['equipe'],
    titulo: 'Equipe',
    versao: 1,
    aula: [
      { texto: 'Quem entra, com que perfil e em quais lojas.' },
      { texto: 'O setor só organiza, não dá acesso. O link de primeiro acesso aparece uma vez: copie ou mande no WhatsApp.' },
    ],
  },
  {
    chave: 'historico',
    area: 'rede',
    rotas: ['historico'],
    titulo: 'Histórico',
    versao: 1,
    aula: [
      { texto: 'Toda mudança, com quem fez, quando e o antes e o depois.' },
      { texto: 'Nada aqui se apaga.' },
    ],
  },
  {
    chave: 'cadastro-do-parceiro',
    area: 'rede',
    rotas: ['cadastro'],
    titulo: 'Cadastro do parceiro',
    versao: 1,
    soNivel1: true,
    aula: [
      { texto: 'Nome e situação do parceiro.' },
      { texto: 'Suspender pede o motivo. Parceiro suspenso entra no ERP e só consulta.' },
    ],
  },
  {
    chave: 'dre',
    area: 'dre',
    rotas: ['dre'],
    titulo: 'DRE',
    versao: 8,
    // A tela da reunião: a tabela fica à vista e a aula abre numa linha.
    recolhida: true,
    aula: [
      { texto: 'O resultado da casa no período: o que entrou, o que saiu e o que sobrou, com o peso de cada linha na receita bruta, até ontem no período em curso.' },
      { texto: 'Com meta definida, a linha mostra o desvio e o farol, uma de 5 faixas de bem melhor a muito pior que a meta, igual na rede e em cada loja.', para: ['dre.ver'] },
      { texto: 'Período fechado mostra a fotografia do fechamento, que nunca muda.' },
      { texto: 'A loja que definiu a própria meta do CMV a vê na linha do CMV dela; a rede segue a meta da rede.', para: ['dre.ver'] },
      { texto: 'O CMV é o custo da comida: no período em curso é o que a casa comprou até ontem, e vira o real, o que ela consumiu, quando o período termina e a contagem de fechamento do estoque é aplicada.' },
    ],
    secoes: [
      {
        id: 'rede-e-loja',
        titulo: 'Rede e loja',
        blocos: [
          { texto: 'A rede soma as lojas e as despesas da rede; a loja mostra só o que é dela, antes das despesas da rede.' },
          { texto: 'No período em curso o número vai até ontem, sem projeção, e a despesa entra dia a dia.' },
        ],
      },
      {
        id: 'meta',
        titulo: 'Como ler a meta',
        blocos: [
          { texto: 'O desvio é o realizado menos a meta, em pontos percentuais.' },
          { texto: 'O lado bom segue a linha: custo e despesa menores são melhores, receita, receita líquida e margem maiores são melhores.' },
          { texto: 'Sem faturamento, sem lançamento na linha ou sem valor (como o CMV de uma loja sem nota e sem estoque), a linha não compara e mostra traço, nunca zero. A meta do CMV compara com o que vale: o real ou o das compras.' },
          { texto: 'Na visão de uma loja, o resultado operacional e o resultado do período não mostram meta: a loja não carrega as despesas da rede.' },
          { texto: 'Quem define as metas as escreve em Plano e metas.', para: ['metas.editar'] },
        ],
      },
      {
        id: 'farol',
        titulo: 'O farol: 5 faixas',
        blocos: [
          { texto: 'O farol põe o desvio de cada linha com meta numa de 5 faixas: azul (bem melhor que a meta), verde (na meta), amarelo (um pouco pior), laranja (pior que a meta) e vermelho (muito pior). A régua de 5 casas mostra a faixa pela posição, e a palavra e o desvio vêm junto: a cor nunca fala sozinha.', para: ['dre.ver'] },
          { texto: 'Em custo, margem e resultado a conta é em pontos da receita bruta contra a meta: azul com 3 pontos ou mais melhor, verde até 0,5 ponto pior, amarelo até 1,5, laranja até 3 e vermelho além. Na receita é o crescimento: azul com 5 pontos acima da meta, verde até 1 abaixo, amarelo até 3, laranja até 6 e vermelho além.', para: ['dre.ver'] },
          { texto: 'As faixas são as mesmas para todas as casas e não se configuram: uma régua só, para comparar uma casa com a outra e com ela mesma ao longo do tempo. Azul numa despesa ou no CMV pede um olhar, porque pode ser lançamento esquecido: vem com confira se está tudo lançado.', para: ['dre.ver'] },
          { texto: 'A linha fica sem cor, com o desvio em texto e o motivo escrito, quando o dado não fecha: falta faturamento, despesa que repete ainda sem lançar, resultado sem o CMV de alguma loja, ano passado incompleto ou sem lançamento. Sem número é hipótese. O CMV pelas compras, parcial ou misto, tem cor, com o selo da fonte.', para: ['dre.ver'] },
          { texto: 'O farol por canal é só o da receita: a meta de crescimento do canal contra o mesmo período do ano passado. CMV e despesa são da loja, não do canal, e não são divididos entre eles.', para: ['dre.ver'] },
          { texto: 'O painel Faróis do período, no topo, conta as linhas em cada faixa e leva às laranja e vermelhas. Período fechado antes do farol mostra o farol de custo das linhas gravadas e diz que a receita não foi apurada neste fechamento.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'ano-passado',
        titulo: 'Receita contra o ano passado',
        blocos: [
          { texto: 'Compara a receita com as mesmas datas um ano antes, no mesmo recorte (29 de fevereiro compara com 28). Só a receita tem comparação.' },
          { texto: 'A variação só aparece quando o ano passado tem lançamento em todos os dias e este período não tem lançamento faltando. Senão ficam os dois números e o motivo.' },
          { texto: 'Sem lançamento no ano passado a tela diz sem lançamento, nunca R$ 0,00.' },
        ],
      },
      {
        id: 'cmv',
        titulo: 'Os dois CMVs: compra e real',
        blocos: [
          { texto: 'CMV de compra é a soma das notas lançadas pela data da nota. Vale no dia a dia e mede o que a casa gastou comprando, não o que consumiu.' },
          { texto: 'CMV real é o estoque inicial mais as compras menos o estoque final. Só existe com o período terminado e o fechamento do estoque aplicado nas duas pontas: o do período e o do anterior (ou a abertura, no primeiro).' },
          { texto: 'Em cada loja entra o real, quando existe; senão a compra, com o motivo escrito ao lado. A rede soma o que vale em cada loja, e fica misto quando as fontes se misturam. Loja sem nota e sem estoque fica sem CMV, nunca com zero, e os resultados avisam que saem sem contar o CMV.' },
          { texto: 'O CMV que vale é descontado da receita líquida na margem de contribuição. No painel compra × real a diferença é o real menos a compra: estoque que sobe é dinheiro parado na prateleira; estoque que desce pede olho na próxima compra.' },
          { texto: 'Com preço subindo, o estoque final vale mais e o real sai menor do que o consumo ao preço antigo. Insumo sem preço entra com zero no estoque, e a tela avisa quantos são.' },
          { texto: 'Limpeza e descartável da operação não são nota de compra: lance como despesa, ou entram no CMV. O pagamento ao fornecedor de uma nota já lançada também não é despesa. Lojas que dividem estoque sem transferência distorcem o real de cada uma; o da rede continua certo.' },
        ],
      },
      {
        id: 'cmv-categorias',
        titulo: 'O CMV por categoria',
        blocos: [
          { texto: 'O CMV do DRE também abre em categorias, em CMV por categoria. É o mesmo CMV: a soma das categorias é a linha do DRE, ao centavo.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'competencia',
        titulo: 'Competência, não caixa',
        blocos: [
          { texto: 'A despesa conta no mês a que pertence, não no dia em que foi paga. A luz de outubro é de outubro, mesmo paga em novembro.' },
          { texto: 'Por isso o aluguel de 31 dias, no dia 16, entra com 15 trinta e um avos: o que já passou até ontem.' },
        ],
      },
      {
        id: 'taxa-ifood',
        titulo: 'A taxa do iFood é estimada',
        blocos: [
          { texto: 'Vale o faturamento do iFood vezes a comissão e o pagamento online configurados hoje. É uma estimativa, não o extrato do iFood. No período fechado vale a taxa de quando ele fechou.' },
          { texto: 'Sem a taxa configurada, a linha diz que falta configurar e a receita líquida sai avisando.', para: ['precos.ver'] },
        ],
      },
      {
        id: 'incompleto',
        titulo: 'Incompleto e falta lançar',
        blocos: [
          { texto: 'Dia de canal sem lançamento de faturamento deixa a receita incompleta. O aviso conta quantos faltam, do mesmo jeito que o calendário do mês.' },
          { texto: 'Despesa que repete todo mês e ainda não foi lançada neste mês aparece em Falta lançar. Nunca entra valor inventado. A cobrança continua nos meses seguintes até alguém lançar ou marcar que não repete mais.', para: ['despesas.lancar'] },
        ],
      },
      {
        id: 'fechado',
        titulo: 'Período fechado e ressalvas',
        blocos: [
          { texto: 'Fechado com ressalvas quer dizer que o período foi fechado com algo conhecido em aberto, como uma despesa que repete e não foi lançada. As ressalvas e a justificativa ficam ali para sempre.' },
          { texto: 'Quem define o plano e as metas fecha o período em Períodos. Só a FlowFoods reabre.', para: ['metas.editar'] },
        ],
      },
    ],
  },
  {
    chave: 'dre-despesas',
    area: 'dre',
    rotas: ['dre/despesas'],
    titulo: 'Despesas',
    versao: 1,
    aula: [
      { texto: 'Aluguel, salário, luz e as outras despesas da casa, pela competência: o mês a que a despesa pertence, não o dia em que foi paga.' },
      { texto: 'A pagar mostra as que têm vencimento e ainda não foram pagas: as vencidas e as que vencem em até 7 dias. Pagar não muda o DRE.' },
      { texto: 'Despesa da rede, que não é de uma loja, só aparece para quem tem a rede inteira.' },
      { texto: 'Lance cada despesa uma vez. As que repetem todo mês voltam em Lançar as do mês passado, com o valor para você conferir.', para: ['despesas.lancar'] },
    ],
  },
  {
    chave: 'dre-despesa',
    area: 'dre',
    rotas: ['dre/despesas/[id]'],
    titulo: 'Despesa',
    versao: 1,
    aula: [
      { texto: 'Os dados da despesa, como o DRE a conta dia a dia e tudo o que mudou nela, com antes e depois.' },
      { texto: 'Pagar, desfazer o pagamento e parar de repetir valem mesmo em período fechado, porque não mudam o DRE.', para: ['despesas.lancar'] },
      { texto: 'Lançou errado? Edite. Se foi a despesa que não devia existir, remova: o motivo é obrigatório e o que estava lançado fica no histórico.', para: ['despesas.lancar'] },
    ],
  },
  {
    chave: 'dre-despesa-nova',
    area: 'dre',
    rotas: ['dre/despesas/nova', 'dre/despesas/[id]/editar'],
    titulo: 'Lançar despesa',
    versao: 1,
    aula: [
      { texto: 'Escolha a linha do DRE, a loja (ou a rede) e a competência: um dia, um mês ou um período de até 366 dias.' },
      { texto: 'O DRE espalha o valor pelos dias da competência, ao centavo; repete todo mês vale só para o mês inteiro.' },
      { texto: 'O vencimento é opcional e só põe a despesa em A pagar; mandou duas vezes sem querer, fica uma só.' },
    ],
  },
  {
    chave: 'dre-periodos',
    area: 'dre',
    rotas: ['dre/periodos'],
    titulo: 'Períodos',
    versao: 2,
    aula: [
      { texto: 'O período em que o resultado fecha, mensal, quinzenal ou semanal, com o dia em que começa, é o mesmo da contagem de estoque.' },
      { texto: 'Mudar a regra nunca mexe no passado: ela vale a partir do dia seguinte ao fim do período de agora, e o primeiro período novo nasce cortado no começo.' },
      { texto: 'Quem define o plano de contas e o período, com a rede inteira, muda a regra; os outros só consultam.' },
      { texto: 'Cada período que já terminou tem a sua página: ali estão as condições para fechar, a fotografia do fechamento e as versões.', para: ['metas.editar'] },
    ],
  },
  {
    chave: 'dre-plano',
    area: 'dre',
    rotas: ['dre/plano'],
    titulo: 'Plano e metas',
    versao: 5,
    aula: [
      { texto: 'Em Metas, escreva quanto cada linha deveria pesar na receita bruta, em %; vazio é sem meta e zero é uma meta de zero.' },
      { texto: 'A meta vale a partir do começo do período de agora, igual na rede e em cada loja; o passado não muda.' },
      { texto: 'No plano de contas, renomear uma linha não perde nada; ocultar tira do formulário de despesa, e linha nunca se apaga.' },
      { texto: 'As linhas calculadas vêm do sistema: não se renomeiam, mas aceitam meta; a do CMV compara com o real ou, sem ele, com as compras.' },
      { texto: 'A meta do CMV também é o total das metas por categoria: quem a muda aqui muda lá, e a divisão por categoria fica em Metas por categoria.', para: ['metas.editar'] },
    ],
    secoes: [
      {
        id: 'metas',
        titulo: 'Como as metas funcionam',
        blocos: [
          { texto: 'Na receita (a total e a de cada canal), a meta é de crescimento sobre o mesmo período do ano passado, de 0 a 100 %: zero é igualar o ano passado. Não há meta negativa nem em reais.', para: ['metas.editar'] },
          { texto: 'Nas outras linhas a meta é o percentual da receita bruta. O farol compara o realizado com ela em 5 faixas fixas.', para: ['metas.editar'] },
          { texto: 'Cada período usa a meta que valia no começo dele: período antigo ainda aberto não pega meta escrita depois. Salvar de novo no mesmo período troca a meta, e apagar grava sem meta.' },
          { texto: 'A tabela inteira é salva de uma vez. Se outra pessoa mudou as metas no meio tempo, a tela avisa e nada é gravado.' },
        ],
      },
      {
        id: 'plano',
        titulo: 'Ocultar e as despesas já lançadas',
        blocos: [
          { texto: 'Linha oculta continua no DRE dos períodos em que tem valor. Renomear mantém a linha: as despesas já lançadas mostram o nome novo.' },
        ],
      },
    ],
  },
  {
    chave: 'dre-cmv-categorias',
    area: 'dre',
    rotas: ['dre/cmv-categorias'],
    titulo: 'CMV por categoria',
    versao: 4,
    aula: [
      { texto: 'Esta tela mostra para onde foi o custo, categoria por categoria, para quem acompanha o resultado.' },
      { texto: 'É o CMV do DRE aberto em categorias: quanto foi para Proteína, Hortifruti, Bebidas e as outras, e quanto isso pesa na receita bruta.', para: ['dre.ver'] },
      { texto: 'A soma das categorias é a linha do CMV do DRE, ao centavo. Onde o estoque foi contado por insumo no começo e no fim do período, a categoria mostra o que foi consumido de verdade (o real); onde não foi, as compras, e a diferença aparece numa linha à parte.', para: ['dre.ver'] },
      { texto: 'Cada categoria com meta tem o desvio e o farol, as mesmas 5 faixas do DRE. Os maiores desvios mostram as categorias que saíram da meta, a que mais passou primeiro.', para: ['dre.ver'] },
    ],
    secoes: [
      {
        id: 'real-por-categoria',
        titulo: 'O real por categoria',
        blocos: [
          { texto: 'Real da categoria = estoque inicial + entradas de compra − estoque final, com o mesmo corte do real do DRE. O estoque de cada categoria sai do retrato por insumo que o fechamento do estoque guarda; só abre por categoria a loja que tem esse retrato no início e no fim do período.', para: ['dre.ver'] },
          { texto: 'Fechamento feito antes do retrato por insumo não abre por categoria, e não é reconstruído: o preço da época não existe. A loja fica pelas compras e a linha “Variação do estoque, ainda não aberta por categoria” explica a diferença, dizendo qual loja.', para: ['dre.ver'] },
          { texto: 'O estoque de pré-preparo fica na linha dele, sem meta e sem farol: negativo quer dizer que o estoque dele subiu no período. Os ingredientes ficam na categoria do ingrediente.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'compra-x-real',
        titulo: 'Compra × real',
        blocos: [
          { texto: 'A diferença é o real menos a compra, em R$ e em pontos da receita, com o mesmo sinal. Negativa: a casa comprou mais do que consumiu, e o estoque daquela categoria subiu, dinheiro parado na prateleira. Positiva: consumiu do que já tinha.', para: ['dre.ver'] },
          { texto: 'Só entram as lojas com o real aberto por categoria; as outras aparecem como “ficaram de fora”, com o motivo.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'evolucao-e-por-loja',
        titulo: 'Evolução e por loja',
        blocos: [
          { texto: 'A evolução mostra os últimos 6 períodos, do mais antigo ao mais novo, com a meta que valia em cada um. Período fechado vem da fotografia como ela está; o que não tem dado fica vazio, nunca zero.', para: ['dre.ver'] },
          { texto: 'Por loja (só na rede) põe cada categoria ao lado de cada loja, contra a receita da própria loja. A coluna de cada loja fecha no CMV do DRE dela.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'categoria-de-hoje',
        titulo: 'A categoria de hoje',
        blocos: [
          { texto: 'A conta usa a categoria que o insumo tem hoje, em todas as parcelas do período (compras, estoque inicial e final). Passar o bacon de Laticínios para Proteína muda o período em curso inteiro de uma vez, e o total não muda.', para: ['dre.ver'] },
          { texto: 'Período fechado mostra a fotografia: a categoria e a meta daquele dia. Reclassificar depois não o altera.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'sem-cor',
        titulo: 'Quando a categoria fica sem cor',
        blocos: [
          { texto: 'Falta faturamento, falta o CMV de alguma loja, ou Outros mais Sem categoria passam de 2% do CMV: a meta ainda não é confiável, então o desvio fica em texto e o motivo vem escrito. O 2% é uma hipótese a validar com a casa.', para: ['dre.ver'] },
          { texto: 'Outros / a classificar e Sem categoria são fila de classificação: não têm farol. Classificar os insumos devolve as cores.', para: ['dre.ver'] },
          { texto: 'Se o painel não fecha com o CMV do DRE e nenhuma loja explica a diferença, aparece a linha “Diferença que o painel não explica” e as categorias ficam sem cor: o dado não fecha.', para: ['dre.ver'] },
          { texto: 'A cor usa pontos da receita, a régua do DRE. Embaixo do desvio, o percentual da própria meta ajuda a ler a categoria pequena (0,20 pp em Limpeza pode ser 40% da meta), mas nunca muda a cor nem a ordem.', para: ['dre.ver'] },
        ],
      },
      {
        id: 'limites',
        titulo: 'O que ainda não está aqui',
        blocos: [
          { texto: 'Não existe transferência de estoque entre lojas no sistema: o real de uma loja não desconta o que ela mandou para outra. O da rede continua certo; o de cada loja pode distorcer enquanto isso não existir.', para: ['dre.ver'] },
          { texto: 'Na rede, o percentual de cada categoria é sobre a receita das lojas que a usam.', para: ['dre.ver'] },
        ],
      },
    ],
  },
  {
    chave: 'dre-metas-categorias',
    area: 'dre',
    rotas: ['dre/metas-categorias'],
    titulo: 'Metas por categoria',
    versao: 3,
    aula: [
      { texto: 'Aqui quem define as metas diz quanto cada categoria pode pesar, em % da receita bruta.' },
      { texto: 'Vazio é sem meta e zero é uma meta de zero. A meta total é a do CMV do DRE; a divisão pode não fechar nela, e a tela só avisa a diferença.', para: ['metas.editar'] },
      { texto: 'Usar o modelo de 32% só preenche o formulário, como referência ilustrativa: confira, mude e salve. Nada é gravado antes disso.', para: ['metas.editar'] },
    ],
    secoes: [
      {
        id: 'rede-e-loja',
        titulo: 'Rede e loja',
        blocos: [
          { texto: 'A rede define as metas de todas as lojas. Cada loja segue a rede ou personaliza o conjunto inteiro, sem misturar meta herdada com meta própria.', para: ['metas.editar'] },
          { texto: 'Mudar a rede só afeta as lojas que a seguem, e a tela diz quais. Mudar uma loja não toca nenhuma outra.', para: ['metas.editar'] },
          { texto: 'A categoria que a loja não usa sai das metas e do painel dela, a não ser que tenha valor: custo nunca some.', para: ['metas.editar'] },
          { texto: 'A loja que personaliza pode ter a meta total do CMV dela. Ela vale na linha CMV do DRE da loja e no orçamento de compra dela; deixar vazio usa a meta total da rede. A rede continua com a meta da rede.', para: ['metas.editar'] },
          { texto: 'Na rede, o percentual de cada categoria é sobre a receita das lojas que a usam.', para: ['metas.editar'] },
        ],
      },
      {
        id: 'vigencia',
        titulo: 'Desde quando vale',
        blocos: [
          { texto: 'A meta vale a partir do começo do período de agora. Os períodos anteriores seguem com as metas que valiam neles e o passado nunca é reescrito.', para: ['metas.editar'] },
          { texto: 'Duas pessoas salvando ao mesmo tempo: a segunda recebe o aviso e nada é gravado.', para: ['metas.editar'] },
        ],
      },
    ],
  },
  {
    chave: 'dre-periodo',
    area: 'dre',
    rotas: ['dre/periodos/[inicio]'],
    titulo: 'Fechar o período',
    versao: 4,
    aula: [
      { texto: 'Fechar guarda uma fotografia do DRE do período, e depois nada muda dentro das datas dele: nem faturamento, nem despesa, nem nota de compra, nem fechamento de estoque.' },
      { texto: 'Faturamento faltando, taxa do iFood sem configurar, estoque em contagem de fechamento e rede sem lançamento travam, e não aceitam justificativa.' },
      { texto: 'Despesa que repete e não foi lançada, loja sem o estoque fechado e loja sem faturamento são ressalvas: marque cada uma e escreva uma justificativa.' },
      { texto: 'Só a FlowFoods reabre um período fechado, com o motivo; fechar de novo gera a versão seguinte.' },
    ],
    secoes: [
      {
        id: 'ressalvas',
        titulo: 'O que é uma ressalva',
        blocos: [
          { texto: 'É algo que a casa sabe que está faltando e decide fechar assim mesmo. A justificativa tem de 10 a 300 letras, vai para a fotografia e para o Histórico, e o DRE fechado mostra Fechado com ressalvas para sempre.' },
          { texto: 'A despesa que repete e falta lançar pode ser lançada antes, com o valor do mês passado como ponto de partida.', para: ['despesas.lancar'] },
        ],
      },
      {
        id: 'versoes',
        titulo: 'Reabrir e as versões',
        blocos: [
          { texto: 'Reabrir deixa o período aberto de novo para lançar e corrigir. A fotografia anterior fica guardada em Versões, com quem reabriu e por quê.' },
          { texto: 'Ao fechar de novo sai a versão seguinte. A dona da casa não reabre: o período fechado é o ponto de controle do consultor.' },
          { texto: 'A fotografia guarda o CMV de compra e o real de cada loja. Período fechado antes de o CMV existir diz que não apurou: para guardá-lo, reabre e fecha de novo.' },
          { texto: 'Também guarda a receita do ano passado e a versão das faixas do farol. O período fechado lê o farol e a variação só da fotografia: mudar a meta ou o faturamento do ano passado depois não o altera. Fechado antes do farol, a receita diz que não foi apurada neste fechamento.', para: ['dre.ver'] },
          { texto: 'E guarda o CMV por categoria de cada loja: as compras de cada categoria, a meta que valia e o nome da categoria daquele dia. Reclassificar um insumo ou renomear uma categoria depois não mexe nele. Fechado antes, diz que não foi apurado por categoria.', para: ['dre.ver'] },
        ],
      },
    ],
  },
];
