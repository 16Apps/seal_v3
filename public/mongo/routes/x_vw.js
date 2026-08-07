const Item = require("../models/item");
const Localizacao = require("../models/localizacao");
const Registro = require("../models/registro");
const Posicao = require("../models/posicao");
const logsService = require("../services/logs");

const axios = require('axios'); // se for enviar via HTTP

// 🔑 Chave de assinatura fornecida pela Sepioo
const subscriptionKey = 'af737391526e49e8adb171ba54f57b06';

// const url_sepioo_seal = 'http://localhost:3000'
const url_sepioo_seal  = 'https://connectiot-app.azurewebsites.net'

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



  app.post('/x_vw/sepioo/button', async (req, res) => {

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