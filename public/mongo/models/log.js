const mongoose = require('mongoose');
const shortid = require('shortid');

const LogSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta', index: true },

    tipo: { type: String, enum: ['usuario', 'sistema', 'rfid', 'hardware', 'integracao'], required: true, index: true },
    acao: { type: String, required: true, index: true },
    status: { type: String, enum: ['sucesso', 'erro', 'alerta'], default: 'sucesso' },

    mensagem: { type: String },

    id_colaborador: { type: String, ref: 'Colaborador' },
    id_gateway: { type: String, ref: 'Gateway' },
    id_item: { type: String, ref: 'Item' },
    id_posicao: { type: String, ref: 'Posicao' },
    id_registro: { type: String, ref: 'Registro' },

    tag: { type: String },

    envio: { type: Object },
    retorno: { type: Object },
    dados: { type: Object },

    data_registro: { type: Date, default: Date.now, index: true }

}, {
    versionKey: false
});

LogSchema.index({ id_conta: 1, data_registro: -1 });

module.exports = mongoose.model('Log', LogSchema);