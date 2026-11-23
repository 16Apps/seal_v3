const mongoose = require('mongoose');
const shortid = require('shortid');

const LeituraSchema = new mongoose.Schema({
    data_leitura: { type: Date },
    rssi: { type: Number },
    antena: { type: String },
    tokem: { type: String },
    id_gateway: { type: String, ref: 'Gateway' },
    bateria: { type: String },
    temperatura: { type: String },
    latitude: { type: String },
    longitude: { type: String },
    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },
    id_nivel_loc1_final: { type: String, ref: 'Localizacao' },
    id_nivel_loc2_final: { type: String, ref: 'Localizacao' },
    id_nivel_loc3_final: { type: String, ref: 'Localizacao' },
    id_nivel_loc4_final: { type: String, ref: 'Localizacao' }
}, { _id: false });

const TrackingGuardaSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_tracking_regra: { type: String, ref: 'TrackingRegra' },
    id_item: { type: String, ref: 'Item' },
    tag: { type: String },

    status: {
        type: String,
        enum: ['aberto', 'aplicado', 'descartado', 'expirado'],
        default: 'aberto'
    },

    janela_inicio: { type: Date },
    janela_fim: { type: Date },

    leituras: { type: [LeituraSchema], default: [] },

    // Candidato vencedor (melhor sinal / confirmações)
    melhor_rssi: { type: Number },
    id_gateway_vencedor: { type: String, ref: 'Gateway' },
    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },
    id_nivel_loc1_final: { type: String, ref: 'Localizacao' },
    id_nivel_loc2_final: { type: String, ref: 'Localizacao' },
    id_nivel_loc3_final: { type: String, ref: 'Localizacao' },
    id_nivel_loc4_final: { type: String, ref: 'Localizacao' },

    confirmacoes: { type: Number, default: 0 },
    motivo: { type: String },
    id_registro: { type: String, ref: 'Registro' }

}, {
    versionKey: false,
    timestamps: true
});

TrackingGuardaSchema.index({ id_conta: 1, tag: 1, status: 1, janela_fim: 1 });
TrackingGuardaSchema.index({ tag: 1, status: 1 });

module.exports = mongoose.model('TrackingGuarda', TrackingGuardaSchema);
