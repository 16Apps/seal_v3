const mongoose = require('mongoose');
const shortid = require('shortid');

const LocalizacaoPlantaSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    titulo: { type: String },

    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },

    areasData: [{
        points: [{
            x: { type: Number },
            y: { type: Number }
        }],
        left: { type: Number },
        top: { type: Number },
        addressId1: { type: String, default: null },
        addressId2: { type: String, default: null },
        addressId3: { type: String, default: null },
        addressId4: { type: String, default: null },
        addressId: { type: String, default: null }
    }]

}, {
    versionKey: false
});

module.exports = mongoose.model('LocalizacaoPlanta', LocalizacaoPlantaSchema);
