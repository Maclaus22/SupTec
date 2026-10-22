/*
 * backup.js
 * Cópia de segurança e restauração (spec 4.7). Nesta versão o backup é manual:
 * o chefe baixa o arquivo e o guarda fora do computador da loja.
 * Só o chefe pode baixar ou restaurar.
 */
const Backup = (() => {
  const INTERVALO_LEMBRETE_HORAS = 24;

  /* Regras de negócio */

  function gerar() {
    Auth.exigir('backup.gerenciar');
    const pacote = Banco.exportar();
    Banco.atualizarMeta({ ultimoBackup: pacote.geradoEm });
    return pacote;
  }

  function restaurar(textoJson) {
    Auth.exigir('backup.gerenciar');
    let pacote;
    try {
      pacote = JSON.parse(textoJson);
    } catch (erro) {
      throw new Error('Arquivo inválido: não foi possível ler o conteúdo como backup.');
    }
    Banco.importar(pacote);
  }

  function ultimoBackup() {
    return Banco.ler('meta').ultimoBackup || null;
  }

  function precisaDeBackup() {
    const ultimo = ultimoBackup();
    if (!ultimo) return true;
    return Date.now() - new Date(ultimo).getTime() > INTERVALO_LEMBRETE_HORAS * 3600 * 1000;
  }

  function nomeDoArquivo() {
    const agora = new Date();
    const dois = (n) => String(n).padStart(2, '0');
    return `suptec-backup-${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}.json`;
  }

  /* Tela */

  const $ = (id) => document.getElementById(id);

  function iniciarTela() {
    $('bkp-btn-baixar').addEventListener('click', baixar);
    $('bkp-btn-restaurar').addEventListener('click', restaurarArquivo);
  }

  function abrirTela() {
    UI.limparErro($('bkp-erro'));
    $('bkp-arquivo').value = '';
    mostrarUltimo();
  }

  function mostrarUltimo() {
    const ultimo = ultimoBackup();
    $('bkp-ultimo').textContent = ultimo ? `Último backup: ${UI.formatarDataHora(ultimo)}` : 'Nenhum backup foi feito ainda.';
  }

  function baixar() {
    try {
      const pacote = gerar();
      const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
      const endereco = URL.createObjectURL(blob);
      const link = UI.el('a', { href: endereco, download: nomeDoArquivo() });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(endereco), 1000);
      mostrarUltimo();
      UI.mensagem('Backup gerado. Guarde o arquivo fora do computador da loja.', 'sucesso');
    } catch (falha) {
      UI.mensagem(falha.message, 'erro');
    }
  }

  async function restaurarArquivo() {
    const erro = $('bkp-erro');
    UI.limparErro(erro);
    const arquivo = $('bkp-arquivo').files[0];
    if (!arquivo) {
      UI.mostrarErro(erro, 'Escolha o arquivo de backup (.json) antes de restaurar.');
      return;
    }
    const resposta = await UI.dialogo({
      titulo: 'Restaurar backup',
      texto: 'Todos os dados atuais (produtos, vendas, manutenções e usuários) serão substituídos pelos do arquivo. Esta ação não pode ser desfeita.',
      textoConfirmar: 'Restaurar backup',
      perigo: true
    });
    if (!resposta.confirmado) return;
    try {
      const texto = await arquivo.text();
      restaurar(texto);
      UI.mensagem('Backup restaurado. Você será levado para a tela de login.', 'sucesso');
      setTimeout(() => {
        Auth.sair();
        window.location.replace('index.html');
      }, 1800);
    } catch (falha) {
      UI.mostrarErro(erro, falha.message);
    }
  }

  return {
    gerar,
    restaurar,
    ultimoBackup,
    precisaDeBackup,
    iniciarTela,
    abrirTela
  };
})();
