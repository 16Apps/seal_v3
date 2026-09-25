const mongoose = require('mongoose');
const shortid = require('shortid');


const GatewaySchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    ativo: { type: Number, enum: [0, 1], default: 1 },
    descricao: { type: String },
    tokem: { type: String },
    tokem_associado: { type: String },

    latitude: { type: String },
    longitude: { type: String },

    posicao_esperada_auto: { type: Number, enum: [0, 1], default: 0 },

    modo: { type: String, enum: ['fixo', 'movel', 'fluxo'], default: 'fixo' },
    id_colaborador: { type: String, ref: 'Colaborador' },
    id_maquina: { type: String, ref: 'Maquinas' },
    id_colaborador_gateway: { type: String },

    intervalo_ausencia: { type: Number, default: 0 },
    intervalo_reg_gps: { type: Number, default: 0 },
    intervalo_reg_rssi: { type: Number, default: 0 },
    intervalo_reg_inventario: { type: Number, default: 0 },
    gera_associao: { type: Number, enum: [0, 1], default: 0 },

    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },

    id_nivel_loc1_destino: { type: String, ref: 'Localizacao' },
    id_nivel_loc2_destino: { type: String, ref: 'Localizacao' },
    id_nivel_loc3_destino: { type: String, ref: 'Localizacao' },
    id_nivel_loc4_destino: { type: String, ref: 'Localizacao' },

    leitor: { type: String },
    leitor_mac: { type: String },
    leitor_potencia: { type: String },
    leitor_secao: { type: String },
    leitor_estado: { type: String },
    codif_epc: { type: String },
    codif_epc_inicial: { type: String },
    codif_epc_comprimento: { type: String },

    watch_regra: { type: String },
    watch_valor: { type: String },
    leitura_base: { type: Object },

    portal_acao: { type: String },
    portal_alertas: { type: String },
    portal_registro_ordem: { type: String },

    api_rest: { type: String },

    registro_leitura: { type: Date },
    foto: { type: String },

    
    dados: [{
        _id: { type: String, default: shortid.generate },
        data: { type: Date },
        descricao: { type: String, default: '' ,enum: ['bateria', 'wifi', 'temperatura']},
        valor: { type: String },
    }],


}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Gateway', GatewaySchema);
