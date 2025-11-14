const mongoose = require('mongoose');
const shortid = require('shortid');

const ContaSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    ativo: { type: Number, enum: [0, 1], default: 1 },
    nome: { type: String },
    apelido: { type: String },
    cnpj: { type: String },
    contato_responsavel: { type: String },
    contato_celular: { type: String },
    logo: { type: String },
    telefone: { type: String },
    celular: { type: String },
    email: { type: String },
    site: { type: String },
    cep: { type: String },
    logradouro: { type: String },
    numero: { type: String },
    complemento: { type: String },
    bairro: { type: String },
    cidade: { type: String },
    estado: { type: String },
    latitude: { type: String },
    longitude: { type: String },
    tokem_api: { type: String },
    observacao: { type: String },

    alerta_email: { type: String },
    alerta_email_criterio: { type: String },
    alerta_celular: { type: String },
    alerta_celular_criterio: { type: String },


}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Conta', ContaSchema);
