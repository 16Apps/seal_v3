const fs = require('fs');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

module.exports = (app, dbConnection) => {

  var schema = new Schema({
    img: {
      data: Buffer,
      contentType: String
    }
  });

  var storeImage = mongoose.model('storeImage', schema);

  app.post('/image/save', async function (req, res) {
    try {
      const split = req.body[0].foto.split(',');
      const base64string = split[1];
      const buffer = Buffer.from(base64string, 'base64');

      var stImg = new storeImage();
      stImg.img.data = buffer;
      stImg.img.contentType = 'image/png';

      // Usando async/await para salvar a imagem
      const a = await stImg.save();

      res.json([{ "id_foto": a.id }]);
      console.log([{ "id_foto": a.id }]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Ocorreu um erro ao salvar a imagem.' });
    }
  });


  app.get('/image/save/:pathFile', function (req, res, next) {

    try {
      let imgPath = req.params.pathFile.replace(/\|/g, '\\')

      var stImg = new storeImage;

      stImg.img.data = fs.readFileSync(imgPath);
      stImg.img.contentType = 'image/png';

      stImg.save(function (err, a) {
        if (err) throw err;
        res.json([{ "id_foto": a.id }]);
      });
    } catch (error) {
      console.log(error)
    }

  });

  app.get('/image/:id', async function (req, res) {
    try {
      // Tente encontrar a imagem com o id fornecido
      let doc = await storeImage.findById(req.params.id);

      if (doc) {
        res.contentType(doc.img.contentType);
        res.send(doc.img.data);
      } else {
        // Se não encontrar, use um id padrão para buscar a imagem
        doc = await storeImage.findById('616b3b2a1423125c7515efb4');
        if (doc) {
          res.contentType(doc.img.contentType);
          res.send(doc.img.data);
        } else {
          res.status(404).send('Imagem não encontrada.');
        }
      }
    } catch (error) {
      console.error(error);
      res.status(500).send('Ocorreu um erro no servidor.');
    }
  });



};