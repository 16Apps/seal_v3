const mongoose = require('mongoose');
const shortid = require('shortid');

const FusosSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    descricao: { type: String },
    inicio: { type: String },
    termino: { type: String },
}, {
    versionKey: false
});

module.exports = mongoose.model('Fusos', FusosSchema);
