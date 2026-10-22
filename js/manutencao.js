/*
 * manutencao.js
 * Registro, consulta, alteração e cancelamento de manutenções
 * (spec 4.1, 4.2, 4.3 e 4.12) e a tela de Manutenções.
 */
const Manutencao = (() => {
  const CAMPOS_CLIENTE = ['nomeProprietario', 'telefone', 'email'];
  const CAMPOS_APARELHO = [
    'marcaDispositivo',
    'modeloDispositivo',
    'tempoUsoMeses',
    'manutencoesAnteriores',
    'tipoManutencao',
    'defeito',
    'status'
  ];

  // Quem pode alterar cada campo (RN de perfis): atendente = dados do cliente; técnico = aparelho, defeito e status.
  const CAMPOS_EDITAVEIS = {
    atendente: CAMPOS_CLIENTE,
    tecnico_suporte: CAMPOS_APARELHO,
    chefe: CAMPOS_CLIENTE.concat(CAMPOS_APARELHO)
  };

  const ROTULOS_CAMPOS = {
    nomeProprietario: 'Nome do proprietário',
    telefone: 'Telefone',
    email: 'E-mail',
    marcaDispositivo: 'Marca',
    modeloDispositivo: 'Modelo',
    tempoUsoMeses: 'Tempo de uso',
    manutencoesAnteriores: 'Manutenções anteriores',
    tipoManutencao: 'Tipo de manutenção',
    defeito: 'Defeito',
    status: 'Status'
  };

  // PA01 (em aberto): só se alterna entre "em andamento" e "concluída". Cancelar tem fluxo próprio.
  const STATUS_EDITAVEIS = ['em_andamento', 'concluida'];

  function camposEditaveis(perfil) {
    return CAMPOS_EDITAVEIS[perfil] || [];
  }

  /* Regras de negócio */

  function normalizarDados(dados) {
    const texto = (valor) => String(valor === null || valor === undefined ? '' : valor).trim();
    return {
      nomeProprietario: texto(dados.nomeProprietario),
      telefone: texto(dados.telefone).replace(/\D/g, ''),
      email: texto(dados.email).toLowerCase(),
      marcaDispositivo: texto(dados.marcaDispositivo),
      modeloDispositivo: texto(dados.modeloDispositivo),
      tempoUsoMeses: Banco.lerInteiro(dados.tempoUsoMeses),
      manutencoesAnteriores: texto(dados.manutencoesAnteriores),
      tipoManutencao: texto(dados.tipoManutencao),
      defeito: texto(dados.defeito),
      status: texto(dados.status)
    };
  }

  function validar(registro) {
    if (!registro.nomeProprietario) throw new Error('Informe o nome do proprietário.');

    const temTelefone = registro.telefone !== '';
    const temEmail = registro.email !== '';
    if (!temTelefone && !temEmail) throw new Error('Informe pelo menos um contato: telefone com DDD ou e-mail.');
    if (temTelefone && ![10, 11].includes(registro.telefone.length)) {
      throw new Error('Telefone inválido: informe o DDD e o número (10 ou 11 dígitos).');
    }
    if (temEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registro.email)) {
      throw new Error('E-mail inválido: confira o formato (exemplo: nome@email.com).');
    }

    if (!registro.marcaDispositivo) throw new Error('Informe a marca do dispositivo.');
    if (!registro.modeloDispositivo) throw new Error('Informe o modelo do dispositivo.');
    if (!Number.isInteger(registro.tempoUsoMeses) || registro.tempoUsoMeses < 0) {
      throw new Error('Informe o tempo de uso do dispositivo em meses, com um número inteiro (use 0 se for novo).');
    }
    if (!registro.tipoManutencao) throw new Error('Informe o tipo de manutenção.');
    if (!registro.defeito) throw new Error('Descreva o defeito apresentado.');
  }

  function registrar(dados) {
    const usuario = Auth.exigir('manutencao.registrar');
    const limpos = normalizarDados(dados);
    validar(limpos);
    return Banco.transacao(() => {
      const registro = {
        id: Banco.proximoId('manutencoes'),
        nomeProprietario: limpos.nomeProprietario,
        telefone: limpos.telefone,
        email: limpos.email,
        marcaDispositivo: limpos.marcaDispositivo,
        modeloDispositivo: limpos.modeloDispositivo,
        tempoUsoMeses: limpos.tempoUsoMeses,
        manutencoesAnteriores: limpos.manutencoesAnteriores,
        tipoManutencao: limpos.tipoManutencao,
        defeito: limpos.defeito,
        status: 'em_andamento',
        dataRegistro: Banco.agora(),
        registradoPor: usuario.id,
        tecnicoResponsavel: null,
        dataConclusao: null,
        dataCancelamento: null,
        motivoCancelamento: '',
        ultimaEdicaoPor: null,
        ultimaEdicaoEm: null
      };
      const manutencoes = Banco.ler('manutencoes');
      manutencoes.push(registro);
      Banco.gravar('manutencoes', manutencoes);
      return registro;
    });
  }

  function obter(id) {
    Auth.exigir('manutencao.consultar');
    const registro = Banco.ler('manutencoes').find((m) => m.id === id);
    if (!registro) throw new Error('Manutenção não encontrada. Ela pode ter sido excluída após o cancelamento.');
    return registro;
  }

  function buscar(termo, status) {
    Auth.exigir('manutencao.consultar');
    const busca = Banco.normalizar(termo);
    const digitos = String(termo || '').replace(/\D/g, '');
    const idBuscado = /^#?\d+$/.test(String(termo || '').trim()) ? Number(digitos) : null;

    return Banco.ler('manutencoes')
      .filter((m) => !status || m.status === status)
      .filter((m) => {
        if (!busca) return true;
        if (idBuscado !== null && m.id === idBuscado) return true;
        return (
          Banco.normalizar(m.nomeProprietario).includes(busca) ||
          Banco.normalizar(m.email).includes(busca) ||
          Banco.normalizar(m.marcaDispositivo).includes(busca) ||
          Banco.normalizar(m.modeloDispositivo).includes(busca) ||
          (digitos.length >= 4 && m.telefone.includes(digitos))
        );
      })
      .sort((a, b) => (a.dataRegistro < b.dataRegistro ? 1 : a.dataRegistro > b.dataRegistro ? -1 : b.id - a.id));
  }

  function atualizar(id, dados) {
    const usuario = Auth.usuarioAtual();
    if (!usuario) throw new Error('Sua sessão terminou. Entre novamente para continuar.');
    const permitidos = camposEditaveis(usuario.perfil);
    if (!Auth.pode('manutencao.consultar') || permitidos.length === 0) {
      throw new Error('Seu perfil não tem permissão para alterar manutenções.');
    }

    return Banco.transacao(() => {
      const manutencoes = Banco.ler('manutencoes');
      const registro = manutencoes.find((m) => m.id === id);
      if (!registro) throw new Error('Manutenção não encontrada.');
      if (registro.status === 'cancelada') throw new Error('Um registro cancelado não pode ser editado.');

      const novos = normalizarDados(Object.assign({}, registro, dados));
      if (novos.status === 'cancelada') throw new Error('Para cancelar, use a opção "Cancelar manutenção".');
      if (!STATUS_EDITAVEIS.includes(novos.status)) throw new Error('Status inválido.');

      const alterados = Object.keys(ROTULOS_CAMPOS).filter((campo) => String(novos[campo]) !== String(registro[campo]));
      if (alterados.length === 0) throw new Error('Nenhuma alteração para salvar.');

      const bloqueado = alterados.find((campo) => !permitidos.includes(campo));
      if (bloqueado) {
        throw new Error(`Seu perfil não pode alterar o campo "${ROTULOS_CAMPOS[bloqueado]}".`);
      }

      // As mesmas validações do registro valem na edição.
      validar(novos);

      alterados.forEach((campo) => {
        registro[campo] = novos[campo];
      });
      if (alterados.includes('status')) {
        registro.dataConclusao = registro.status === 'concluida' ? Banco.agora() : null;
      }
      // O primeiro técnico que edita o registro passa a constar como responsável.
      if (usuario.perfil === 'tecnico_suporte' && !registro.tecnicoResponsavel) {
        registro.tecnicoResponsavel = usuario.id;
      }
      registro.ultimaEdicaoPor = usuario.id;
      registro.ultimaEdicaoEm = Banco.agora();
      Banco.gravar('manutencoes', manutencoes);
      return registro;
    });
  }

  function cancelar(id, motivo) {
    const usuario = Auth.exigir('manutencao.cancelar');
    const texto = String(motivo || '').trim();
    return Banco.transacao(() => {
      const manutencoes = Banco.ler('manutencoes');
      const registro = manutencoes.find((m) => m.id === id);
      if (!registro) throw new Error('Manutenção não encontrada.');
      if (registro.status === 'cancelada') throw new Error('Este registro já está cancelado.');
      if (registro.status === 'concluida' && !texto) {
        throw new Error('Informe o motivo do cancelamento de uma manutenção já concluída.');
      }
      registro.status = 'cancelada';
      registro.dataCancelamento = Banco.agora();
      registro.motivoCancelamento = texto;
      registro.ultimaEdicaoPor = usuario.id;
      registro.ultimaEdicaoEm = Banco.agora();
      Banco.gravar('manutencoes', manutencoes);
      return registro;
    });
  }

  /* Tela */

  const $ = (id) => document.getElementById(id);
  let registroAberto = null;
  let editandoId = null;

  function mostrarPainel(nome) {
    ['lista', 'detalhe', 'form'].forEach((painel) => {
      $(`man-painel-${painel}`).hidden = painel !== nome;
    });
  }

  function camposDoFormulario() {
    return Array.from($('man-form').querySelectorAll('[data-campo]'));
  }

  function iniciarTela() {
    $('man-form-busca').addEventListener('submit', (evento) => {
      evento.preventDefault();
      renderizarLista();
    });
    $('man-btn-nova').addEventListener('click', () => abrirFormulario(null));
    $('man-detalhe-voltar').addEventListener('click', () => {
      mostrarPainel('lista');
      renderizarLista();
    });
    $('man-btn-editar').addEventListener('click', () => abrirFormulario(registroAberto.id));
    $('man-btn-cancelar').addEventListener('click', cancelarAberto);
    $('man-form-voltar').addEventListener('click', () => {
      if (editandoId !== null) abrirDetalhe(editandoId);
      else {
        mostrarPainel('lista');
        renderizarLista();
      }
    });
    $('man-form').addEventListener('submit', (evento) => {
      evento.preventDefault();
      salvar();
    });
  }

  function abrirTela() {
    mostrarPainel('lista');
    renderizarLista();
  }

  function renderizarLista() {
    let registros;
    try {
      registros = buscar($('man-busca-termo').value, $('man-busca-status').value);
    } catch (falha) {
      UI.mensagem(falha.message, 'erro');
      return;
    }
    const corpo = $('man-lista');
    UI.limpar(corpo);
    registros.forEach((m) => {
      corpo.append(
        UI.el(
          'tr',
          { classe: m.status === 'cancelada' ? 'linha-cancelada' : '' },
          UI.celula(UI.formatarId(m.id), 'mono'),
          UI.celula(m.nomeProprietario),
          UI.celula(m.marcaDispositivo),
          UI.celula(m.modeloDispositivo),
          UI.celula(UI.seloStatus(m.status)),
          UI.celula(UI.formatarDataHora(m.dataRegistro)),
          UI.celula(
            UI.el('button', {
              type: 'button',
              classe: 'botao botao-pequeno',
              texto: 'Ver',
              'aria-label': `Ver manutenção ${UI.formatarId(m.id)}`,
              onclick: () => abrirDetalhe(m.id)
            })
          )
        )
      );
    });
    $('man-vazio').hidden = registros.length > 0;
    $('man-tabela').hidden = registros.length === 0;
  }

  function abrirDetalhe(id) {
    let m;
    try {
      m = obter(id);
    } catch (falha) {
      UI.mensagem(falha.message, 'erro');
      mostrarPainel('lista');
      renderizarLista();
      return;
    }
    registroAberto = m;
    $('man-detalhe-titulo').textContent = `Manutenção ${UI.formatarId(m.id)}`;

    const linhas = [
      ['Status', UI.seloStatus(m.status)],
      ['Proprietário', m.nomeProprietario],
      ['Telefone', m.telefone ? UI.formatarTelefone(m.telefone) : '—'],
      ['E-mail', m.email || '—'],
      ['Marca', m.marcaDispositivo],
      ['Modelo', m.modeloDispositivo],
      ['Tempo de uso', `${m.tempoUsoMeses} ${m.tempoUsoMeses === 1 ? 'mês' : 'meses'}`],
      ['Manutenções anteriores', m.manutencoesAnteriores || 'Nenhuma informada'],
      ['Tipo de manutenção', m.tipoManutencao],
      ['Defeito apresentado', m.defeito],
      ['Registrada em', `${UI.formatarDataHora(m.dataRegistro)} por ${Auth.nomeUsuario(m.registradoPor)}`],
      ['Técnico responsável', m.tecnicoResponsavel ? Auth.nomeUsuario(m.tecnicoResponsavel) : 'Ainda não atribuído']
    ];
    if (m.dataConclusao) linhas.push(['Concluída em', UI.formatarDataHora(m.dataConclusao)]);
    if (m.status === 'cancelada') {
      linhas.push(['Cancelada em', UI.formatarDataHora(m.dataCancelamento)]);
      linhas.push(['Motivo do cancelamento', m.motivoCancelamento || 'Não informado']);
    }
    if (m.ultimaEdicaoEm) {
      linhas.push(['Última alteração', `${UI.formatarDataHora(m.ultimaEdicaoEm)} por ${Auth.nomeUsuario(m.ultimaEdicaoPor)}`]);
    }

    const lista = $('man-detalhe-dados');
    UI.limpar(lista);
    linhas.forEach(([rotulo, valor]) => {
      lista.append(UI.el('div', { classe: 'dado' }, UI.el('dt', { texto: rotulo }), UI.el('dd', null, valor)));
    });

    const aberto = m.status !== 'cancelada';
    $('man-btn-editar').hidden = !(aberto && (Auth.pode('manutencao.editarCliente') || Auth.pode('manutencao.editarAparelho')));
    $('man-btn-cancelar').hidden = !(aberto && Auth.pode('manutencao.cancelar'));
    mostrarPainel('detalhe');
  }

  function abrirFormulario(id) {
    editandoId = id;
    UI.limparErro($('man-form-erro'));
    $('man-form').reset();
    $('man-form-titulo').textContent = id === null ? 'Nova manutenção' : 'Editar manutenção';
    $('man-campo-status').hidden = id === null;

    const usuario = Auth.usuarioAtual();
    const permitidos = usuario ? camposEditaveis(usuario.perfil) : [];
    const registro = id === null ? null : Banco.ler('manutencoes').find((m) => m.id === id);
    if (id !== null && !registro) {
      UI.mensagem('Manutenção não encontrada.', 'erro');
      return;
    }

    camposDoFormulario().forEach((campo) => {
      const nome = campo.dataset.campo;
      if (registro) {
        const valor = registro[nome];
        campo.value = nome === 'telefone' ? UI.formatarTelefone(valor) : valor === null || valor === undefined ? '' : valor;
        campo.disabled = !permitidos.includes(nome);
      } else {
        campo.disabled = false;
      }
    });
    mostrarPainel('form');
    const primeiro = camposDoFormulario().find((campo) => !campo.disabled);
    if (primeiro) primeiro.focus();
  }

  function salvar() {
    const erro = $('man-form-erro');
    UI.limparErro(erro);
    const dados = {};
    camposDoFormulario().forEach((campo) => {
      if (editandoId === null && campo.dataset.campo === 'status') return;
      dados[campo.dataset.campo] = campo.value;
    });
    try {
      if (editandoId === null) {
        const registro = registrar(dados);
        UI.mensagem(`Manutenção registrada. Identificador: ${UI.formatarId(registro.id)}. Anote para entregar ao cliente.`, 'sucesso');
        abrirDetalhe(registro.id);
      } else {
        const registro = atualizar(editandoId, dados);
        UI.mensagem('Alterações salvas.', 'sucesso');
        abrirDetalhe(registro.id);
      }
    } catch (falha) {
      UI.mostrarErro(erro, falha.message);
    }
  }

  async function cancelarAberto() {
    const m = registroAberto;
    if (!m) return;
    const concluida = m.status === 'concluida';
    const resposta = await UI.dialogo({
      titulo: `Cancelar manutenção ${UI.formatarId(m.id)}`,
      texto: concluida
        ? 'Esta manutenção já foi concluída. O motivo do cancelamento é obrigatório. Os dados ficam guardados por dois meses e depois são excluídos.'
        : 'Os dados ficam guardados por dois meses e depois são excluídos. Depois de cancelada, a manutenção não pode mais ser editada.',
      rotuloCampo: concluida ? 'Motivo do cancelamento' : 'Motivo do cancelamento (opcional)',
      campoObrigatorio: concluida,
      textoConfirmar: 'Cancelar manutenção',
      perigo: true
    });
    if (!resposta.confirmado) return;
    try {
      cancelar(m.id, resposta.valor);
      UI.mensagem(`Manutenção ${UI.formatarId(m.id)} cancelada.`, 'sucesso');
      abrirDetalhe(m.id);
    } catch (falha) {
      UI.mensagem(falha.message, 'erro');
    }
  }

  return {
    camposEditaveis,
    registrar,
    obter,
    buscar,
    atualizar,
    cancelar,
    iniciarTela,
    abrirTela
  };
})();
