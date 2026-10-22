/*
 * auth.js
 * Login, sessão e permissões por perfil (spec 4.13 e 4.14).
 * As senhas nunca são guardadas em texto: ficam como hash SHA-256 com sal.
 */
const Auth = (() => {
  const CHAVE_SESSAO = 'suptec:sessao';

  // PA06 (em aberto na especificação): regra de senha assumida como mínimo de 6 caracteres.
  const TAMANHO_MIN_SENHA = 6;

  const PERFIS = {
    atendente: 'Atendente',
    ajudante_geral: 'Ajudante geral',
    tecnico_suporte: 'Técnico de suporte',
    chefe: 'Chefe'
  };

  const PERMISSOES = {
    atendente: [
      'manutencao.consultar',
      'manutencao.registrar',
      'manutencao.cancelar',
      'manutencao.editarCliente',
      'caixa.vender'
    ],
    ajudante_geral: ['produto.consultar', 'produto.cadastrar', 'estoque.consultar', 'estoque.entrada'],
    tecnico_suporte: ['manutencao.consultar', 'manutencao.editarAparelho'],
    chefe: ['*']
  };

  const USUARIOS_INICIAIS = [
    { nome: 'Chefe da loja', login: 'chefe', senha: 'chefe123', perfil: 'chefe' },
    { nome: 'Atendente', login: 'atendente', senha: 'atendente123', perfil: 'atendente' },
    { nome: 'Ajudante geral', login: 'ajudante', senha: 'ajudante123', perfil: 'ajudante_geral' },
    { nome: 'Técnico de suporte', login: 'tecnico', senha: 'tecnico123', perfil: 'tecnico_suporte' }
  ];

  /* SHA-256 em JavaScript puro, para funcionar também fora de contexto seguro (file://). */
  function sha256(texto) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    const bytes = new TextEncoder().encode(texto);
    const tamanho = bytes.length;
    const total = ((tamanho + 9 + 63) >> 6) << 6;
    const dados = new Uint8Array(total);
    dados.set(bytes);
    dados[tamanho] = 0x80;
    const visao = new DataView(dados.buffer);
    visao.setUint32(total - 4, (tamanho * 8) >>> 0);
    visao.setUint32(total - 8, Math.floor((tamanho * 8) / 4294967296));

    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));

    for (let inicio = 0; inicio < total; inicio += 64) {
      for (let i = 0; i < 16; i++) w[i] = visao.getUint32(inicio + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        hh = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) >>> 0;
      }
      h = [h[0] + a, h[1] + b, h[2] + c, h[3] + d, h[4] + e, h[5] + f, h[6] + g, h[7] + hh].map((x) => x >>> 0);
    }
    return h.map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  function gerarSal() {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function calcularHash(senha, sal) {
    return sha256(sal + ':' + senha);
  }

  function validarSenha(senha) {
    if (typeof senha !== 'string' || senha.length < TAMANHO_MIN_SENHA) {
      throw new Error(`A senha deve ter pelo menos ${TAMANHO_MIN_SENHA} caracteres.`);
    }
  }

  function criarCredencial(senha) {
    validarSenha(senha);
    const sal = gerarSal();
    return { sal, senhaHash: calcularHash(senha, sal) };
  }

  /* Dados iniciais: só roda quando ainda não existe nenhum usuário. */
  function iniciar() {
    if (Banco.ler('usuarios').length > 0) return;
    const usuarios = USUARIOS_INICIAIS.map((u) => {
      const credencial = criarCredencial(u.senha);
      return {
        id: Banco.proximoId('usuarios'),
        nome: u.nome,
        login: u.login,
        sal: credencial.sal,
        senhaHash: credencial.senhaHash,
        perfil: u.perfil,
        ativo: true
      };
    });
    Banco.gravar('usuarios', usuarios);
  }

  function usuarioAtual() {
    const id = Number(sessionStorage.getItem(CHAVE_SESSAO));
    if (!id) return null;
    const usuario = Banco.ler('usuarios').find((u) => u.id === id);
    return usuario && usuario.ativo ? usuario : null;
  }

  function entrar(login, senha) {
    const loginNormalizado = String(login || '').trim().toLowerCase();
    if (!loginNormalizado || !senha) throw new Error('Informe o usuário e a senha.');
    const usuario = Banco.ler('usuarios').find((u) => u.login === loginNormalizado);
    if (!usuario || !conferirSenha(usuario, senha)) throw new Error('Usuário ou senha incorretos.');
    if (!usuario.ativo) throw new Error('Este usuário está desativado. Procure o chefe da loja.');
    sessionStorage.setItem(CHAVE_SESSAO, String(usuario.id));
    return usuario;
  }

  function conferirSenha(usuario, senha) {
    return calcularHash(senha, usuario.sal) === usuario.senhaHash;
  }

  function sair() {
    sessionStorage.removeItem(CHAVE_SESSAO);
  }

  function pode(permissao, usuario) {
    const alvo = usuario === undefined ? usuarioAtual() : usuario;
    if (!alvo || !alvo.ativo) return false;
    const lista = PERMISSOES[alvo.perfil] || [];
    return lista.includes('*') || lista.includes(permissao);
  }

  // Usado dentro das regras de negócio: bloqueia a ação mesmo que a tela tenha sido burlada.
  function exigir(permissao) {
    const usuario = usuarioAtual();
    if (!usuario) throw new Error('Sua sessão terminou. Entre novamente para continuar.');
    if (!pode(permissao, usuario)) throw new Error('Seu perfil não tem permissão para realizar esta ação.');
    return usuario;
  }

  function nomeUsuario(id) {
    const usuario = Banco.ler('usuarios').find((u) => u.id === id);
    return usuario ? usuario.nome : '—';
  }

  function rotuloPerfil(perfil) {
    return PERFIS[perfil] || perfil;
  }

  return {
    PERFIS,
    TAMANHO_MIN_SENHA,
    sha256,
    criarCredencial,
    validarSenha,
    iniciar,
    usuarioAtual,
    entrar,
    sair,
    pode,
    exigir,
    nomeUsuario,
    rotuloPerfil
  };
})();
