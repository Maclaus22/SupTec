/*
 * app.js
 * Ponto de entrada da página principal: confere o login, aplica as permissões
 * do perfil no menu e troca de tela.
 */
const App = (() => {
  const TELAS = {
    manutencao: Manutencao,
    caixa: Caixa,
    produtos: Produtos,
    estoque: Estoque,
    usuarios: Usuarios,
    backup: Backup
  };

  const $ = (id) => document.getElementById(id);

  function aplicarPermissoes() {
    document.querySelectorAll('[data-perm]').forEach((elemento) => {
      elemento.hidden = !Auth.pode(elemento.dataset.perm);
    });
  }

  function botoesDoMenu() {
    return Array.from(document.querySelectorAll('.menu-item'));
  }

  function abrirTela(nome) {
    const botao = botoesDoMenu().find((b) => b.dataset.tela === nome);
    if (!botao || !Auth.pode(botao.dataset.perm)) return;

    document.querySelectorAll('.tela').forEach((tela) => {
      tela.hidden = tela.id !== `tela-${nome}`;
    });
    botoesDoMenu().forEach((b) => {
      if (b === botao) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    TELAS[nome].abrirTela();
  }

  function lembrarDoBackup() {
    if (Auth.pode('backup.gerenciar') && Backup.precisaDeBackup()) {
      UI.mensagem('O backup do dia ainda não foi feito. Abra a tela Backup e baixe uma cópia.', 'aviso');
    }
  }

  function iniciar() {
    Banco.iniciar();
    Auth.iniciar();
    const usuario = Auth.usuarioAtual();
    if (!usuario) {
      window.location.replace('index.html');
      return;
    }

    try {
      Produtos.semearExemplos(usuario);
    } catch (erro) {
      UI.mensagem('Não foi possível carregar os produtos de exemplo.', 'aviso');
    }

    $('usuario-nome').textContent = usuario.nome;
    $('usuario-perfil').textContent = Auth.rotuloPerfil(usuario.perfil);
    $('btn-sair').addEventListener('click', () => {
      Auth.sair();
      window.location.replace('index.html');
    });

    aplicarPermissoes();
    Object.values(TELAS).forEach((tela) => tela.iniciarTela());
    botoesDoMenu().forEach((botao) => {
      botao.addEventListener('click', () => abrirTela(botao.dataset.tela));
    });

    const primeira = botoesDoMenu().find((botao) => Auth.pode(botao.dataset.perm));
    if (primeira) abrirTela(primeira.dataset.tela);
    lembrarDoBackup();
  }

  return { iniciar };
})();

App.iniciar();
