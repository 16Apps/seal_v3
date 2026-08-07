app.service('logsService', ['$rootScope', '$http', 'uteisService', function ($rootScope, $http, uteisService) {

  moment.locale('pt-br');

  const service = this;
  // service.ipAPI = 'http://localhost:3000';
  //service.ipAPI = 'https://sealairtracking-3d3268c3e73f.herokuapp.com'
  service.ipAPI = 'https://connectiot-app.azurewebsites.net'

  // api
  //  -_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_

  this.options = {
    headers: { 'Content-Type': 'application/json' }
  };

  function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /**
   * Registra um log na collection `log`.
   *
   * Campos principais (model log.js):
   * - tipo: 'usuario' | 'sistema' | 'rfid' | 'hardware' | 'integracao' (obrigatório)
   * - acao: string (obrigatório)
   * - status: 'sucesso' | 'erro' | 'alerta' (default: sucesso)
   * - mensagem, id_conta, id_colaborador, id_gateway, id_item, id_posicao, id_registro
   * - tag, envio, retorno, dados, data_registro
   *
   * Uso: logsService.registrar({ tipo: 'sistema', acao: 'salvar_item', mensagem: '...' })
   */
  this.registrar = function (dados) {
    return new Promise((resolve, reject) => {
      try {
        const payload = Object.assign({}, dados || {});

        if (!payload.tipo || !payload.acao) {
          return reject(new Error('logsService.registrar: campos obrigatórios: tipo e acao.'));
        }

        const tiposValidos = ['usuario', 'sistema', 'rfid', 'hardware', 'integracao'];
        if (tiposValidos.indexOf(payload.tipo) === -1) {
          return reject(new Error('logsService.registrar: tipo inválido. Use: ' + tiposValidos.join(', ')));
        }

        if (!payload._id) {
          payload._id = gerarId();
        }

        if (!payload.id_conta) {
          const conta = uteisService.getCookie('_conta');
          if (conta && conta._id) {
            payload.id_conta = conta._id;
          }
        }

        if (!payload.status) {
          payload.status = 'sucesso';
        }

        if (!payload.data_registro) {
          payload.data_registro = new Date();
        }

        uteisService.patchBase('/log', payload)
          .then(resolve)
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  };

}]);
