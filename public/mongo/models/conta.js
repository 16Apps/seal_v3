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
    contato_responsavel_email: { type: String },
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

    id_api: { type: String },

    alerta_email: { type: String },
    alerta_email_criterio: { type: String },
    alerta_celular: { type: String },
    alerta_celular_criterio: { type: String },

    params_nomenclatura_itens: {
        sku: { type: String },
        itens: { type: String },
        categorias: { type: String },
        enderecos: { type: String },
        coletores: { type: String },
    },

    plano_monitoramento: {
        posicao_esperada: { type: Number, enum: [0, 1], default: 1 },
        painel_alertas: { type: Number, enum: [0, 1], default: 1 },
        interacao: { type: Number, enum: [0, 1], default: 1 },
        regs_associados: { type: Number, enum: [0, 1], default: 1 },
        portal: { type: Number, enum: [0, 1], default: 1 },
    },

    plano_conta: {
        plano: { type: String },
        valor: { type: Number, default: 0 },
        representante: { type: String },
        suporte_celular: { type: String },
    },

    widget_layout: { type: Array, default: [] },


}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Conta', ContaSchema);
