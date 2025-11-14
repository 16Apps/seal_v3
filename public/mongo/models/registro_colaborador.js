const mongoose = require('mongoose');
const shortid = require('shortid');

const RegistroColaboradorSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_colaborador: { type: String, ref: 'Colaborador' },
    id_gateway: { type: String, ref: 'Gateway' },
    latitude: { type: String },
    longitude: { type: String },

    data_registro: { type: Date },
    data_permanecia: { type: Date },
    status: { type: String },

    id_colaborador_ident: { type: String, ref: 'Colaborador' },
    tag: { type: String },
    rssi: { type: String },
    antena: { type: String },
    bateria: { type: String },
    temperatura: { type: String },

    id_nivel_loc1: { type: String, ref: 'Localizacao' }, 
    id_nivel_loc2: { type: String, ref: 'Localizacao' }, 
    id_nivel_loc3: { type: String, ref: 'Localizacao' }, 
    id_nivel_loc4: { type: String, ref: 'Localizacao' }, 
    
}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('RegistroColaborador', RegistroColaboradorSchema);
