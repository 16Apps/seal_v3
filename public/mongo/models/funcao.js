const mongoose = require('mongoose');
const shortid = require('shortid');

const FuncaoSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    ativo: { type: Number, enum: [0, 1], default: 1 },
    descricao: { type: String },
}, {
    versionKey: false
});

module.exports = mongoose.model('Funcao', FuncaoSchema);
