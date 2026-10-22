/*
 * storage.js
 * Camada de acesso ao localStorage: leitura, gravação, identificadores,
 * transações (tudo ou nada), exportação/importação e limpeza de dados vencidos.
 */
const Banco = (() => {
  const PREFIXO = 'suptec:';
  const CHAVES = ['usuarios', 'produtos', 'vendas', 'itensVenda', 'movimentos', 'manutencoes', 'contadores', 'meta'];
  const CHAVES_OBJETO = ['contadores', 'meta'];
  const VERSAO_DADOS = 1;
  const MESES_RETENCAO_CANCELADAS = 2; // RN: cancelada é excluída 2 meses depois

  function valorPadrao(chave) {
    return CHAVES_OBJETO.includes(chave) ? {} : [];
  }

  function ler(chave) {
    const texto = localStorage.getItem(PREFIXO + chave);
    if (texto === null) return valorPadrao(chave);
    try {
      return JSON.parse(texto);
    } catch (erro) {
      return valorPadrao(chave);
    }
  }

  function gravar(chave, valor) {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  }

  function agora() {
    return new Date().toISOString();
  }

  // Identificadores nunca são reaproveitados, mesmo depois de registros excluídos.
  function proximoId(nome) {
    const contadores = ler('contadores');
    const proximo = (contadores[nome] || 0) + 1;
    contadores[nome] = proximo;
    gravar('contadores', contadores);
    return proximo;
  }

  // RN07: a operação é concluída por inteiro ou nada é gravado.
  function transacao(operacao) {
    const copia = {};
    CHAVES.forEach((chave) => {
      copia[chave] = localStorage.getItem(PREFIXO + chave);
    });
    try {
      return operacao();
    } catch (erro) {
      CHAVES.forEach((chave) => {
        if (copia[chave] === null) localStorage.removeItem(PREFIXO + chave);
        else localStorage.setItem(PREFIXO + chave, copia[chave]);
      });
      throw erro;
    }
  }

  /* Utilitários sem relação com o DOM */

  function normalizar(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function lerInteiro(texto) {
    const limpo = String(texto === null || texto === undefined ? '' : texto).trim();
    return /^-?\d+$/.test(limpo) ? Number(limpo) : NaN;
  }

  function lerDecimal(texto) {
    const limpo = String(texto === null || texto === undefined ? '' : texto).trim().replace(',', '.');
    return limpo !== '' && !isNaN(Number(limpo)) ? Number(limpo) : NaN;
  }

  function adicionarMeses(iso, meses) {
    const data = new Date(iso);
    data.setMonth(data.getMonth() + meses);
    return data;
  }

  function limparCanceladasVencidas() {
    const manutencoes = ler('manutencoes');
    const agoraData = new Date();
    const restantes = manutencoes.filter((m) => {
      if (m.status !== 'cancelada' || !m.dataCancelamento) return true;
      return adicionarMeses(m.dataCancelamento, MESES_RETENCAO_CANCELADAS) > agoraData;
    });
    const removidas = manutencoes.length - restantes.length;
    if (removidas > 0) gravar('manutencoes', restantes);
    return removidas;
  }

  function atualizarMeta(parcial) {
    gravar('meta', Object.assign({}, ler('meta'), parcial));
  }

  function iniciar() {
    const meta = ler('meta');
    if (!meta.versao) atualizarMeta({ versao: VERSAO_DADOS });
    limparCanceladasVencidas();
  }

  /* Backup */

  function exportar() {
    const dados = {};
    CHAVES.forEach((chave) => {
      dados[chave] = ler(chave);
    });
    return { sistema: 'SupTec', versao: VERSAO_DADOS, geradoEm: agora(), dados };
  }

  function validarPacote(pacote) {
    if (!pacote || pacote.sistema !== 'SupTec' || typeof pacote.dados !== 'object' || pacote.dados === null) {
      throw new Error('Arquivo inválido: este não é um backup do SupTec.');
    }
    CHAVES.forEach((chave) => {
      const valor = pacote.dados[chave];
      if (valor === undefined) throw new Error(`Backup incompleto: faltam os dados de "${chave}".`);
      const deveSerObjeto = CHAVES_OBJETO.includes(chave);
      const valido = deveSerObjeto
        ? typeof valor === 'object' && valor !== null && !Array.isArray(valor)
        : Array.isArray(valor);
      if (!valido) throw new Error(`Backup inválido: os dados de "${chave}" estão corrompidos.`);
    });
    if (!pacote.dados.usuarios.some((u) => u.perfil === 'chefe' && u.ativo)) {
      throw new Error('Backup inválido: não existe nenhum chefe ativo nos usuários.');
    }
  }

  function importar(pacote) {
    validarPacote(pacote);
    transacao(() => {
      CHAVES.forEach((chave) => gravar(chave, pacote.dados[chave]));
    });
  }

  return {
    ler,
    gravar,
    agora,
    proximoId,
    transacao,
    normalizar,
    lerInteiro,
    lerDecimal,
    adicionarMeses,
    limparCanceladasVencidas,
    atualizarMeta,
    iniciar,
    exportar,
    importar
  };
})();
