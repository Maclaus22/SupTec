# SupTec - Gestão de estoque e manutenção

Protótipo em HTML5, CSS e JavaScript puro, baseado na *Especificação SupTec Consolidada*.
Os dados ficam no `localStorage` do navegador, então não precisa de servidor nem de instalação.

## Como usar

1. Abra o arquivo `index.html` no navegador (Chrome, Edge ou Firefox).
2. Entre com um dos usuários de teste:

| Perfil         | Usuário     | Senha          |
|----------------|-------------|----------------|
| Chefe          | `chefe`     | `chefe123`     |
| Atendente      | `atendente` | `atendente123` |
| Ajudante geral | `ajudante`  | `ajudante123`  |
| Técnico        | `tecnico`   | `tecnico123`   |

Na primeira abertura o sistema cria esses usuários e 6 produtos de exemplo (um deles já com estoque baixo).
Os códigos de barras de exemplo estão na tela Produtos.

## Estrutura

```
suptec/
├── index.html          login
├── app.html            todas as telas do sistema
├── css/style.css       todo o visual
└── js/
    ├── storage.js      localStorage, identificadores, transação (tudo ou nada), backup
    ├── auth.js         login, senha com hash e permissões por perfil
    ├── ui.js           avisos, diálogo e formatação
    ├── manutencao.js   4.1, 4.2, 4.3 e 4.12
    ├── produtos.js     4.4, 4.8 e 4.9
    ├── estoque.js      4.6, 4.10 e 4.11
    ├── caixa.js        4.5
    ├── usuarios.js     4.13
    ├── backup.js       4.7
    ├── login.js        comportamento do login
    └── app.js          navegação e permissões da tela principal
```

HTML, CSS e JS ficam sempre em arquivos separados: nenhum estilo e nenhum evento dentro do HTML.

## Onde cada regra está

- **Permissões (4.14):** `auth.js`. As regras de negócio também checam o perfil, não só o menu.
- **Estoque nunca negativo e toda mudança gera movimentação:** `Estoque.registrarMovimento`.
- **Venda grava o valor da hora:** `caixa.js` (`itensVenda.valorUnitario`).
- **Operação por inteiro ou nada (RN07):** `Banco.transacao`, usada em venda, estoque, cadastro e restauração.
- **Cancelada é excluída após 2 meses:** `Banco.limparCanceladasVencidas`, executada ao abrir o sistema.
- **Senhas:** guardadas como SHA-256 com sal, nunca em texto.

## Pontos em aberto da especificação (decisões assumidas)

A especificação pede para não assumir resposta sozinho. Para o protótipo funcionar, estas foram as escolhas.
Troque por aquilo que o professor ou o cliente definir.

- **PA01 (status da manutenção):** só se alterna entre "em andamento" e "concluída". Cancelar tem fluxo próprio.
- **PA02 (estoque inicial):** a quantidade informada no cadastro vira uma entrada de reabastecimento.
- **PA06 (senha):** mínimo de 6 caracteres, sem bloqueio por tentativas.
- **PA03, PA04, PA05, PA07, PA08, PA09:** não implementados (venda manual, devolução, produto sem código de barras, etc.).

## Limitações desta versão

- **Backup:** é manual (botão na tela Backup). O backup automático diário com cópia fora do computador e os 30 backups mantidos exigiriam um servidor.
- **Segurança:** como tudo roda no navegador, quem tiver acesso ao computador e souber abrir as ferramentas do navegador consegue ver os dados. Para uso real seria preciso um backend com banco de dados.
- **Vários computadores:** cada navegador tem seus próprios dados.
- **Leitor de código de barras:** funciona como teclado. Basta o campo "Código de barras" do caixa estar em foco.
