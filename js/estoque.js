/*
 * estoque.js
 * Movimentações de estoque (spec 4.6, 4.10 e 4.11) e a tela de Estoque.
 * "quantidadeEstoque" só muda por meio de uma movimentação registrada.
 */
const Estoque = (() => {
  const LIMITE_MOVIMENTOS_NA_TELA = 50;
  const ROTULOS_MOTIVO = {
    venda: 'Venda',
    reabastecimento: 'Reabastecimento',
    ajuste: 'Ajuste do chefe'
  };

  /*
   * Núcleo: atualiza a quantidade do produto e grava a movimentação juntas.
   * Deve ser chamada dentro de Banco.transacao.
   */
  function registrarMovimento(dados) {
    const { produtoId, tipo, quantidade, motivo, usuarioId } = dados;
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      throw new Error('A quantidade da movimentação deve ser um número inteiro maior que zero.');
    }
    if (tipo !== 'entrada' && tipo !== 'saida') throw new Error('Tipo de movimentação inválido.');

    const produtos = Banco.ler('produtos');
    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) throw new Error('Produto não encontrado.');

    const novaQuantidade = tipo === 'entrada' ? produto.quantidadeEstoque + quantidade : produto.quantidadeEstoque - quantidade;
    if (novaQuantidade < 0) {
      throw new Error(`Estoque insuficiente de "${produto.nome}". Disponível: ${produto.quantidadeEstoque}.`);
    }
    produto.quantidadeEstoque = novaQuantidade;
    Banco.gravar('produtos', produtos);

    const movimentos = Banco.ler('movimentos');
    movimentos.push({
      id: Banco.proximoId('movimentos'),
      produtoId,
      tipo,
      quantidade,
      motivo,
      usuarioId,
      vendaId: dados.vendaId || null,
      observacao: dados.observacao || '',
      dataHora: Banco.agora()
    });
    Banco.gravar('movimentos', movimentos);
    return novaQuantidade;
  }

  function validarQuantidade(valor) {
    const quantidade = typeof valor === 'number' ? valor : Banco.lerInteiro(valor);
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      throw new Error('Informe uma quantidade inteira maior que zero.');
    }
    return quantidade;
  }

  function obterProdutoAtivo(produtoId) {
    const produto = Banco.ler('produtos').find((p) => p.id === produtoId);
    if (!produto) throw new Error('Produto não cadastrado. Cadastre o produto antes, na tela Produtos.');
    if (!produto.ativo) throw new Error(`"${produto.nome}" foi removido. Peça ao chefe para reativá-lo.`);
    return produto;
  }

  // 4.6: entrada manual por reabastecimento (ajudante geral ou chefe).
  function registrarEntrada(produtoId, quantidadeBruta, observacao) {
    const usuario = Auth.exigir('estoque.entrada');
    const quantidade = validarQuantidade(quantidadeBruta);
    return Banco.transacao(() => {
      const produto = obterProdutoAtivo(produtoId);
      const atual = registrarMovimento({
        produtoId: produto.id,
        tipo: 'entrada',
        quantidade,
        motivo: 'reabastecimento',
        usuarioId: usuario.id,
        observacao: String(observacao || '').trim()
      });
      return { nome: produto.nome, quantidade, quantidadeAtual: atual };
    });
  }

  // 4.10: ajuste feito somente pelo chefe, sempre com observação.
  function ajustar(produtoId, contadaBruta, observacao) {
    const usuario = Auth.exigir('estoque.ajustar');
    const contada = Banco.lerInteiro(contadaBruta);
    if (!Number.isInteger(contada) || contada < 0) {
      throw new Error('Informe a quantidade contada como um número inteiro, zero ou maior.');
    }
    const texto = String(observacao || '').trim();
    if (!texto) throw new Error('Explique o motivo do ajuste na observação.');

    return Banco.transacao(() => {
      const produto = obterProdutoAtivo(produtoId);
      const diferenca = contada - produto.quantidadeEstoque;
      if (diferenca === 0) {
        return { nome: produto.nome, de: produto.quantidadeEstoque, para: contada, semDiferenca: true };
      }
      registrarMovimento({
        produtoId: produto.id,
        tipo: diferenca > 0 ? 'entrada' : 'saida',
        quantidade: Math.abs(diferenca),
        motivo: 'ajuste',
        usuarioId: usuario.id,
        observacao: texto
      });
      return { nome: produto.nome, de: produto.quantidadeEstoque, para: contada, semDiferenca: false };
    });
  }

  // 4.11: produtos ativos com quantidade igual ou abaixo do mínimo.
  function listarBaixo() {
    Auth.exigir('estoque.consultar');
    return Banco.ler('produtos')
      .filter((p) => p.ativo && p.quantidadeEstoque <= p.estoqueMinimo)
      .sort((a, b) => a.quantidadeEstoque - b.quantidadeEstoque || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  function listarMovimentos(limite) {
    Auth.exigir('estoque.consultar');
    const produtos = Banco.ler('produtos');
    return Banco.ler('movimentos')
      .slice()
      .sort((a, b) => b.id - a.id)
      .slice(0, limite || LIMITE_MOVIMENTOS_NA_TELA)
      .map((m) => {
        const produto = produtos.find((p) => p.id === m.produtoId);
        return Object.assign({}, m, { produtoNome: produto ? produto.nome : '—' });
      });
  }

  /* Tela */

  const $ = (id) => document.getElementById(id);

  function iniciarTela() {
    $('est-form-entrada').addEventListener('submit', (evento) => {
      evento.preventDefault();
      enviarEntrada();
    });
    $('est-form-ajuste').addEventListener('submit', (evento) => {
      evento.preventDefault();
      enviarAjuste();
    });
  }

  function abrirTela() {
    UI.limparErro($('est-entrada-erro'));
    UI.limparErro($('est-ajuste-erro'));
    renderizar();
  }

  function localizarProdutoDoCampo(termo) {
    const produto = Produtos.localizar(termo);
    if (!produto) throw new Error('Produto não encontrado. Cadastre o produto antes, na tela Produtos.');
    return produto;
  }

  function enviarEntrada() {
    const erro = $('est-entrada-erro');
    UI.limparErro(erro);
    try {
      const produto = localizarProdutoDoCampo($('est-entrada-produto').value);
      const resultado = registrarEntrada(produto.id, $('est-entrada-quantidade').value, $('est-entrada-obs').value);
      $('est-form-entrada').reset();
      UI.mensagem(
        `Entrada registrada: +${resultado.quantidade} de "${resultado.nome}". Estoque atual: ${resultado.quantidadeAtual}.`,
        'sucesso'
      );
      renderizar();
    } catch (falha) {
      UI.mostrarErro(erro, falha.message);
    }
  }

  function enviarAjuste() {
    const erro = $('est-ajuste-erro');
    UI.limparErro(erro);
    try {
      const produto = localizarProdutoDoCampo($('est-ajuste-produto').value);
      const resultado = ajustar(produto.id, $('est-ajuste-contada').value, $('est-ajuste-obs').value);
      $('est-form-ajuste').reset();
      if (resultado.semDiferenca) {
        UI.mensagem(`"${resultado.nome}" já está com ${resultado.para} no sistema. Nenhum ajuste foi necessário.`, 'info');
      } else {
        UI.mensagem(`Ajuste registrado em "${resultado.nome}": de ${resultado.de} para ${resultado.para}.`, 'sucesso');
      }
      renderizar();
    } catch (falha) {
      UI.mostrarErro(erro, falha.message);
    }
  }

  function renderizar() {
    renderizarBaixo();
    renderizarLista();
    renderizarMovimentos();
  }

  function renderizarBaixo() {
    const corpo = $('est-baixo');
    UI.limpar(corpo);
    const produtos = listarBaixo();
    produtos.forEach((p) => {
      corpo.append(
        UI.el(
          'tr',
          null,
          UI.celula(p.nome),
          UI.celula(String(p.quantidadeEstoque), p.quantidadeEstoque === 0 ? 'num texto-alerta' : 'num'),
          UI.celula(String(p.estoqueMinimo), 'num'),
          UI.celula(p.distribuidora)
        )
      );
    });
    $('est-baixo-vazio').hidden = produtos.length > 0;
    $('est-baixo-tabela').hidden = produtos.length === 0;
  }

  function renderizarLista() {
    const lista = $('est-lista-produtos');
    UI.limpar(lista);
    Banco.ler('produtos')
      .filter((p) => p.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .forEach((p) => lista.append(UI.el('option', { value: p.nome, label: p.codigoBarras })));
  }

  function renderizarMovimentos() {
    const corpo = $('est-movimentos');
    UI.limpar(corpo);
    const movimentos = listarMovimentos();
    movimentos.forEach((m) => {
      corpo.append(
        UI.el(
          'tr',
          null,
          UI.celula(UI.formatarDataHora(m.dataHora)),
          UI.celula(m.produtoNome),
          UI.celula(UI.selo(m.tipo === 'entrada' ? 'Entrada' : 'Saída', m.tipo)),
          UI.celula(String(m.quantidade), 'num'),
          UI.celula(ROTULOS_MOTIVO[m.motivo] || m.motivo),
          UI.celula(Auth.nomeUsuario(m.usuarioId)),
          UI.celula(m.observacao || '—')
        )
      );
    });
    $('est-movimentos-vazio').hidden = movimentos.length > 0;
    $('est-movimentos-tabela').hidden = movimentos.length === 0;
  }

  return {
    registrarMovimento,
    registrarEntrada,
    ajustar,
    listarBaixo,
    listarMovimentos,
    iniciarTela,
    abrirTela
  };
})();
