const mongoose = require('mongoose');
const shortid = require('shortid');

const TrackingRegraSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    ativo: { type: Number, enum: [0, 1], default: 1 },
    descricao: { type: String },

    janela_analise: { type: Number, default: 0 },
    leituras_minima: { type: Number, default: 0 },
    minima_rssi: { type: Number, default: 0 },
    diferenca_rssi: { type: Number, default: 0 },
    confirmacoes_consecutivas: { type: Number, default: 0 },
    tolerancia_sem_leitura: { type: Number, default: 0 },
    tempo_minimo_local: { type: Number, default: 0 }

}, {
    versionKey: false
});

module.exports = mongoose.model('TrackingRegra', TrackingRegraSchema);
