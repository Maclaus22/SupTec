/*
 * produtos.js
 * Cadastro, alteração, remoção e reativação de produtos (spec 4.4, 4.8 e 4.9)
 * e a tela de Produtos. A quantidade em estoque nunca é editada aqui:
 * ela só muda por movimentação (estoque.js).
 */
const Produtos = (() => {
  const EXEMPLOS = [
    { nome: 'Fone de ouvido Bluetooth', codigoBarras: '7891000100103', valor: 89.9, quantidadeInicial: 15, estoqueMinimo: 5, distribuidora: 'TechDist' },
    { nome: 'Mouse sem fio', codigoBarras: '7891000100110', valor: 49.9, quantidadeInicial: 20, estoqueMinimo: 5, distribuidora: 'TechDist' },
    { nome: 'Cabo USB-C 1 m', codigoBarras: '7891000100127', valor: 24.9, quantidadeInicial: 3, estoqueMinimo: 5, distribuidora: 'Conecta Atacado' },
    { nome: 'Película 3D para celular', codigoBarras: '7891000100134', valor: 19.9, quantidadeInicial: 40, estoqueMinimo: 10, distribuidora: 'Conecta Atacado' },
    { nome: 'Capa transparente para celular', codigoBarras: '7891000100141', valor: 14.9, quantidadeInicial: 30, estoqueMinimo: 10, distribuidora: 'Conecta Atacado' },
    { nome: 'Caixa de som portátil', codigoBarras: '7891000100158', valor: 129.9, quantidadeInicial: 8, estoqueMinimo: 3, distribuidora: 'TechDist' }
  ];

  /* Regras de negócio */

  function validarDados(dados, opcoes) {
    const nome = String(dados.nome || '').trim();
    const distribuidora = String(dados.distribuidora || '').trim();
    const codigoBarras = String(dados.codigoBarras || '').trim();
    const valor = typeof dados.valor === 'number' ? dados.valor : Banco.lerDecimal(dados.valor);
    const estoqueMinimo =
      dados.estoqueMinimo === '' || dados.estoqueMinimo === undefined || dados.estoqueMinimo === null
        ? 0
        : typeof dados.estoqueMinimo === 'number'
          ? dados.estoqueMinimo
          : Banco.lerInteiro(dados.estoqueMinimo);

    if (!nome) throw new Error('Informe o nome do produto.');
    if (!codigoBarras) throw new Error('Informe o código de barras do produto.');
    if (isNaN(valor)) throw new Error('Informe o valor do produto em reais.');
    if (valor <= 0) throw new Error('O valor do produto deve ser maior que zero.');
    if (!distribuidora) throw new Error('Informe a distribuidora do produto.');
    if (!Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
      throw new Error('O estoque mínimo deve ser um número inteiro, zero ou maior.');
    }

    let quantidadeInicial = 0;
    if (opcoes.ehCadastro) {
      const bruta = dados.quantidadeInicial;
      quantidadeInicial = bruta === '' || bruta === undefined || bruta === null ? 0 : typeof bruta === 'number' ? bruta : Banco.lerInteiro(bruta);
      if (!Number.isInteger(quantidadeInicial) || quantidadeInicial < 0) {
        throw new Error('A quantidade inicial deve ser um número inteiro, zero ou maior.');
      }
    }

    const duplicado = Banco.ler('produtos').find((p) => p.codigoBarras === codigoBarras && p.id !== opcoes.idAtual);
    if (duplicado) {
      if (!duplicado.ativo) {
        throw new Error(`Este código de barras pertence a um produto removido ("${duplicado.nome}"). Peça ao chefe para reativá-lo.`);
      }
      throw new Error(`Já existe um produto com este código de barras ("${duplicado.nome}").`);
    }

    return {
      nome,
      valor: Math.round(valor * 100) / 100,
      distribuidora,
      estoqueMinimo,
      codigoBarras,
      quantidadeInicial
    };
  }

  // Criação sem checagem de perfil, usada pelo cadastro e pelos dados de exemplo.
  function criarProduto(dados, usuarioId) {
    const limpos = validarDados(dados, { ehCadastro: true, idAtual: null });
    const produtos = Banco.ler('produtos');
    const produto = {
      id: Banco.proximoId('produtos'),
      nome: limpos.nome,
      valor: limpos.valor,
      distribuidora: limpos.distribuidora,
      estoqueMinimo: limpos.estoqueMinimo,
      codigoBarras: limpos.codigoBarras,
      quantidadeEstoque: 0,
      ativo: true
    };
    produtos.push(produto);
    Banco.gravar('produtos', produtos);
    if (limpos.quantidadeInicial > 0) {
      // PA02 (em aberto): a quantidade inicial é registrada como entrada de reabastecimento.
      Estoque.registrarMovimento({
        produtoId: produto.id,
        tipo: 'entrada',
        quantidade: limpos.quantidadeInicial,
        motivo: 'reabastecimento',
        usuarioId,
        observacao: 'Cadastro inicial do produto'
      });
    }
    return Banco.ler('produtos').find((p) => p.id === produto.id);
  }

  function cadastrar(dados) {
    const usuario = Auth.exigir('produto.cadastrar');
    return Banco.transacao(() => criarProduto(dados, usuario.id));
  }

  function alterar(id, dados) {
    Auth.exigir('produto.alterar');
    return Banco.transacao(() => {
      const produtos = Banco.ler('produtos');
      const produto = produtos.find((p) => p.id === id);
      if (!produto) throw new Error('Produto não encontrado.');
      const limpos = validarDados(dados, { ehCadastro: false, idAtual: id });
      produto.nome = limpos.nome;
      produto.valor = limpos.valor;
      produto.distribuidora = limpos.distribuidora;
      produto.estoqueMinimo = limpos.estoqueMinimo;
      produto.codigoBarras = limpos.codigoBarras;
      Banco.gravar('produtos', produtos);
      return produto;
    });
  }

  function definirAtivo(id, ativo) {
    Auth.exigir('produto.remover');
    return Banco.transacao(() => {
      const produtos = Banco.ler('produtos');
      const produto = produtos.find((p) => p.id === id);
      if (!produto) throw new Error('Produto não encontrado.');
      if (produto.ativo === ativo) {
        throw new Error(ativo ? 'Este produto já está ativo.' : 'Este produto já foi removido.');
      }
      produto.ativo = ativo;
      Banco.gravar('produtos', produtos);
      return produto;
    });
  }

  const remover = (id) => definirAtivo(id, false);
  const reativar = (id) => definirAtivo(id, true);

  function listar(termo, incluirRemovidos) {
    Auth.exigir('produto.consultar');
    const busca = Banco.normalizar(termo);
    const verRemovidos = Boolean(incluirRemovidos) && Auth.pode('produto.remover');
    return Banco.ler('produtos')
      .filter((p) => verRemovidos || p.ativo)
      .filter((p) => !busca || Banco.normalizar(p.nome).includes(busca) || p.codigoBarras.includes(busca))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // Leitura interna por código exato, sem checagem de perfil (usada no caixa).
  function obterPorCodigo(codigo) {
    return Banco.ler('produtos').find((p) => p.codigoBarras === String(codigo || '').trim()) || null;
  }

  /*
   * Localiza por código de barras exato, nome exato ou nome parcial único.
   * Devolve null quando nada é encontrado.
   */
  function localizar(termo) {
    const texto = String(termo || '').trim();
    if (!texto) throw new Error('Informe o nome ou o código de barras do produto.');
    const produtos = Banco.ler('produtos');
    const porCodigo = produtos.find((p) => p.codigoBarras === texto);
    if (porCodigo) return porCodigo;
    const busca = Banco.normalizar(texto);
    const exatos = produtos.filter((p) => Banco.normalizar(p.nome) === busca);
    if (exatos.length === 1) return exatos[0];
    const parciais = exatos.length > 1 ? exatos : produtos.filter((p) => p.ativo && Banco.normalizar(p.nome).includes(busca));
    if (parciais.length === 1) return parciais[0];
    if (parciais.length > 1) throw new Error('Mais de um produto encontrado. Use o código de barras ou o nome completo.');
    return null;
  }

  // Dados de exemplo para testar o sistema; carregados uma única vez.
  function semearExemplos(usuario) {
    if (Banco.ler('meta').exemplosCarregados) return;
    Banco.transacao(() => {
      if (Banco.ler('produtos').length === 0) {
        EXEMPLOS.forEach((exemplo) => criarProduto(exemplo, usuario.id));
      }
      Banco.atualizarMeta({ exemplosCarregados: true });
    });
  }

  /* Tela */

  const $ = (id) => document.getElementById(id);
  let editandoId = null;

  function mostrarPainel(nome) {
    $('prod-painel-lista').hidden = nome !== 'lista';
    $('prod-painel-form').hidden = nome !== 'form';
  }

  function iniciarTela() {
    $('prod-form-busca').addEventListener('submit', (evento) => {
      evento.preventDefault();
      renderizarLista();
    });
    $('prod-mostrar-removidos').addEventListener('change', renderizarLista);
    $('prod-btn-novo').addEventListener('click', () => abrirFormulario(null));
    $('prod-form-voltar').addEventListener('click', () => {
      mostrarPainel('lista');
      renderizarLista();
    });
    $('prod-form').addEventListener('submit', (evento) => {
      evento.preventDefault();
      salvar();
    });
  }

  function abrirTela() {
    mostrarPainel('lista');
    renderizarLista();
  }

  function renderizarLista() {
    const corpo = $('prod-lista');
    let produtos;
    try {
      produtos = listar($('prod-busca-termo').value, $('prod-mostrar-removidos').checked);
    } catch (falha) {
      UI.mensagem(falha.message, 'erro');
      return;
    }
    UI.limpar(corpo);
    produtos.forEach((p) => {
      const acoes = [];
      if (Auth.pode('produto.alterar')) {
        acoes.push(UI.el('button', { type: 'button', classe: 'botao botao-pequeno', texto: 'Editar', onclick: () => abrirFormulario(p.id) }));
      }
      if (Auth.pode('produto.remover')) {
        acoes.push(
          p.ativo
            ? UI.el('button', { type: 'button', classe: 'botao botao-pequeno', texto: 'Remover', onclick: () => confirmarRemocao(p) })
            : UI.el('button', { type: 'button', classe: 'botao botao-pequeno', texto: 'Reativar', onclick: () => reativarProduto(p) })
        );
      }
      const baixo = p.ativo && p.quantidadeEstoque <= p.estoqueMinimo;
      corpo.append(
        UI.el(
          'tr',
          { classe: p.ativo ? '' : 'linha-cancelada' },
          UI.celula(p.nome),
          UI.celula(p.codigoBarras, 'mono'),
          UI.celula(UI.formatarMoeda(p.valor), 'num'),
          UI.celula(String(p.quantidadeEstoque), baixo ? 'num texto-alerta' : 'num'),
          UI.celula(String(p.estoqueMinimo), 'num'),
          UI.celula(p.distribuidora),
          UI.celula(UI.selo(p.ativo ? 'Ativo' : 'Removido', p.ativo ? 'concluida' : 'cancelada')),
          UI.celula(UI.el('div', { classe: 'acoes-linha' }, acoes))
        )
      );
    });
    $('prod-vazio').hidden = produtos.length > 0;
    $('prod-tabela').hidden = produtos.length === 0;
  }

  function abrirFormulario(id) {
    editandoId = id;
    UI.limparErro($('prod-form-erro'));
    $('prod-form').reset();
    $('prod-campo-quantidade').hidden = id !== null;
    $('prod-form-titulo').textContent = id === null ? 'Novo produto' : 'Editar produto';
    if (id !== null) {
      const produto = Banco.ler('produtos').find((p) => p.id === id);
      if (!produto) {
        UI.mensagem('Produto não encontrado.', 'erro');
        return;
      }
      $('prod-nome').value = produto.nome;
      $('prod-codigo').value = produto.codigoBarras;
      $('prod-valor').value = produto.valor;
      $('prod-minimo').value = produto.estoqueMinimo;
      $('prod-distribuidora').value = produto.distribuidora;
    }
    mostrarPainel('form');
    $('prod-nome').focus();
  }

  function salvar() {
    const erro = $('prod-form-erro');
    UI.limparErro(erro);
    const dados = {
      nome: $('prod-nome').value,
      codigoBarras: $('prod-codigo').value,
      valor: $('prod-valor').value,
      quantidadeInicial: $('prod-quantidade').value,
      estoqueMinimo: $('prod-minimo').value,
      distribuidora: $('prod-distribuidora').value
    };
    try {
      if (editandoId === null) {
        const produto = cadastrar(dados);
        UI.mensagem(`Produto "${produto.nome}" cadastrado.`, 'sucesso');
      } else {
        const produto = alterar(editandoId, dados);
        UI.mensagem(`Produto "${produto.nome}" atualizado. O novo valor vale a partir das próximas vendas.`, 'sucesso');
      }
      mostrarPainel('lista');
      renderizarLista();
    } catch (falha) {
      UI.mostrarErro(erro, falha.message);
    }
  }

  async function confirmarRemocao(produto) {
    const aviso =
      produto.quantidadeEstoque > 0
        ? `"${produto.nome}" ainda tem ${produto.quantidadeEstoque} unidade(s) em estoque. `
        : '';
    const resposta = await UI.dialogo({
      titulo: 'Remover produto',
      texto: `${aviso}Ao remover, o produto deixa de aparecer no caixa e nas listas de estoque. O histórico de vendas é mantido e o chefe pode reativá-lo depois.`,
      textoConfirmar: 'Remover produto',
      perigo: true
    });
    if (!resposta.confirmado) return;
    try {
      remover(produto.id);
      UI.mensagem(`"${produto.nome}" foi removido.`, 'sucesso');
      renderizarLista();
    } catch (falha) {
      UI.mensagem(falha.message, 'erro');
    }
  }

  function reativarProduto(produto) {
    try {
      reativar(produto.id);
      UI.mensagem(`"${produto.nome}" foi reativado.`, 'sucesso');
      renderizarLista();
    } catch (falha) {
      UI.mensagem(falha.message, 'erro');
    }
  }

  return {
    cadastrar,
    alterar,
    remover,
    reativar,
    listar,
    obterPorCodigo,
    localizar,
    semearExemplos,
    iniciarTela,
    abrirTela
  };
})();
