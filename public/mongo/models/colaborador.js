const mongoose = require('mongoose');
const shortid = require('shortid');

const ColaboradorSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    ativo: { type: Number, enum: [0, 1], default: 1 },
    foto: { type: String },
    nome: { type: String },
    apelido: { type: String },
    id_funcao: { type: String, ref: 'Funcao' },
    custo_hora: { type: Number, default: 0 },
    tag: { type: String },
    cpf: { type: String },
    observacao: { type: String },
    perfil: { type: String, default: 'admin' },
    funcao: { type: String, default: 'auxiliar_logistica' },
    email: { type: String },
    celular: { type: String },
    login: { type: String },
    senha: { type: String },
    token_auth_external: { type: String },
    tenant_auth_external: { type: String },
    cep: { type: String },
    logradouro: { type: String },
    numero: { type: String },
    complemento: { type: String },
    bairro: { type: String },
    cidade: { type: String },
    estado: { type: String },
    acesso_modulos: [{ type: String }] // Detalhe os módulos de acesso aqui
}, {
    versionKey: false
});

module.exports = mongoose.model('Colaborador', ColaboradorSchema);
