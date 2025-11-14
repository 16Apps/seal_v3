const mongoose = require('mongoose');
const shortid = require('shortid');

const LocalizacaoSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_nivel: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    ativo: { type: Number, enum: [0, 1], default: 1 },
    descricao: { type: String },
    tag: { type: String },

    foto: { type: String },
    planta_baixa: { type: String },

    cep: { type: String },
    logradouro: { type: String },
    numero: { type: String },
    complemento: { type: String },
    bairro: { type: String },
    cidade: { type: String },
    estado: { type: String },
    pais: { type: String },
    latitude: { type: String },
    longitude: { type: String },

    observacao: { type: String },

    planta: { type: String },
    areasData: [{
        points: [{
            x: { type: Number },
            y: { type: Number }
        }],
        
        pointsLatLng: [{
            lat: Number,
            lng: Number
        }], // usado em Google Maps
        
        rssiAp: Number,
        pointsAps: [{
            descricao: String,
            mac: String,
            rssi: Number,
            range: Number
        }], // usado no App, vinculo com APs

        left: { type: Number },
        top: { type: Number },
        addressId1: { type: String, default: null },
        addressId2: { type: String, default: null },
        addressId3: { type: String, default: null },
        addressId4: { type: String, default: null },
        addressId: { type: String, default: null }
    }]

}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Localizacao', LocalizacaoSchema);
