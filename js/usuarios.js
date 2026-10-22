/*
 * usuarios.js
 * Gestão de usuários e perfis (spec 4.13): somente o chefe cria, altera,
 * desativa e reativa usuários. A tela de Usuários também fica aqui.
 */
const Usuarios = (() => {
  /* Regras de negócio */

  function validarDados(dados, idAtual, senhaObrigatoria) {
    const nome = String(dados.nome || '').trim();
    const login = String(dados.login || '').trim().toLowerCase();
    const perfil = String(dados.perfil || '');
    const senha = String(dados.senha || '');

    if (!nome) throw new Error('Informe o nome do usuário.');
    if (!/^[a-z0-9._-]{3,}$/.test(login)) {
      throw new Error('O login deve ter pelo menos 3 caracteres, usando letras, números, ponto, hífen ou sublinhado.');
    }
    if (!Auth.PERFIS[perfil]) throw new Error('Escolha um perfil para o usuário.');
    if (Banco.ler('usuarios').some((u) => u.login === login && u.id !== idAtual)) {
      throw new Error('Já existe um usuário com este login.');
    }
    if (senhaObrigatoria || senha) Auth.validarSenha(senha);
    return { nome, login, perfil, senha };
  }

  function contarChefesAtivos(usuarios) {
    return usuarios.filter((u) => u.perfil === 'chefe' && u.ativo).length;
  }

  function listar() {
    Auth.exigir('usuario.gerenciar');
    return Banco.ler('usuarios')
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  function criar(dados) {
    Auth.exigir('usuario.gerenciar');
    const limpos = validarDados(dados, null, true);
    return Banco.transacao(() => {
      const credencial = Auth.criarCredencial(limpos.senha);
      const usuarios = Banco.ler('usuarios');
      const usuario = {
        id: Banco.proximoId('usuarios'),
        nome: limpos.nome,
        login: limpos.login,
        sal: credencial.sal,
        senhaHash: credencial.senhaHash,
        perfil: limpos.perfil,
        ativo: true
      };
      usuarios.push(usuario);
      Banco.gravar('usuarios', usuarios);
      return usuario;
    });
  }

  function atualizar(id, dados) {
    Auth.exigir('usuario.gerenciar');
    return Banco.transacao(() => {
      const usuarios = Banco.ler('usuarios');
      const usuario = usuarios.find((u) => u.id === id);
      if (!usuario) throw new Error('Usuário não encontrado.');
      const limpos = validarDados(dados, id, false);

      const perdeChefe = usuario.perfil === 'chefe' && limpos.perfil !== 'chefe' && usuario.ativo;
      if (perdeChefe && contarChefesAtivos(usuarios) <= 1) {
        throw new Error('Deve existir pelo menos um chefe ativo. Crie outro chefe antes de mudar este perfil.');
      }

      usuario.nome = limpos.nome;
      usuario.login = limpos.login;
      usuario.perfil = limpos.perfil;
      if (limpos.senha) {
        const credencial = Auth.criarCredencial(limpos.senha);
        usuario.sal = credencial.sal;
        usuario.senhaHash = credencial.senhaHash;
      }
      Banco.gravar('usuarios', usuarios);
      return usuario;
    });
  }

  function definirAtivo(id, ativo) {
    const logado = Auth.exigir('usuario.gerenciar');
    return Banco.transacao(() => {
      const usuarios = Banco.ler('usuarios');
      const usuario = usuarios.find((u) => u.id === id);
      if (!usuario) throw new Error('Usuário não encontrado.');
      if (!ativo && usuario.id === logado.id) throw new Error('Você não pode desativar o seu próprio usuário.');
      if (usuario.ativo === ativo) throw new Error(ativo ? 'Este usuário já está ativo.' : 'Este usuário já está desativado.');
      usuario.ativo = ativo;
      Banco.gravar('usuarios', usuarios);
      return usuario;
    });
  }

  /* Tela */

  const $ = (id) => document.getElementById(id);
  let editandoId = null;

  function mostrarPainel(nome) {
    $('usr-painel-lista').hidden = nome !== 'lista';
    $('usr-painel-form').hidden = nome !== 'form';
  }

  function iniciarTela() {
    $('usr-btn-novo').addEventListener('click', () => abrirFormulario(null));
    $('usr-form-voltar').addEventListener('click', () => {
      mostrarPainel('lista');
      renderizarLista();
    });
    $('usr-form').addEventListener('submit', (evento) => {
      evento.preventDefault();
      salvar();
    });
    const perfis = $('usr-perfil');
    Object.entries(Auth.PERFIS).forEach(([valor, rotulo]) => {
      perfis.append(UI.el('option', { value: valor, texto: rotulo }));
    });
  }

  function abrirTela() {
    mostrarPainel('lista');
    renderizarLista();
  }

  function renderizarLista() {
    let usuarios;
    try {
      usuarios = listar();
    } catch (falha) {
      UI.mensagem(falha.message, 'erro');
      return;
    }
    const corpo = $('usr-lista');
    UI.limpar(corpo);
    usuarios.forEach((u) => {
      corpo.append(
        UI.el(
          'tr',
          { classe: u.ativo ? '' : 'linha-cancelada' },
          UI.celula(u.nome),
          UI.celula(u.login, 'mono'),
          UI.celula(Auth.rotuloPerfil(u.perfil)),
          UI.celula(UI.selo(u.ativo ? 'Ativo' : 'Desativado', u.ativo ? 'concluida' : 'cancelada')),
          UI.celula(
            UI.el(
              'div',
              { classe: 'acoes-linha' },
              UI.el('button', { type: 'button', classe: 'botao botao-pequeno', texto: 'Editar', onclick: () => abrirFormulario(u.id) }),
              UI.el('button', {
                type: 'button',
                classe: 'botao botao-pequeno',
                texto: u.ativo ? 'Desativar' : 'Reativar',
                onclick: () => alternarAtivo(u)
              })
            )
          )
        )
      );
    });
  }

  function abrirFormulario(id) {
    editandoId = id;
    UI.limparErro($('usr-form-erro'));
    $('usr-form').reset();
    $('usr-form-titulo').textContent = id === null ? 'Novo usuário' : 'Editar usuário';
    $('usr-senha-ajuda').hidden = id === null;
    if (id !== null) {
      const usuario = Banco.ler('usuarios').find((u) => u.id === id);
      if (!usuario) {
        UI.mensagem('Usuário não encontrado.', 'erro');
        return;
      }
      $('usr-nome').value = usuario.nome;
      $('usr-login').value = usuario.login;
      $('usr-perfil').value = usuario.perfil;
    }
    mostrarPainel('form');
    $('usr-nome').focus();
  }

  function salvar() {
    const erro = $('usr-form-erro');
    UI.limparErro(erro);
    const dados = {
      nome: $('usr-nome').value,
      login: $('usr-login').value,
      perfil: $('usr-perfil').value,
      senha: $('usr-senha').value
    };
    try {
      if (editandoId === null) {
        const usuario = criar(dados);
        UI.mensagem(`Usuário "${usuario.nome}" criado.`, 'sucesso');
      } else {
        const usuario = atualizar(editandoId, dados);
        UI.mensagem(`Usuário "${usuario.nome}" atualizado.`, 'sucesso');
      }
      mostrarPainel('lista');
      renderizarLista();
    } catch (falha) {
      UI.mostrarErro(erro, falha.message);
    }
  }

  function alternarAtivo(usuario) {
    try {
      definirAtivo(usuario.id, !usuario.ativo);
      UI.mensagem(`Usuário "${usuario.nome}" ${usuario.ativo ? 'desativado' : 'reativado'}.`, 'sucesso');
      renderizarLista();
    } catch (falha) {
      UI.mensagem(falha.message, 'erro');
    }
  }

  return {
    listar,
    criar,
    atualizar,
    definirAtivo,
    iniciarTela,
    abrirTela
  };
})();
