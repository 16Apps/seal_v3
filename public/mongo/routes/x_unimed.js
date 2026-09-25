const axios = require('axios');
const qs = require('qs');
const moment = require('moment');

const Gateway = require('../models/gateway');

const ip_server = 'https://connectiot-app.azurewebsites.net';
const REGISTRO_URL = ip_server + '/_bd/registro';

module.exports = (app) => {

  app.post('/x_unimed/leitura', async (req, res) => {

    const payload = Array.isArray(req.body) ? req.body : [req.body];

    if (!payload.length) {
      return res.status(400).json({ ok: false, error: 'Payload vazio.' });
    }

    const processados = [];
    const ignorados = [];

    for (const leitura of payload) {
      const tokemPortal =
        leitura.reading_reader_mac ||
        leitura.reading_reader_ip ||
        leitura.reading_reader_name;

      if (!tokemPortal || !leitura.reading_epc_hex) {
        ignorados.push({ leitura, error: 'MAC/IP ou EPC não informado.' });
        continue;
      }

      const gateway = await Gateway.findOne({ tokem: tokemPortal, ativo: 1 });
      if (!gateway) {
        ignorados.push({ tokem: tokemPortal, error: 'Gateway não encontrado.' });
        continue;
      }

      const registro = {
        tokem: tokemPortal,
        tag: leitura.reading_epc_hex,
        data_leitura: leitura.reading_created_at || '',
        antena: leitura.reading_antenna || '0',
        rssi: leitura.Rssi || '-0',
        bateria: '0',
        temperatura: '0',
        latitude: '',
        longitude: '',
        id_nivel_loc1: '',
        id_nivel_loc2: '',
        id_nivel_loc3: '',
        id_nivel_loc4: '',
        id_nivel_loc1_final: '',
        id_nivel_loc2_final: '',
        id_nivel_loc3_final: '',
        id_nivel_loc4_final: ''
      };

      await axios.post(REGISTRO_URL, registro, { timeout: 5000 });
      processados.push({ gateway: gateway._id, registro });
    }

    if (!processados.length) {
      return res.status(404).json({
        ok: false,
        error: 'Nenhuma leitura processada.',
        ignorados
      });
    }

    return res.status(200).json({
      ok: true,
      processados: processados.length,
      ignorados,
      registros: processados
    });

  });


};
