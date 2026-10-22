/*
 * login.js
 * Comportamento da página de login (index.html).
 */
(function () {
  Banco.iniciar();
  Auth.iniciar();

  if (Auth.usuarioAtual()) {
    window.location.replace('app.html');
    return;
  }

  const formulario = document.getElementById('form-login');
  const erro = document.getElementById('erro-login');

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    erro.hidden = true;
    try {
      Auth.entrar(document.getElementById('login').value, document.getElementById('senha').value);
      window.location.replace('app.html');
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
      document.getElementById('senha').select();
    }
  });
})();
