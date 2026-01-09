const axios = require('axios'); // se for enviar via HTTP

// 🔑 Chave de assinatura fornecida pela Sepioo
const subscriptionKey = 'af737391526e49e8adb171ba54f57b06';

module.exports = (app, dbConnection) => {

  // Rota chamada pelo seu app
  app.get('/sepioo', async (req, res) => {
    try {
      const { device } = req.query;

      if (!device) {
        return res.status(400).json({ ok: false, msg: 'Parâmetro device é obrigatório' });
      }

      // 🔗 Monta a URL completa conforme a documentação
      const url = `https://api.sepioo.com/v2.0/industry_seal_eu/sealbrengenharia/devices/${device}/accesstoken`;

      // 🚀 Requisição GET externa
      const response = await axios.get(url, {
        headers: {
          'Cache-Control': 'no-cache',
          'Ocp-Apim-Subscription-Key': subscriptionKey
        }
      });

      // ✅ Retorna o que veio da Sepioo
      res.json({
        ok: true,
        origem: 'sepioo',
        data: response.data
      });

    } catch (error) {
      console.error('Erro ao consultar Sepioo:', error.message);
      res.status(error.response?.status || 500).json({
        ok: false,
        msg: 'Erro ao consultar Sepioo',
        erro: error.response?.data || error.message
      });
    }
  });


  app.post('/sepioo/flash', async (req, res) => {
    try {
      const {
        color,
        pattern,
        duration,
        durationInMinutes,
        objectIds
      } = req.body;

      // 🔹 validação
      if (!objectIds || objectIds.length === 0) {
        return res.status(400).json({ ok: false, msg: 'objectIds é obrigatório' });
      }

      // 🔹 URL correta para OBJECTS
      const url = 'https://api.sepioo.com/v2.0/industry_seal_eu/sealbrengenharia/objects/action/flash';

      // 🔹 payload padrão da Sepioo

      // if(durationInMinutes==0){
      //   durationInMinutes = null;
      // };

      const payload = {
        color: color || 'GREEN',
        pattern: pattern || 'FLASH_1_SECOND',
        duration: duration ?? 5,
        durationInMinutes:  null,
        objectIds
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Ocp-Apim-Subscription-Key': subscriptionKey
        }
      });

      res.json({
        ok: true,
        origem: 'Sepioo',
        data: response.data
      });

    } catch (error) {
      console.error('Erro ao acionar flash Sepioo:', error.response?.status, error.response?.data);
      res.status(error.response?.status || 500).json({
        ok: false,
        msg: 'Erro ao acionar flash na API Sepioo',
        erro: error.response?.data || error.message
      });
    }
  });

  app.post('/sepioo/stopflash', async (req, res) => {
    try {
      const { objectIds
      } = req.body;

      if (!objectIds || objectIds.length === 0) {
        return res.status(400).json({ ok: false, msg: 'objectIds é obrigatório' });
      }

      // Endpoint específico para PARAR o flash
      const url = 'https://api.sepioo.com/v2.0/industry_seal_eu/sealbrengenharia/objects/action/stopflash';

      const payload = {
        objectIds
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Ocp-Apim-Subscription-Key': subscriptionKey
        }
      });

      res.json({
        ok: true,
        origem: 'Sepioo',
        acao: 'stopflash',
        data: response.data
      });

    } catch (error) {
      console.error('Erro ao acionar stopflash Sepioo:', error.response?.status, error.response?.data);
      res.status(error.response?.status || 500).json({
        ok: false,
        msg: 'Erro ao parar flash na API Sepioo',
        erro: error.response?.data || error.message
      });
    }
  });

  app.post('/sepioo/object', async (req, res) => {
    try {
      const { objectId, deviceIds, customFields } = req.body;

      if (!objectId) {
        return res.status(400).json({ ok: false, msg: 'objectId é obrigatório' });
      }

      if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({ ok: false, msg: 'deviceIds é obrigatório como array' });
      }

      const url =
        'https://api.sepioo.com/v2.0/industry_seal_eu/sealbrengenharia/objects/';

      const payload = {
        objectId,
        deviceIds,
        customFields: customFields || {}
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': subscriptionKey
        }
      });

      res.json({
        ok: true,
        objeto: objectId,
        data: response.data
      });

    } catch (error) {
      console.error('Erro ao registrar objeto Sepioo:', error.response?.status, error.response?.data);
      res.status(error.response?.status || 500).json({
        ok: false,
        msg: 'Erro ao registrar objeto na Sepioo',
        erro: error.response?.data || error.message
      });
    }
  });

app.get('/sepioo/object/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Substitua pelos valores reais da sua conta
    const account = "industry_seal_eu";
    const location = "sealbrengenharia";

    const url = `https://api.sepioo.com/v2.0/${account}/${location}/objects/${id}`;

    console.log('🔗 URL Sepioo:', url);

    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': subscriptionKey
      }
    });

    res.json({
      ok: true,
      id_consultado: id,
      objectId: response.data.objectId,
      customFields: response.data.customFields,
      devices: response.data.devices,
      lastChange: response.data.lastChange,
      raw: response.data
    });

  } catch (error) {
    console.error(
      '❌ Erro ao consultar objeto Sepioo:',
      error.response?.status || 'SEM STATUS',
      error.response?.data || error.message
    );

    res.status(error.response?.status || 500).json({
      ok: false,
      msg: 'Erro ao consultar objeto na Sepioo',
      erro: error.response?.data || error.message
    });
  }
});













  app.post('/sepioo/page', async (req, res) => {

    try {
      const { page, durationInMinutes, deviceIds } = req.body;

      if (!deviceIds || deviceIds.length === 0) {
        return res.status(400).json({ ok: false, msg: 'deviceIds é obrigatório' });
      }

      const url = 'https://api.sepioo.com/v2.0/industry_seal_eu/sealbrenengenharia/devices/action/switchpage';

      const payload = {
        deviceIds
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Ocp-Apim-Subscription-Key': subscriptionKey
        }
      });

      res.json({
        ok: true,
        origem: 'Sepioo',
        data: response.data
      });

    } catch (error) {
      console.error('Erro ao acionar flash Sepioo:', error.response?.status, error.response?.data);
      res.status(error.response?.status || 500).json({
        ok: false,
        msg: 'Erro ao acionar flash na API Sepioo',
        erro: error.response?.data || error.message
      });
    }
  });

  app.post('/sepioo/button', async (req, res) => {

    console.log(req.body)
    try {

      res.json({
        seppio: req.body,
        origem: 'Sepioo'
      });

    } catch (error) {
      console.error('Erro ao receber press buttom', error.response?.status, error.response?.data);
      res.status(error.response?.status || 500).json({
        ok: false,
        msg: 'Erro ao receber press buttom',
        erro: error.response?.data || error.message
      });
    }
  });



}