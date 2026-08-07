const mongoose = require('mongoose');
const shortid = require('shortid');

const InteracaoSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_colaborador: { type: String, ref: 'Colaborador' },

    ativo: { type: String, enum: [0, 1], default: 1 },
    descricao: { type: String },
    icone: { type: String, default: '' },

    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },

    enviar_email: { type: Number, enum: [0, 1], default: 0 },
    enviar_whats: { type: Number, enum: [0, 1], default: 0 },

    acoes: [{
        _id: { type: String, default: shortid.generate },
        movimento: { type: String, enum: ['entrada', 'entrada_i', 'saida', 'saida_i'] },
        equipamento: { type: String, enum: ['pdi', 'pdi_vinculado', 'tuya', 'endpoint'] },
        serial: { type: String, default: '' },
        acao: { type: String, enum: ['tuya_on', 'tuya_off', 'pdi_display', 'pdi_led_vr',  'pdi_led_vm', 'pdi_bt_1', 'pdi_bt_2', 'endpoint_get', 'endpoint_post', 'endpoint_patch', 'endpoint_delete'] },
        comando: { type: String, default: '' }
    }],

}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Interacao', InteracaoSchema);
