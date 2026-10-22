/*
 * ui.js
 * Ajudantes de interface compartilhados: criação de elementos, avisos,
 * diálogo de confirmação e formatação. Nunca usa innerHTML com dados do usuário.
 */
const UI = (() => {
  const ROTULOS_STATUS = {
    em_andamento: 'Em andamento',
    concluida: 'Concluída',
    cancelada: 'Cancelada'
  };

  function el(tag, props, ...filhos) {
    const elemento = document.createElement(tag);
    Object.entries(props || {}).forEach(([chave, valor]) => {
      if (valor === null || valor === undefined || valor === false) return;
      if (chave === 'classe') elemento.className = valor;
      else if (chave === 'texto') elemento.textContent = valor;
      else if (chave.startsWith('on')) elemento.addEventListener(chave.slice(2), valor);
      else if (valor === true) elemento.setAttribute(chave, '');
      else elemento.setAttribute(chave, valor);
    });
    filhos.flat().forEach((filho) => {
      if (filho === null || filho === undefined || filho === false) return;
      elemento.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
    });
    return elemento;
  }

  function limpar(elemento) {
    while (elemento.firstChild) elemento.removeChild(elemento.firstChild);
  }

  function mensagem(texto, tipo) {
    const area = document.getElementById('mensagens');
    if (!area) return;
    const nivel = tipo || 'info';
    const aviso = el(
      'div',
      { classe: `aviso aviso-${nivel}` },
      el('span', { texto }),
      el('button', {
        type: 'button',
        classe: 'aviso-fechar',
        'aria-label': 'Fechar aviso',
        texto: '×',
        onclick: () => aviso.remove()
      })
    );
    area.append(aviso);
    setTimeout(() => aviso.remove(), nivel === 'erro' ? 9000 : 5000);
  }

  function mostrarErro(elemento, texto) {
    elemento.textContent = texto;
    elemento.hidden = false;
  }

  function limparErro(elemento) {
    elemento.textContent = '';
    elemento.hidden = true;
  }

  function selo(texto, tipo) {
    return el('span', { classe: `selo selo-${tipo}`, texto });
  }

  function seloStatus(status) {
    return selo(ROTULOS_STATUS[status] || status, status);
  }

  function formatarMoeda(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarDataHora(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo'
    });
  }

  function formatarId(id) {
    return '#' + String(id).padStart(4, '0');
  }

  function formatarTelefone(digitos) {
    const d = String(digitos || '').replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return digitos || '—';
  }

  function celula(conteudo, classe) {
    return el('td', { classe }, conteudo);
  }

  /*
   * Diálogo de confirmação, com campo de texto opcional.
   * Resolve com { confirmado: boolean, valor: string }.
   */
  function dialogo(opcoes) {
    const config = Object.assign(
      { titulo: '', texto: '', rotuloCampo: null, campoObrigatorio: false, textoConfirmar: 'Confirmar', perigo: false },
      opcoes
    );
    return new Promise((resolve) => {
      const caixa = document.getElementById('dialogo');
      const campoEnvoltorio = document.getElementById('dialogo-campo-wrapper');
      const campo = document.getElementById('dialogo-campo');
      const erro = document.getElementById('dialogo-erro');
      const confirmar = document.getElementById('dialogo-ok');
      const voltar = document.getElementById('dialogo-cancelar');

      document.getElementById('dialogo-titulo').textContent = config.titulo;
      document.getElementById('dialogo-texto').textContent = config.texto;
      document.getElementById('dialogo-rotulo').textContent = config.rotuloCampo || '';
      campoEnvoltorio.hidden = !config.rotuloCampo;
      campo.value = '';
      limparErro(erro);
      confirmar.textContent = config.textoConfirmar;
      confirmar.classList.toggle('botao-perigo', config.perigo);
      confirmar.classList.toggle('botao-primario', !config.perigo);

      const controle = new AbortController();
      const concluir = (resultado) => {
        controle.abort();
        if (caixa.open) caixa.close();
        resolve(resultado);
      };

      confirmar.addEventListener(
        'click',
        () => {
          const valor = campo.value.trim();
          if (config.rotuloCampo && config.campoObrigatorio && !valor) {
            mostrarErro(erro, 'Preencha este campo para continuar.');
            campo.focus();
            return;
          }
          concluir({ confirmado: true, valor });
        },
        { signal: controle.signal }
      );
      voltar.addEventListener('click', () => concluir({ confirmado: false, valor: '' }), { signal: controle.signal });
      caixa.addEventListener(
        'cancel',
        (evento) => {
          evento.preventDefault();
          concluir({ confirmado: false, valor: '' });
        },
        { signal: controle.signal }
      );

      caixa.showModal();
      (config.rotuloCampo ? campo : voltar).focus();
    });
  }

  return {
    ROTULOS_STATUS,
    el,
    limpar,
    mensagem,
    mostrarErro,
    limparErro,
    selo,
    seloStatus,
    formatarMoeda,
    formatarDataHora,
    formatarId,
    formatarTelefone,
    celula,
    dialogo
  };
})();
