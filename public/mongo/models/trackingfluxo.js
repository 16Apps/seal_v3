const mongoose = require('mongoose');
const shortid = require('shortid');

const TrackingFluxoSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },

    ativo: { type: String },
    descricao: { type: String },
    id_categoria: { type: String, ref: 'Categoria' },

    etapas: [{
        _id: { type: String, default: shortid.generate },
        etapa_numero: { type: Number, default: 0 },
        etapa_descricao: { type: String },
        id_nivel_loc1: { type: String, ref: 'Localizacao' },
        id_nivel_loc2: { type: String, ref: 'Localizacao' },
        id_nivel_loc3: { type: String, ref: 'Localizacao' },
        id_nivel_loc4: { type: String, ref: 'Localizacao' },

        tempo_permanencia_minimo: { type: Number, default: 0 },
        tempo_permanencia_maximo: { type: Number, default: 0 },
        tempo_descolamento_proxima_etapa: { type: Number, default: 0 },

    }],

}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('TrackingFluxo', TrackingFluxoSchema);
