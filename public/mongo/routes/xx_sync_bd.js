const mongoose = require('mongoose');

const URL_DESTINO = 'mongodb://54.233.53.239:27017/seal';

module.exports = (app) => {

  /**
   * GET /xx_sync_bd/exportar/:id_conta
   * Exporta todos os dados da conta da base local para o MongoDB destino.
   */
  app.get('/xx_sync_bd/exportar/:id_conta', async (req, res) => {
    try {
      const idConta = String(req.params.id_conta || '').trim();

      if (!idConta) {
        return res.status(400).json({
          ok: false,
          error: 'Informe id_conta.'
        });
      }

      const resultado = await exportarContaParaOutroServidor(idConta);

      return res.status(200).json({
        ok: true,
        ...resultado
      });
    } catch (erro) {
      console.error('[xx_sync_bd/exportar] Erro:', erro);
      return res.status(500).json({
        ok: false,
        error: erro.message || 'Falha ao exportar a conta.'
      });
    }
  });

  async function exportarContaParaOutroServidor(idConta) {

    if (!idConta) {
      throw new Error('idConta não informado');
    }

    if (!URL_DESTINO) {
      throw new Error('URI do servidor destino não informada');
    }

    const dbOrigem = mongoose.connection.db;

    let conexaoDestino;

    try {

      // Cria uma conexão independente com o outro servidor
      conexaoDestino = await mongoose.createConnection(URL_DESTINO).asPromise();

      const dbDestino = conexaoDestino.db;

      console.log('======================================');
      console.log('EXPORTANDO CONTA:', idConta);
      console.log('Servidor destino conectado');
      console.log('======================================');

      // Busca todas as collections existentes na origem
      const collections = await dbOrigem
        .listCollections({}, { nameOnly: true })
        .toArray();

      const resultado = [];

      for (const collectionInfo of collections) {

        const nomeCollection = collectionInfo.name;

        if (nomeCollection.startsWith('system.')) {
          continue;
        }

        const origem = dbOrigem.collection(nomeCollection);
        const destino = dbDestino.collection(nomeCollection);

        let filtro;

        // Collection de contas é exceção,
        // pois não possui id_conta
        if (
          nomeCollection.toLowerCase() === 'contas' ||
          nomeCollection.toLowerCase() === 'conta'
        ) {

          filtro = {
            _id: idConta
          };

        } else {

          filtro = {
            id_conta: idConta
          };
        }

        const quantidade = await origem.countDocuments(filtro);

        if (quantidade === 0) {
          continue;
        }

        console.log(
          `${nomeCollection}: ${quantidade} registros encontrados`
        );

        const cursor = origem.find(filtro);

        let lote = [];
        let totalCopiado = 0;

        while (await cursor.hasNext()) {

          const documento = await cursor.next();

          lote.push(documento);

          if (lote.length >= 1000) {

            await gravarLote(
              destino,
              lote
            );

            totalCopiado += lote.length;

            lote = [];
          }
        }

        // grava registros restantes
        if (lote.length > 0) {

          await gravarLote(
            destino,
            lote
          );

          totalCopiado += lote.length;
        }

        resultado.push({
          collection: nomeCollection,
          registros: totalCopiado
        });
      }

      return {
        sucesso: true,
        id_conta: idConta,
        collections: resultado
      };

    } catch (erro) {

      console.error('Erro na exportação:', erro);

      throw erro;

    } finally {

      // Fecha somente a conexão com o servidor destino.
      // NÃO fecha a conexão principal da aplicação.
      if (conexaoDestino) {
        await conexaoDestino.close();
      }
    }
  }


  async function gravarLote(collectionDestino, documentos) {

    const operacoes = documentos.map(documento => ({
      replaceOne: {
        filter: {
          _id: documento._id
        },
        replacement: documento,
        upsert: true
      }
    }));

    await collectionDestino.bulkWrite(
      operacoes,
      {
        ordered: false
      }
    );
  }

};
