const Item = require("../models/item");
const Localizacao = require("../models/localizacao");
const Registro = require("../models/registro");
const Posicao = require("../models/posicao");

const axios = require('axios'); // se for enviar via HTTP

// 🔑 Chave de assinatura fornecida pela Sepioo
const subscriptionKey = 'af737391526e49e8adb171ba54f57b06';

// Função para gerar valor aleatório com 5 dígitos (letras e números em maiúsculo)
function gerarIdDocAleatorio() {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let resultado = '';
  for (let i = 0; i < 5; i++) {
    resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return resultado;
}


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
        durationInMinutes: null,
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
      //console.error('Erro ao acionar flash Sepioo:', error.response?.status, error.response?.data);
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

    const io = req.app.get('io');
    let id_conta = null;
    let itemEncontrado = null;
    let localizacaoEncontrada = null;
    let ultimoRegistro = null;
    let posicaoCriada = null;
    const url = 'https://api.sepioo.com/v2.0/industry_seal_eu/sealbrengenharia/objects/action/flash';


    try {

      id_conta = req.body.TOKEM || null;

      if (req.body.PDI) {
        // Busca o item pelo PDI no campo vinculos_device.id_mac
        itemEncontrado = await Item.findOne({
          'vinculos_device.id_mac': req.body.PDI
        }).lean();

        if (itemEncontrado) {
          console.log('Item encontrado pelo PDI:', itemEncontrado._id, itemEncontrado.tag, itemEncontrado.id_conta);
          id_conta = itemEncontrado.id_conta;

          // Busca a localização pelo token e DESTINATION
          if (req.body.DESTINATION) {
            localizacaoEncontrada = await Localizacao.findOne({
              id_conta: id_conta,
              tag: req.body.DESTINATION
            }).lean();
          };

          // Busca o último registro com a mesma tag do item encontrado
          if (itemEncontrado.tag) {
            ultimoRegistro = await Registro.findOne({
              tag: itemEncontrado.tag,
              id_conta: id_conta
            })
              .sort({ data_registro: -1, createdAt: -1 })
              .lean();

            if (ultimoRegistro) {
              console.log('Último registro encontrado:', ultimoRegistro._id, ultimoRegistro.tag, ultimoRegistro.data_registro);
            }
          }

          // Cria registro na collection posicao quando tudo estiver localizado
          // 1. se STATUS = 'DESINICIO
          // 2. se STATUS = 'DESPRODUCAO'

          if (itemEncontrado && localizacaoEncontrada && ultimoRegistro) {

            if (req.body.STATUS == 'DESINICIO') {

              try {
                const novoPosicao = new Posicao({
                  id_conta: id_conta,
                  ativo: '1',
                  id_doc: gerarIdDocAleatorio(),

                  id_colaborador: ultimoRegistro.id_colaborador || null,
                  id_nivel_loc1: ultimoRegistro.id_nivel_loc1 || null,
                  id_nivel_loc2: ultimoRegistro.id_nivel_loc2 || null,
                  id_nivel_loc3: ultimoRegistro.id_nivel_loc3 || null,
                  id_nivel_loc4: ultimoRegistro.id_nivel_loc4 || null,
                  id_nivel_loc1_destino: localizacaoEncontrada._id || null,
                  id_nivel_loc2_destino: null,
                  id_nivel_loc3_destino: null,
                  id_nivel_loc4_destino: null,

                  itens: [{
                    id_item: ultimoRegistro.id_item || itemEncontrado._id,
                    id_categoria: ultimoRegistro.id_categoria || itemEncontrado.id_categoria,
                    tag: ultimoRegistro.tag || itemEncontrado.tag,
                    ean: null,
                    rssi: ultimoRegistro.rssi || null,
                    quantidade: 1,
                    status: 'concluido',
                    status_data: new Date(),
                    id_gatweway: ultimoRegistro.id_gateway || null,
                    id_colaborador: ultimoRegistro.id_colaborador || null,
                    status_destino: 'pendente',
                    status_destino_data: new Date()
                  }],

                  status: 'parcial',
                  status_data: new Date(),
                  partida_data: ultimoRegistro.data_registro || new Date(),
                  tolerancia: 30,
                  previsao_chegada_data: new Date((ultimoRegistro.data_registro ? new Date(ultimoRegistro.data_registro).getTime() : new Date().getTime()) + (30 * 60 * 1000)),
                  previsao_chegada_tolerancia: 30,
                });

                posicaoCriada = await novoPosicao.save();
                console.log('Registro de posição criado:', posicaoCriada._id);
              } catch (error) {
                console.error('Erro ao criar registro de posição:', error.message);
              }

            } else if (req.body.STATUS == 'DESPRODUCAO') {
              // Busca registro na collection posicao pelos campos de destino baseados nos níveis do ultimoRegistro
              const queryPosicao = {};
              if (ultimoRegistro.id_nivel_loc1) {
                queryPosicao.id_nivel_loc1_destino = ultimoRegistro.id_nivel_loc1;
              }
              if (ultimoRegistro.id_nivel_loc2) {
                queryPosicao.id_nivel_loc2_destino = ultimoRegistro.id_nivel_loc2;
              }
              if (ultimoRegistro.id_nivel_loc3) {
                queryPosicao.id_nivel_loc3_destino = ultimoRegistro.id_nivel_loc3;
              }
              if (ultimoRegistro.id_nivel_loc4) {
                queryPosicao.id_nivel_loc4_destino = ultimoRegistro.id_nivel_loc4;
              }

              const posicaoExistente = await Posicao.findOne(queryPosicao).lean();
              if (posicaoExistente) {

                console.log('Posição existente encontrada:', posicaoExistente._id);

                // Atualiza o registro de posição existente
                try {
                  const dataAtual = new Date();

                  // Atualiza o status e status_data da posição
                  await Posicao.updateOne(
                    { _id: posicaoExistente._id },
                    {
                      $set: {
                        status: 'concluido',
                        status_data: dataAtual
                      }
                    }
                  );

                  // Atualiza os itens: status_destino e status_destino_data
                  const posicaoParaAtualizar = await Posicao.findById(posicaoExistente._id);
                  if (posicaoParaAtualizar && posicaoParaAtualizar.itens && posicaoParaAtualizar.itens.length > 0) {
                    posicaoParaAtualizar.itens.forEach(item => {
                      item.status_destino = 'concluido';
                      item.status_destino_data = dataAtual;
                    });
                    await posicaoParaAtualizar.save();
                  }
                  console.log('Posição atualizada com sucesso:', posicaoExistente._id);

                  // acender led verde
                  const payload = {
                    color: 'GREEN',
                    pattern: 'FLASH_1_SECOND',
                    duration: 5,
                    durationInMinutes: 0,
                    objectIds: [req.body.PDI]
                  };
                  const response = await axios.post(url, payload, {
                    headers: {
                      'Content-Type': 'application/json',
                      'Cache-Control': 'no-cache',
                      'Ocp-Apim-Subscription-Key': subscriptionKey
                    }
                  });

                } catch (error) {
                  console.error('Erro ao atualizar registro de posição:', error.message);
                }

              } else {
                // acender led vermelho
                const payload = {
                  color: 'RED',
                  pattern: 'FLASH_1_SECOND',
                  duration: 5,
                  durationInMinutes: 0,
                  objectIds: [req.body.PDI]
                };
                const response = await axios.post(url, payload, {
                  headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Ocp-Apim-Subscription-Key': subscriptionKey
                  }
                });
              }
            }

            //

            console.log('Posição NAO encontrada');



          }

        };

      };

      const dadosSocket = {
        seppio: req.body,
        origem: 'SepiooButton',
        token: req.body.TOKEM,
        pdi: req.body.PDI,
        item: itemEncontrado ? itemEncontrado.tag : null,
        localizacao: localizacaoEncontrada ? localizacaoEncontrada.tag : null,
        ultimo_registro: ultimoRegistro ? ultimoRegistro._id : null,
        posicao: posicaoCriada ? true : false,
      };
      io.emit(id_conta, dadosSocket);

      res.json({
        seppio: req.body,
        origem: 'Sepioo',
        token: req.body.TOKEM,
        pdi: req.body.PDI,
        item: itemEncontrado || null,
        item_encontrado: !!itemEncontrado,
        localizacao: localizacaoEncontrada || null,
        localizacao_encontrada: !!localizacaoEncontrada,
        ultimo_registro: ultimoRegistro || null,
        ultimo_registro_encontrado: !!ultimoRegistro,
        posicao: posicaoCriada || null,
        posicao_criada: !!posicaoCriada
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