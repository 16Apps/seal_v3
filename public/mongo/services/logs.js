const Log = require('../models/log');

const TIPOS_VALIDOS = ['usuario', 'sistema', 'rfid', 'hardware', 'integracao'];
const STATUS_VALIDOS = ['sucesso', 'erro', 'alerta'];

/**
 * Registra um log na collection `log`.
 * Uso (rotas Node): const logsService = require('../services/logs');
 *                    await logsService.registrar({ tipo, acao, ... });
 *
 * Campos principais (model log.js):
 * - tipo: 'usuario' | 'sistema' | 'rfid' | 'hardware' | 'integracao' (obrigatório)
 * - acao: string (obrigatório)
 * - status: 'sucesso' | 'erro' | 'alerta' (default: sucesso)
 * - mensagem, id_conta, id_colaborador, id_gateway, id_item, id_posicao, id_registro
 * - tag, envio, retorno, dados, data_registro
 */
async function registrar(dados) {
  const payload = Object.assign({}, dados || {});

  if (!payload.tipo || !payload.acao) {
    throw new Error('logsService.registrar: campos obrigatórios: tipo e acao.');
  }

  if (!TIPOS_VALIDOS.includes(payload.tipo)) {
    throw new Error('logsService.registrar: tipo inválido. Use: ' + TIPOS_VALIDOS.join(', '));
  }

  if (!payload.status) {
    payload.status = 'sucesso';
  } else if (!STATUS_VALIDOS.includes(payload.status)) {
    throw new Error('logsService.registrar: status inválido. Use: ' + STATUS_VALIDOS.join(', '));
  }

  if (!payload.data_registro) {
    payload.data_registro = new Date();
  }

  return Log.create(payload);
}

module.exports = {
  registrar
};
