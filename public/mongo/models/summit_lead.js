const mongoose = require('mongoose');
const shortid = require('shortid');

const LeadSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    nome: { type: String },
    cpf: { type: String },
    empresa: { type: String },
    cargo: { type: String },
    email: { type: String },
    telefone1: { type: String },
    telefone2: { type: String },
    observacao: { type: String },
    parceiro:  { type: String },

    // auditado, foto auditoria, mudança de localização, localização no registro, localizado manualmente
    // excedente, fora de ambiente
}, {
    versionKey: false
});

module.exports = mongoose.model('Lead', LeadSchema);
