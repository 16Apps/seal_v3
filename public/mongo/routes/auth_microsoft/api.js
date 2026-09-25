const msalClient = require('./config');
const msal = require('@azure/msal-node');
const axios = require('axios');

const Colaborador = require('../../models/colaborador');

const redirectUri = 'http://localhost:3000';
// const redirectUri = 'https://connectiot-app.azurewebsites.net'


function escaparRegex(texto) {
  return String(texto || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function htmlLoginSeal(conta, colaborador) {
  const cookieConta = JSON.stringify(JSON.stringify(conta));
  const cookieColaborador = JSON.stringify(JSON.stringify(colaborador));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Entrando...</title></head>
<body>
<script>
  (function () {
    var expira = new Date();
    expira.setTime(expira.getTime() + 365 * 24 * 60 * 60 * 1000);
    var sufixo = '; expires=' + expira.toUTCString() + '; path=/';
    document.cookie = '_conta=' + ${cookieConta} + sufixo;
    document.cookie = '_colaborador=' + ${cookieColaborador} + sufixo;
    window.location.replace('/widget');
  })();
</script>
</body>
</html>`;
}

module.exports = (app) => {

  app.get('/auth/microsoft', async (req, res) => {

    try {

      const authCodeUrlParameters = {
        scopes: [
          'openid',
          'profile',
          'email'
        ],

        redirectUri:
          redirectUri + '/auth/microsoft/callback'
      };

      const url = await msalClient.getAuthCodeUrl(
        authCodeUrlParameters
      );

      console.log('URL Microsoft:', url);

      res.redirect(url);

    } catch (erro) {

      console.error('Erro login Microsoft:', erro);

      res.status(500).send('Erro ao iniciar login Microsoft');
    }

  });

  app.get('/auth/microsoft/callback', async (req, res) => {

    try {

      const tokenRequest = {
        code: req.query.code,

        scopes: [
          'openid',
          'profile',
          'email'
        ],

        redirectUri:
          redirectUri + '/auth/microsoft/callback'
      };

      const response =
        await msalClient.acquireTokenByCode(
          tokenRequest
        );

      console.log('LOGIN MICROSOFT OK');

      const email = String(
        response.account?.username ||
        response.account?.idTokenClaims?.preferred_username ||
        response.account?.idTokenClaims?.email ||
        ''
      ).trim().toLowerCase();

      if (!email) {
        return res.redirect('/?erro=microsoft_sem_email');
      }

      const filtroEmail = new RegExp('^' + escaparRegex(email) + '$', 'i');
      const colaborador = await Colaborador.findOne({
        ativo: 1,
        $or: [{ login: filtroEmail }, { email: filtroEmail }]
      }).populate('id_conta');

      if (!colaborador || !colaborador.id_conta) {
        console.warn('Microsoft: colaborador não encontrado para', email);
        return res.redirect('/?erro=usuario_nao_encontrado');
      }

      const oid = String(
        response.account?.idTokenClaims?.oid ||
        response.account?.localAccountId ||
        ''
      ).trim();

      const tid = String(
        response.account?.idTokenClaims?.tid ||
        response.account?.tenantId ||
        ''
      ).trim();

      if (oid) colaborador.token_auth_external = oid;
      if (tid) colaborador.tenant_auth_external = tid;
      if (oid || tid) await colaborador.save();

      const conta = colaborador.id_conta.toObject
        ? colaborador.id_conta.toObject()
        : { ...colaborador.id_conta };
      conta.widget_layout = [];

      const colab = colaborador.toObject();
      colab.id_conta = [];
      delete colab.token_auth_external;
      delete colab.tenant_auth_external;
      delete colab.senha;

      return res.status(200).send(htmlLoginSeal(conta, colab));

    } catch (erro) {

      console.error(
        'Erro callback Microsoft:',
        erro
      );

      return res.redirect('/?erro=microsoft_falhou');
    }

  });

  app.get('/auth/logout', (req, res) => {
    res.clearCookie('_conta', { path: '/' });
    res.clearCookie('_colaborador', { path: '/' });
    const postLogoutRedirectUri = redirectUri + '/';
    const logoutUrl =
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/logout' +
      '?post_logout_redirect_uri=' +
      encodeURIComponent(postLogoutRedirectUri);
    res.redirect(logoutUrl);
  });

  app.get('/auth/microsoft/status/:id', async (req, res) => {
    try {
      const colaborador = await Colaborador.findOne({ _id: req.params.id });
      if (!colaborador?.token_auth_external || !colaborador.tenant_auth_external) {
        return res.status(400).json({ erro: 'Sem oid/tid Microsoft' });
      }
      const msalGraph = new msal.ConfidentialClientApplication({
        auth: {
          clientId: process.env.AZURE_CLIENT_ID || '',
          clientSecret: process.env.AZURE_CLIENT_SECRET || '',
          authority: 'https://login.microsoftonline.com/' + colaborador.tenant_auth_external
        }
      });
      const token = await msalGraph.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default']
      });
      const graph = await axios.get(
        'https://graph.microsoft.com/v1.0/users/' + colaborador.token_auth_external +
          '?$select=accountEnabled,mail',
        { headers: { Authorization: 'Bearer ' + token.accessToken } }
      );
      const ativoMs = graph.data.accountEnabled === true;
      if (!ativoMs) {
        colaborador.ativo = 0;
        await colaborador.save();
      }
      return res.json({
        oid: colaborador.token_auth_external,
        ativo_microsoft: ativoMs,
        ativo_seal: colaborador.ativo
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ erro: e.message });
    }
  });

};