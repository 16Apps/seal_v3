const mongoose = require('mongoose');
const shortid = require('shortid');

const VisitanteSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    nome: { type: String },
    cpf: { type: String },
    doc_cpf: { type: String },
    empresa: { type: String },
    cargo: { type: String },
    email: { type: String },
    telefone1: { type: String },
    telefone2: { type: String }

    // auditado, foto auditoria, mudança de localização, localização no registro, localizado manualmente
    // excedente, fora de ambiente
}, {
    versionKey: false
});

module.exports = mongoose.model('Visitante', VisitanteSchema);
