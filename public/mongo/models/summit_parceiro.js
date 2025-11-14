const mongoose = require('mongoose');
const shortid = require('shortid');

const ParceiroSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    nome: { type: String },
    tokem: { type: String },
    

    // auditado, foto auditoria, mudança de localização, localização no registro, localizado manualmente
    // excedente, fora de ambiente
}, {
    versionKey: false
});

module.exports = mongoose.model('Parceiro', ParceiroSchema);
