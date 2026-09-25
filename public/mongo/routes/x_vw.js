const Item = require("../models/item");
const Localizacao = require("../models/localizacao");
const Registro = require("../models/registro");
const Posicao = require("../models/posicao");
const logsService = require("../services/logs");
const Conta = require("../models/conta");
const axios = require('axios'); // se for enviar via HTTP

// 🔑 Chave de assinatura fornecida pela Sepioo
const subscriptionKey = 'af737391526e49e8adb171ba54f57b06';

// const url_sepioo_seal = 'http://localhost:3000'
// const url_sepioo_seal  = 'https://connectiot-app.azurewebsites.net'
const url_sepioo_seal = 'https://sealv3-production.up.railway.app'

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

// BOTAO DE CLICK NA PDI
// ****************************************************************

app.post('/x_vw/sepioo/pdi', async (req, res) => {

  // 1 - Verificar se o PDI existe no banco de dados
  // 2 - Atualiza display do PDI
  // 3 - Salva no connect 

})

app.post('/x_vw/sepioo/button', async (req, res) => {

  let id_conta = "b53740dd-8470";

  const conta = await Conta.findById(id_conta);
  let itemEncontrado = null;
  let id_pdi = null;
  let _objectsPDI = [];
  const LIMITE_MINUTOS = conta.interval_pdi || 5;

  console.log(LIMITE_MINUTOS)

  const niveisIguais = (a, b) => [1, 2, 3, 4].every((n) =>
    String((a && a[`id_nivel_loc${n}`]) || '') === String((b && b[`id_nivel_loc${n}`]) || '')
  );

  // SEQUENCE vem como "925-953": usa o 1º número para ordenar
  const sequenceNumeroFromSeq = (seq) => {
    const m = String(seq || '').match(/(\d+)/);
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
  };

  const minutosDesde = (d) => d
    ? Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    : null;

  try {
    console.log('req.body', req.body);
    id_pdi = req.body.PDI || req.body.deviceId || req.body.objectId;

    if (!id_pdi) {
      return res.status(400).json({ ok: false, error: 'Informe PDI / deviceId / objectId.' });
    }

    // 1) Item pelo serial do PDI
    itemEncontrado = await Item.findOne({ 'vinculos_device.id_mac': id_pdi })
      .populate('id_categoria')
      .lean();

    if (!itemEncontrado) {
      await logsService.registrar({
        tipo: 'integracao',
        acao: 'start_check',
        status: 'alerta',
        mensagem: 'Click PDI recebido, SKU não encontrado',
        id_conta,
        dados: { id_pdi }
      });
      return res.json({
        ok: false,
        error: 'PDI não encontrado',
        data: [{ id_mac: id_pdi, sepioo_error: '' }]
      });
    }

    id_conta = itemEncontrado.id_conta || id_conta;

    await logsService.registrar({
      tipo: 'integracao',
      acao: 'start_check',
      status: 'sucesso',
      mensagem: 'Click PDI recebido, SKU encontrado',
      id_conta,
      id_item: itemEncontrado._id,
      dados: { id_pdi }
    });

    // 2) Itens no mesmo local + mesma categoria do item clicado
    const idCategoriaClicada = String(
      (itemEncontrado.id_categoria && itemEncontrado.id_categoria._id)
        || itemEncontrado.id_categoria
        || ''
    );

    const filtroLoc = {
      id_conta,
      id_categoria: idCategoriaClicada || null,
      id_nivel_loc1: itemEncontrado.id_nivel_loc1 || null,
      id_nivel_loc2: itemEncontrado.id_nivel_loc2 || null,
      id_nivel_loc3: itemEncontrado.id_nivel_loc3 || null,
      id_nivel_loc4: itemEncontrado.id_nivel_loc4 || null,
      'vinculos_device.0': { $exists: true }
    };

    const itensNoLocal = await Item.find(filtroLoc)
      .populate('id_categoria')
      .lean();

    // 3) Modo A: só entram na sequência itens com loc atual == loc esperada da categoria
    const itensSequencia = (itensNoLocal || []).filter((it) =>
      niveisIguais(it, it.id_categoria)
    );

    const itemClicadoOk = niveisIguais(itemEncontrado, itemEncontrado.id_categoria);

    const acionaLed = async (objectId, cor) => {
      const payloadLed = {
        color: cor,
        pattern: 'FLASH_1_SECOND',
        duration: 5,
        durationInMinutes: 0,
        objectIds: [objectId]
      };
      const responseLed = await axios.post(url_sepioo_seal + '/sepioo/flash', payloadLed, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Ocp-Apim-Subscription-Key': subscriptionKey
        }
      });
      await logsService.registrar({
        tipo: 'sistema',
        acao: 'acionaLed',
        status: 'sucesso',
        mensagem: 'LED acionado com sucesso',
        id_conta,
        id_item: itemEncontrado._id,
        dados: {
          id_pdi: objectId,
          cor,
          eventId: responseLed.data?.data?.eventId
        }
      });
      return responseLed.data;
    };

    const alteraDisplay = async (pdiObj, textStatus) => {
      const cf = pdiObj.customFields || {};
      const payloadDisplay = {
        objectId: pdiObj.objectId,
        deviceIds: [pdiObj.objectId],
        customFields: {
          SEQUENCE: cf.SEQUENCE,
          PARTNUMBER: cf.PARTNUMBER,
          INSERTION: cf.INSERTION,
          STATUS: textStatus
        }
      };
      const responseDisplay = await axios.post(url_sepioo_seal + '/sepioo/object', payloadDisplay, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Ocp-Apim-Subscription-Key': subscriptionKey
        }
      });
      await logsService.registrar({
        tipo: 'sistema',
        acao: 'alteraDisplay',
        status: 'sucesso',
        mensagem: 'Display alterado com sucesso',
        id_conta,
        id_item: pdiObj.id_item || itemEncontrado._id,
        dados: {
          id_pdi: pdiObj.objectId,
          textStatus,
          eventId: responseDisplay.data?.data?.eventId,
          status: responseDisplay.data?.data?.status
        }
      });
      return responseDisplay.data;
    };

    // Item clicado fora da loc esperada da categoria → bloqueia
    console.log('itemClicadoOk', itemClicadoOk);
    if (!itemClicadoOk) {
      // Ainda consulta Sepioo do PDI clicado para alterar display
      let responseObjectDisplay = null;
      try {
        responseObjectDisplay = await axios.get(url_sepioo_seal + '/sepioo/object/' + id_pdi, {
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': subscriptionKey
          }
        });
      } catch (e) { /* display opcional */ }

      const pdiClicado = {
        objectId: id_pdi,
        customFields: responseObjectDisplay?.data?.customFields || {},
        id_item: itemEncontrado._id,
        localizacao_correta: false,
        checkSequenciamento: 'loc incorreta'
      };
      if (responseObjectDisplay?.data) {
        await alteraDisplay(pdiClicado, 'LOC_INCORRETO');
        try { await acionaLed(id_pdi, 'RED'); } catch (e) { /* ignore */ }
        setTimeout(async () => {
          await alteraDisplay(pdiClicado, 'AGUARDANDO');
        }, 10000);
      }

      return res.json({
        ok: false,
        error: 'LOC_INCORRETO',
        data: itemEncontrado.vinculos_device,
        objectsPDI: [pdiClicado],
        itensNoLocal: (itensNoLocal || []).map((i) => i._id),
        itensSequencia: itensSequencia.map((i) => i._id)
      });
    }

    console.log('vinculo', itensSequencia);

    // 4) Monta todos os PDIs dos itens elegíveis (loc correta)
    for (const item of itensSequencia) {
      for (const vinculo of (item.vinculos_device || [])) {

        if (!vinculo || !vinculo.id_mac) continue;

        const responseObjectDisplay = await axios.get(
          url_sepioo_seal + '/sepioo/object/' + vinculo.id_mac,
          {
            headers: {
              'Content-Type': 'application/json',
              'Ocp-Apim-Subscription-Key': subscriptionKey
            }
          }
        );

        const cf = responseObjectDisplay.data?.customFields || {};
        const sequenceRaw = cf.SEQUENCE;
        _objectsPDI.push({
          objectId: responseObjectDisplay.data?.objectId || vinculo.id_mac,
          id_item: item._id,
          tag: item.tag,
          sequence: sequenceRaw,
          sequenceNumero: sequenceNumeroFromSeq(sequenceRaw),
          status: cf.STATUS,
          customFields: cf,
          button_click: vinculo.button_click ? new Date(vinculo.button_click) : null,
          id_item_loc1: item.id_nivel_loc1 || null,
          id_item_loc2: item.id_nivel_loc2 || null,
          id_item_loc3: item.id_nivel_loc3 || null,
          id_item_loc4: item.id_nivel_loc4 || null,
          id_categoria_loc1_esperado: item.id_categoria?.id_nivel_loc1 || null,
          id_categoria_loc2_esperado: item.id_categoria?.id_nivel_loc2 || null,
          id_categoria_loc3_esperado: item.id_categoria?.id_nivel_loc3 || null,
          id_categoria_loc4_esperado: item.id_categoria?.id_nivel_loc4 || null,
          localizacao_correta: true
        });
      }
    };

    // Menor → maior (ex.: 920-943 antes de 925-953)
    _objectsPDI.sort((a, b) => a.sequenceNumero - b.sequenceNumero);
    console.log('objectsPDI', _objectsPDI);

    const indexPDI = _objectsPDI.findIndex((p) => String(p.objectId) === String(id_pdi));
    if (indexPDI < 0) {
      return res.json({
        ok: false,
        error: 'PDI clicado não entrou na sequência (fora do filtro de localização).',
        data: itemEncontrado.vinculos_device,
        objectsPDI: _objectsPDI
      });
    };

    const pdiAtual = _objectsPDI[indexPDI];

    const registrarClick = async (index) => {
      const mac = _objectsPDI[index].objectId;
      await Item.updateOne(
        { 'vinculos_device.id_mac': mac },
        { $set: { 'vinculos_device.$.button_click': new Date() } }
      );
      _objectsPDI[index].button_click = new Date();
      _objectsPDI[index].checkSequenciamento = 'registrado';
    };

    // 5) Sequência global: todos os anteriores (0..k-1) devem ter click recente
    let sequenciaOk = true;
    if (indexPDI > 0) {
      for (let i = 0; i < indexPDI; i++) {
        const m = minutosDesde(_objectsPDI[i].button_click);
        if (m === null || m > LIMITE_MINUTOS) {
          sequenciaOk = false;
          pdiAtual.checkSequenciamento = `sequenciamento incorreto (pdi seq ${_objectsPDI[i].sequence} — ${m === null ? 'sem click' : m + ' min'})`;
          break;
        }
      }
    }

    if (!sequenciaOk) {
      pdiAtual.responseLed = await acionaLed(pdiAtual.objectId, 'RED');
      pdiAtual.responseDisplay = await alteraDisplay(pdiAtual, 'SEQ_INCORRETO');
      setTimeout(async () => {
        await alteraDisplay(pdiAtual, 'AGUARDANDO');
      }, 10000);
      return res.json({
        ok: false,
        error: 'SEQ_INCORRETO',
        data: itemEncontrado.vinculos_device,
        objectsPDI: _objectsPDI
      });
    }

    const mAtual = minutosDesde(pdiAtual.button_click);
    if (mAtual === null || mAtual > LIMITE_MINUTOS) {
      await registrarClick(indexPDI);
    } else {
      pdiAtual.checkSequenciamento = `checado em ${mAtual} minutos`;
    }

    pdiAtual.responseLed = await acionaLed(pdiAtual.objectId, 'GREEN');
    setTimeout(async () => {
      pdiAtual.responseDisplay = await alteraDisplay(pdiAtual, 'OK');
    }, 1000);
    

    return res.json({
      ok: true,
      data: itemEncontrado.vinculos_device,
      objectsPDI: _objectsPDI,
      itensNoLocal: (itensNoLocal || []).map((i) => i._id),
      itensSequencia: itensSequencia.map((i) => i._id)
    });

  } catch (error) {
    console.error('[x_vw/sepioo/button]', error.message);
    try {
      await logsService.registrar({
        tipo: 'integracao',
        acao: 'start_check',
        status: 'erro',
        mensagem: 'Erro ao consultar objeto Sepioo',
        id_conta,
        id_item: itemEncontrado?._id,
        dados: { id_pdi, erro: error.message }
      });
    } catch (e) { /* ignore */ }

    return res.json({
      ok: false,
      error: 'Erro ao consultar objeto Sepioo',
      data: [{ id_mac: id_pdi, sepioo_error: error.message }]
    });
  }

});


























  app.post('/x_vw/sepioo/button_homologado', async (req, res) => {

    let id_conta = "03ec6119-89cf"

    const io = req.app.get('io');

    let itemEncontrado = null;
    let localizacaoEncontrada = null;
    let ultimoRegistro = null;
    let posicaoCriada = null;
    const url = 'https://api.sepioo.com/v2.0/industry_seal_eu/sealbrengenharia/objects/action/flash';


    console.log('req.body', req.body);
    let id_pdi = null;
    let _objectsPDI = [];

    try {

      // id_pdi = req.body.objectId;
      id_pdi = req.body.PDI ||req.body.deviceId || req.body.objectId;

      if (id_pdi) {

        // todo: 1 - Buscar o item pelo id_mac no campo vinculos_device do cadastro de Itens
        // todo: 1 - A categoria é que fornece a localizacao esperada
        itemEncontrado = await Item.findOne({
          'vinculos_device.id_mac': id_pdi
        })
          .populate('id_categoria')
          .lean();

          console.log('itemEncontrado', itemEncontrado);

        if (itemEncontrado) {

          await logsService.registrar({
            tipo: 'integracao',
            acao: 'start_check',
            status: 'sucesso',
            mensagem: 'Click PDI recebido, SKU encontrado',
            id_conta: itemEncontrado.id_conta,
            id_item: itemEncontrado._id,
            dados: {
              id_pdi: id_pdi
            }
          });

          for (let i = 0; i < itemEncontrado.vinculos_device.length; i++) {
    
            // todo:  2 - Consumir da PDI, dados de sequenciamento e status
            let responseObjectDisplay = await axios.get(url_sepioo_seal + '/sepioo/object/' + itemEncontrado.vinculos_device[i].id_mac, {
              headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': subscriptionKey
              }
            });

            // todo: 3 - Buscar o último registro, para checar se a localização está correta
            ultimoRegistro = await Registro.findOne({
              tag: itemEncontrado.tag,
              id_conta: itemEncontrado.id_conta
            })
              .sort({ data_registro: -1, createdAt: -1 })
              .lean();

            // todo: 4 - Checar se a localização esperada bate com a posicao atual do Item pelo ultimo registro
            const localizacaoCorreta = [1, 2, 3, 4].every(n =>
              itemEncontrado.id_categoria[`id_nivel_loc${n}`] ===
              ultimoRegistro?.[`id_nivel_loc${n}`]
            );

            _objectsPDI.push({
              "objectId": responseObjectDisplay.data.objectId,
              'sequence': responseObjectDisplay.data.customFields.SEQUENCE,
              'status': responseObjectDisplay.data.customFields.STATUS,
              'button_click': itemEncontrado.vinculos_device[i].button_click ? new Date(itemEncontrado.vinculos_device[i].button_click) : null,
              'id_categoria_loc1_esperado': itemEncontrado.id_categoria.id_nivel_loc1,
              'id_categoria_loc2_esperado': itemEncontrado.id_categoria.id_nivel_loc2,
              'id_categoria_loc3_esperado': itemEncontrado.id_categoria.id_nivel_loc3,
              'id_categoria_loc4_esperado': itemEncontrado.id_categoria.id_nivel_loc4,
              'ultimo_registro_loc1': ultimoRegistro ? ultimoRegistro.id_nivel_loc1 : null,
              'ultimo_registro_loc2': ultimoRegistro ? ultimoRegistro.id_nivel_loc2 : null,
              'ultimo_registro_loc3': ultimoRegistro ? ultimoRegistro.id_nivel_loc3 : null,
              'ultimo_registro_loc4': ultimoRegistro ? ultimoRegistro.id_nivel_loc4 : null,
              'localizacao_correta': localizacaoCorreta
            });

            if (itemEncontrado.vinculos_device.length == i + 1) {

              const acionaLed = async (objectId, cor) => {

                // todo: 5 - Enviar comando para o LED da PDI
                let payloadLed = {
                  color: cor,
                  pattern: 'FLASH_1_SECOND',
                  duration: 5,
                  durationInMinutes: 0,
                  objectIds: [objectId]
                };

                const responseLed = await axios.post(url_sepioo_seal + '/sepioo/flash', payloadLed, {
                  headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Ocp-Apim-Subscription-Key': subscriptionKey
                  }
                });

                await logsService.registrar({
                  tipo: 'sistema',
                  acao: 'acionaLed',
                  status: 'sucesso',
                  mensagem: 'LED acionado com sucesso',
                  id_conta: itemEncontrado.id_conta,
                  id_item: itemEncontrado._id,
                  id_posicao: itemEncontrado.id_posicao,
                  dados: {
                    id_pdi: id_pdi,
                    cor: cor,
                    eventId: responseLed.data.data.eventId
                  }
                });

                _objectsPDI[indexPDI].responseLed = responseLed.data;

              };

              const alteraDisplay = async (objectId, textStatus) => {

                let payloadDisplay = {
                  "objectId": objectId,
                  "deviceIds": [
                    objectId
                  ],
                  "customFields": {
                    "SEQUENCE": responseObjectDisplay.data.customFields.SEQUENCE,
                    "PARTNUMBER": responseObjectDisplay.data.customFields.PARTNUMBER,
                    "INSERTION": responseObjectDisplay.data.customFields.INSERTION,
                    "STATUS": textStatus
                  }
                };
    
                const responseDisplay = await axios.post(url_sepioo_seal + '/sepioo/object', payloadDisplay, {
                  headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Ocp-Apim-Subscription-Key': subscriptionKey
                  }
                });

                await logsService.registrar({
                  tipo: 'sistema',
                  acao: 'alteraDisplay',
                  status: 'sucesso',
                  mensagem: 'Display alterado com sucesso',
                  id_conta: itemEncontrado.id_conta,
                  id_item: itemEncontrado._id,
                  id_posicao: itemEncontrado.id_posicao,
                  dados: {
                    id_pdi: id_pdi,
                    textStatus: textStatus,
                    eventId: responseDisplay.data.data.eventId,
                    status: responseDisplay.data.data.status
                  }
                });

                _objectsPDI[indexPDI].responseDisplay = responseDisplay.data;

              }


              _objectsPDI.sort((a, b) => a.sequenceNumero - b.sequenceNumero);

              const LIMITE = 30;
              const indexPDI = _objectsPDI.findIndex(p => p.objectId === id_pdi);
              const minutos = d => d ? Math.floor((Date.now() - new Date(d)) / 60000) : null;

              const registrar = async index => {
                await Item.updateOne(
                  { "vinculos_device.id_mac": id_pdi },
                  { $set: { "vinculos_device.$.button_click": new Date() } }
                );
                _objectsPDI[index].checkSequenciamento = 'registrado';
                await acionaLed(_objectsPDI[indexPDI].objectId, 'GREEN');
                await alteraDisplay(_objectsPDI[indexPDI].objectId,  "OK");
              };

              if (_objectsPDI[indexPDI].localizacao_correta) {

                if (indexPDI === 0) {

                  const m = minutos(_objectsPDI[0].button_click);

                  m === null || m > LIMITE
                    ? await registrar(0)
                    : _objectsPDI[0].checkSequenciamento = `checado em ${m} minutos`;

                  await acionaLed(_objectsPDI[indexPDI].objectId, 'GREEN');
                  await alteraDisplay(_objectsPDI[indexPDI].objectId, "OK");

                } else {

                  const m1 = minutos(_objectsPDI[0].button_click);

                  if (m1 === null) {
                    _objectsPDI[indexPDI].checkSequenciamento = 'sequenciamento incorreto';
                    await acionaLed(_objectsPDI[indexPDI].objectId, 'RED');
                    await alteraDisplay(_objectsPDI[indexPDI].objectId, "SEQ_INCORRETO");

                  } else if (m1 > LIMITE) {
                    _objectsPDI[indexPDI].checkSequenciamento = `sequenciamento incorreto pdi 1 (${m1} min)`;
                    await acionaLed(_objectsPDI[indexPDI].objectId, 'RED');
                    await alteraDisplay(_objectsPDI[indexPDI].objectId,  "SEQ_INCORRETO");

                  } else {

                    const m = minutos(_objectsPDI[indexPDI].button_click);

                    m === null || m > LIMITE
                      ? await registrar(indexPDI)
                      : _objectsPDI[indexPDI].checkSequenciamento = `checado em ${m} minutos`;

                    await acionaLed(_objectsPDI[indexPDI].objectId, 'GREEN');
                    await alteraDisplay(_objectsPDI[indexPDI].objectId,  "OK");
                  }
                }

              } else {

                await alteraDisplay(_objectsPDI[indexPDI].objectId, "LOC_INCORRETO");

              }


              res.json({
                ok: true,
                data: itemEncontrado.vinculos_device,
                objectsPDI: _objectsPDI
              });
            }

          };


        } else {

          await logsService.registrar({
            tipo: 'integracao',
            acao: 'start_check',
            status: 'alerta',
            mensagem: 'Click PDI recebido, SKU não encontrado',
            id_conta: id_conta,
            dados: {
              id_pdi: id_pdi
            }
          });

          res.json({
            ok: false,
            error: "PDI não encontrado",
            data: [{
              'id_mac': id_pdi,
              'sepioo_error': ""
            }]
          });

        };

      };

    } catch (error) {

      await logsService.registrar({
        tipo: 'integracao',
        acao: 'start_check',
        status: 'erro',
        mensagem: 'Erro ao consultar objeto Sepioo',
        id_conta: id_conta,
        id_item: itemEncontrado._id,
        dados: {
          id_pdi: id_pdi
        }
      });

      res.json({
        ok: false,
        error: "Erro ao consultar objeto Sepioo",
        data: [{
          'id_mac': id_pdi,
          'sepioo_error': error.message
        }]
      });

    }

  });


// FINAL BOTAO DE CLICK NA PDI
// ****************************************************************
















  app.post('/x_vw/sepioo/button_checar', async (req, res) => {

    const id_pdi = req.body?.objectId;
    const objectsPDI = [];

    const headersSepioo = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Ocp-Apim-Subscription-Key': subscriptionKey
    };

    try {

      console.log('req.body', req.body);

      if (!id_pdi) {
        return res.status(400).json({
          ok: false,
          error: 'objectId não informado'
        });
      }

      // 1. Buscar o item relacionado à PDI clicada
      const itemEncontrado = await Item.findOne({
        'vinculos_device.id_mac': id_pdi
      })
        .populate('id_categoria')
        .lean();

      if (!itemEncontrado) {
        return res.status(404).json({
          ok: false,
          error: 'PDI não encontrada',
          data: [{
            id_mac: id_pdi,
            sepioo_error: ''
          }]
        });
      }

      if (
        !Array.isArray(itemEncontrado.vinculos_device) ||
        !itemEncontrado.vinculos_device.length
      ) {
        return res.status(404).json({
          ok: false,
          error: 'O item não possui PDIs vinculadas'
        });
      }

      /*
       * 2. Consultar todas as PDIs e obter os dados
       * de sequência cadastrados na Sepioo.
       */
      const pdis = await Promise.all(
        itemEncontrado.vinculos_device.map(async vinculo => {

          const responseObjectDisplay = await axios.get(
            `${url_sepioo_seal}/sepioo/object/${vinculo.id_mac}`,
            {
              headers: headersSepioo
            }
          );

          const sequence = String(
            responseObjectDisplay.data?.customFields?.SEQUENCE || ''
          ).trim();

          const primeiroNumero = sequence.match(/\d+/)?.[0];

          return {
            vinculo,
            responseObjectDisplay,
            sequence,
            sequenceNumero: primeiroNumero
              ? parseInt(primeiroNumero, 10)
              : Number.MAX_SAFE_INTEGER
          };
        })
      );

      // 3. Ordenar PDIs pela sequência
      pdis.sort((a, b) => a.sequenceNumero - b.sequenceNumero);

      console.log('pdis', pdis);

      // 4. Localizar a PDI que efetivamente teve o botão pressionado
      const indiceClicado = pdis.findIndex(
        pdi => pdi.vinculo.id_mac === id_pdi
      );

      if (indiceClicado === -1) {
        return res.status(404).json({
          ok: false,
          error: 'A PDI clicada não pertence ao item encontrado',
          id_mac: id_pdi
        });
      }

      const pdiClicada = pdis[indiceClicado];

      /*
       * 5. Verificar se o botão atual já foi clicado
       * nos últimos 30 minutos.
       */
      const agora = new Date();
      const limite = new Date(agora.getTime() - 30 * 60 * 1000);

      const dataCliqueAtual = pdiClicada.vinculo.button_click
        ? new Date(pdiClicada.vinculo.button_click)
        : null;

      if (dataCliqueAtual && dataCliqueAtual > limite) {
        return res.json({
          ok: true,
          status: 'checado',
          mensagem: 'Esta etiqueta já foi confirmada nos últimos 30 minutos.',
          id_mac: id_pdi,
          sequence: pdiClicada.sequence,
          button_click: dataCliqueAtual
        });
      }

      /*
       * 6. Verificar se existe alguma sequência anterior
       * sem clique ou com clique defasado.
       */
      const pdiAnteriorPendente = pdis
        .slice(0, indiceClicado)
        .find(pdi => {

          if (!pdi.vinculo.button_click) {
            return true;
          }

          const dataClique = new Date(pdi.vinculo.button_click);

          return Number.isNaN(dataClique.getTime()) || dataClique <= limite;
        });

      if (pdiAnteriorPendente) {

        // Sinalizar a PDI clicada incorretamente em vermelho
        const payloadLedErro = {
          color: 'RED',
          pattern: 'FLASH_1_SECOND',
          duration: 5,
          durationInMinutes: 0,
          objectIds: [
            pdiClicada.responseObjectDisplay.data.objectId
          ]
        };

        let responseLedErro = null;

        try {
          responseLedErro = await axios.post(
            `${url_sepioo_seal}/sepioo/flash`,
            payloadLedErro,
            {
              headers: headersSepioo
            }
          );
        } catch (ledError) {
          console.log(
            'Erro ao sinalizar LED:',
            ledError.response?.data || ledError.message
          );
        }

        return res.status(409).json({
          ok: false,
          status: 'fora_sequencia',
          error: 'Clique realizado fora da sequência.',
          mensagem: `Confirme primeiro a etiqueta da sequência ${pdiAnteriorPendente.sequence}.`,
          sequence_esperado: pdiAnteriorPendente.sequence,
          sequence_clicado: pdiClicada.sequence,
          id_mac_esperado: pdiAnteriorPendente.vinculo.id_mac,
          id_mac_clicado: id_pdi,
          responseLed: responseLedErro?.data || null
        });
      }

      /*
       * 7. Atualizar de forma atômica somente o botão
       * da PDI efetivamente clicada.
       */
      const responseButtonClick = await Item.updateOne(
        {
          vinculos_device: {
            $elemMatch: {
              id_mac: id_pdi,
              $or: [
                { button_click: { $exists: false } },
                { button_click: null },
                { button_click: { $lte: limite } }
              ]
            }
          }
        },
        {
          $set: {
            'vinculos_device.$.button_click': agora
          }
        }
      );

      /*
       * Se não modificou, outra chamada pode ter atualizado
       * o mesmo botão entre a leitura e o update.
       */
      if (!responseButtonClick.modifiedCount) {
        return res.json({
          ok: true,
          status: 'checado',
          mensagem: 'Esta etiqueta já foi confirmada nos últimos 30 minutos.',
          id_mac: id_pdi,
          sequence: pdiClicada.sequence
        });
      }

      // 8. Buscar o último registro do item apenas uma vez
      const ultimoRegistro = await Registro.findOne({
        tag: itemEncontrado.tag,
        id_conta: itemEncontrado.id_conta
      })
        .sort({
          data_registro: -1,
          createdAt: -1
        })
        .lean();

      /*
       * 9. Verificar se a posição atual corresponde
       * à localização esperada.
       */
      const localizacaoCorreta = [1, 2, 3, 4].every(n => {

        const localEsperado =
          itemEncontrado.id_categoria?.[`id_nivel_loc${n}`] ?? '';

        const localAtual =
          ultimoRegistro?.[`id_nivel_loc${n}`] ?? '';

        return String(localEsperado) === String(localAtual);
      });

      /*
       * 10. Processar todas as PDIs relacionadas ao item.
       */
      for (const pdi of pdis) {

        const responseObjectDisplay = pdi.responseObjectDisplay;
        const customFields =
          responseObjectDisplay.data?.customFields || {};

        // Enviar comando para o LED
        const payloadLed = {
          color: localizacaoCorreta ? 'GREEN' : 'RED',
          pattern: 'FLASH_1_SECOND',
          duration: 5,
          durationInMinutes: 0,
          objectIds: [
            responseObjectDisplay.data.objectId
          ]
        };

        const responseLed = await axios.post(
          `${url_sepioo_seal}/sepioo/flash`,
          payloadLed,
          {
            headers: headersSepioo
          }
        );

        // Atualizar o display
        const payloadDisplay = {
          objectId: responseObjectDisplay.data.objectId,
          deviceIds: [
            responseObjectDisplay.data.objectId
          ],
          customFields: {
            SEQUENCE: customFields.SEQUENCE,
            PARTNUMBER: customFields.PARTNUMBER,
            INSERTION: customFields.INSERTION,
            STATUS: localizacaoCorreta
              ? 'INICIO'
              : 'LOC_INCORRETO'
          }
        };

        const responseDisplay = await axios.post(
          `${url_sepioo_seal}/sepioo/object`,
          payloadDisplay,
          {
            headers: headersSepioo
          }
        );

        objectsPDI.push({
          objectId: responseObjectDisplay.data.objectId,
          sequence: pdi.sequence,
          sequence_numero: pdi.sequenceNumero,
          status: customFields.STATUS,

          id_categoria_loc1_esperado:
            itemEncontrado.id_categoria?.id_nivel_loc1 ?? null,

          id_categoria_loc2_esperado:
            itemEncontrado.id_categoria?.id_nivel_loc2 ?? null,

          id_categoria_loc3_esperado:
            itemEncontrado.id_categoria?.id_nivel_loc3 ?? null,

          id_categoria_loc4_esperado:
            itemEncontrado.id_categoria?.id_nivel_loc4 ?? null,

          ultimo_registro_loc1:
            ultimoRegistro?.id_nivel_loc1 ?? null,

          ultimo_registro_loc2:
            ultimoRegistro?.id_nivel_loc2 ?? null,

          ultimo_registro_loc3:
            ultimoRegistro?.id_nivel_loc3 ?? null,

          ultimo_registro_loc4:
            ultimoRegistro?.id_nivel_loc4 ?? null,

          localizacao_correta: localizacaoCorreta,

          pdi_clicada:
            pdi.vinculo.id_mac === id_pdi,

          responseLed: responseLed.data,
          responseDisplay: responseDisplay.data,

          responseButtonClick:
            pdi.vinculo.id_mac === id_pdi
              ? 'ok'
              : null
        });
      }

      return res.json({
        ok: true,
        status: 'ok',
        mensagem: 'Clique registrado com sucesso.',
        id_mac_clicado: id_pdi,
        sequence_clicado: pdiClicada.sequence,
        localizacao_correta: localizacaoCorreta,
        objectsPDI
      });

    } catch (error) {

      console.error(
        'Erro na rota /x_vw/sepioo/button:',
        error.response?.data || error
      );

      return res.status(error.response?.status || 500).json({
        ok: false,
        error: 'Erro ao processar o botão da PDI',
        data: [{
          id_mac: id_pdi,
          sepioo_status: error.response?.status || null,
          sepioo_error:
            error.response?.data ||
            error.message ||
            'Erro desconhecido'
        }]
      });
    }
  });



}