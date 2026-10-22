/*
 * caixa.js
 * Venda de produtos por código de barras (spec 4.5) e a tela de Caixa.
 * O carrinho fica só na memória: cancelar a venda antes de finalizar não mexe no estoque.
 * O pagamento é feito na maquininha, fora do sistema.
 */
const Caixa = (() => {
  let itens = []; // { produtoId, nome, codigoBarras, quantidade, valorUnitario }

  /* Regras de negócio */

  function somarTotal(lista) {
    const centavos = lista.reduce((soma, item) => soma + Math.round(item.valorUnitario * 100) * item.quantidade, 0);
    return centavos / 100;
  }

  function total() {
    return somarTotal(itens);
  }

  function obterItens() {
    return itens.map((item) => Object.assign({}, item, { subtotal: somarTotal([item]) }));
  }

  function lerProduto(codigo) {
    Auth.exigir('caixa.vender');
    const texto = String(codigo || '').trim();
    if (!texto) throw new Error('Leia ou digite o código de barras do produto.');
    const produto = Produtos.obterPorCodigo(texto);
    if (!produto) throw new Error('Código de barras não encontrado. Confira o código ou peça para cadastrar o produto.');
    if (!produto.ativo) throw new Error(`"${produto.nome}" foi removido e não pode ser vendido.`);
    if (produto.quantidadeEstoque <= 0) {
      throw new Error(`"${produto.nome}" está sem estoque. Se o produto existe na loja, avise o chefe para ajustar o estoque.`);
    }
    return produto;
  }

  function adicionarItem(produtoId, quantidadeBruta) {
    Auth.exigir('caixa.vender');
    const quantidade = typeof quantidadeBruta === 'number' ? quantidadeBruta : Banco.lerInteiro(quantidadeBruta);
    if (!Number.isInteger(quantidade) || quantidade <= 0) throw new Error('Informe uma quantidade inteira maior que zero.');

    const produto = Banco.ler('produtos').find((p) => p.id === produtoId);
    if (!produto || !produto.ativo) throw new Error('Produto indisponível para venda.');

    const existente = itens.find((item) => item.produtoId === produtoId);
    const jaNaVenda = existente ? existente.quantidade : 0;
    if (jaNaVenda + quantidade > produto.quantidadeEstoque) {
      const complemento = jaNaVenda > 0 ? ` (já há ${jaNaVenda} na venda)` : '';
      throw new Error(`Quantidade indisponível. Em estoque: ${produto.quantidadeEstoque}${complemento}.`);
    }

    if (existente) {
      existente.quantidade += quantidade;
      existente.valorUnitario = produto.valor;
    } else {
      itens.push({
        produtoId: produto.id,
        nome: produto.nome,
        codigoBarras: produto.codigoBarras,
        quantidade,
        valorUnitario: produto.valor
      });
    }
  }

  function removerItem(indice) {
    Auth.exigir('caixa.vender');
    if (indice < 0 || indice >= itens.length) return;
    itens.splice(indice, 1);
  }

  function cancelarVenda() {
    Auth.exigir('caixa.vender');
    itens = [];
  }

  /*
   * Finaliza: grava a venda, os itens com o valor da hora da venda e uma saída
   * de estoque por item, tudo ou nada.
   */
  function finalizar() {
    const usuario = Auth.exigir('caixa.vender');
    if (itens.length === 0) throw new Error('Adicione pelo menos um produto à venda.');

    const venda = Banco.transacao(() => {
      const produtos = Banco.ler('produtos');
      itens.forEach((item) => {
        const produto = produtos.find((p) => p.id === item.produtoId);
        if (!produto || !produto.ativo) throw new Error(`"${item.nome}" não está mais disponível para venda.`);
      });

      const registro = {
        id: Banco.proximoId('vendas'),
        dataHora: Banco.agora(),
        valorTotal: somarTotal(itens),
        registradaPor: usuario.id
      };
      const vendas = Banco.ler('vendas');
      vendas.push(registro);
      Banco.gravar('vendas', vendas);

      const itensVenda = Banco.ler('itensVenda');
      itens.forEach((item) => {
        itensVenda.push({
          id: Banco.proximoId('itensVenda'),
          vendaId: registro.id,
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario
        });
        Estoque.registrarMovimento({
          produtoId: item.produtoId,
          tipo: 'saida',
          quantidade: item.quantidade,
          motivo: 'venda',
          usuarioId: usuario.id,
          vendaId: registro.id
        });
      });
      Banco.gravar('itensVenda', itensVenda);
      return registro;
    });

    itens = [];
    return venda;
  }

  /* Tela */

  const $ = (id) => document.getElementById(id);
  let produtoLido = null;

  function iniciarTela() {
    $('cx-form-codigo').addEventListener('submit', (evento) => {
      evento.preventDefault();
      buscarProduto();
    });
    $('cx-form-quantidade').addEventListener('submit', (evento) => {
      evento.preventDefault();
      confirmarQuantidade();
    });
    $('cx-btn-descartar').addEventListener('click', () => {
      UI.limparErro($('cx-erro'));
      descartarLeitura();
    });
    $('cx-btn-finalizar').addEventListener('click', finalizarVenda);
    $('cx-btn-cancelar').addEventListener('click', cancelarAtual);
  }

  function abrirTela() {
    descartarLeitura();
    renderizar();
  }

  function buscarProduto() {
    const erro = $('cx-erro');
    UI.limparErro(erro);
    try {
      produtoLido = lerProduto($('cx-codigo').value);
    } catch (falha) {
      produtoLido = null;
      UI.mostrarErro(erro, falha.message);
      $('cx-codigo').select();
      return;
    }
    $('cx-produto-nome').textContent = produtoLido.nome;
    $('cx-produto-valor').textContent = UI.formatarMoeda(produtoLido.valor);
    $('cx-quantidade').value = '1';
    $('cx-form-quantidade').hidden = false;
    $('cx-quantidade').focus();
    $('cx-quantidade').select();
  }

  function confirmarQuantidade() {
    const erro = $('cx-erro');
    UI.limparErro(erro);
    try {
      adicionarItem(produtoLido.id, $('cx-quantidade').value);
    } catch (falha) {
      UI.mostrarErro(erro, falha.message);
      return;
    }
    descartarLeitura();
    renderizar();
  }

  function descartarLeitura() {
    produtoLido = null;
    $('cx-form-quantidade').hidden = true;
    $('cx-codigo').value = '';
    $('cx-codigo').focus();
  }

  function renderizar() {
    const corpo = $('cx-itens');
    UI.limpar(corpo);
    const lista = obterItens();
    lista.forEach((item, indice) => {
      corpo.append(
        UI.el(
          'tr',
          null,
          UI.celula(item.nome),
          UI.celula(String(item.quantidade), 'num'),
          UI.celula(UI.formatarMoeda(item.valorUnitario), 'num'),
          UI.celula(UI.formatarMoeda(item.subtotal), 'num'),
          UI.celula(
            UI.el('button', {
              type: 'button',
              classe: 'botao botao-pequeno',
              texto: 'Remover',
              'aria-label': `Remover ${item.nome} da venda`,
              onclick: () => {
                removerItem(indice);
                renderizar();
              }
            })
          )
        )
      );
    });
    $('cx-vazio').hidden = lista.length > 0;
    $('cx-tabela').hidden = lista.length === 0;
    $('cx-total').textContent = UI.formatarMoeda(total());
    $('cx-btn-finalizar').disabled = lista.length === 0;
    $('cx-btn-cancelar').disabled = lista.length === 0;
  }

  function finalizarVenda() {
    UI.limparErro($('cx-erro'));
    try {
      const venda = finalizar();
      UI.mensagem(
        `Venda ${UI.formatarId(venda.id)} finalizada: ${UI.formatarMoeda(venda.valorTotal)}. Receba o pagamento na maquininha.`,
        'sucesso'
      );
    } catch (falha) {
      UI.mostrarErro($('cx-erro'), falha.message);
      return;
    }
    descartarLeitura();
    renderizar();
  }

  async function cancelarAtual() {
    if (itens.length === 0) return;
    const resposta = await UI.dialogo({
      titulo: 'Cancelar venda',
      texto: 'Todos os produtos da venda serão descartados. O estoque não é alterado.',
      textoConfirmar: 'Cancelar venda',
      perigo: true
    });
    if (!resposta.confirmado) return;
    cancelarVenda();
    UI.limparErro($('cx-erro'));
    descartarLeitura();
    renderizar();
  }

  return {
    total,
    obterItens,
    lerProduto,
    adicionarItem,
    removerItem,
    cancelarVenda,
    finalizar,
    iniciarTela,
    abrirTela
  };
})();
