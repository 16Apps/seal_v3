const mongoose = require('mongoose');
const shortid = require('shortid');

const ProcessosSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    descricao: { type: String },
    acao_mov: { type: String },
    modo: { type: String },
}, {
    versionKey: false
});

module.exports = mongoose.model('Processos', ProcessosSchema);
