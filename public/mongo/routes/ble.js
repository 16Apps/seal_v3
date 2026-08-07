let noble = null;
let bleDisponivel = false;
let bleErro = '';

try {
    noble = require('@stoprocent/noble');
    bleDisponivel = true;
    console.log('BLE carregado com sucesso');
} catch (err) {
    bleErro = err.message;
    bleDisponivel = false;
    console.log('BLE indisponível neste ambiente:', err.message);
}

module.exports = (app, dbConnection) => {
    console.log('BLE module carregado');

    const URL_POST = 'http://localhost:3000/_bd/registro';
    // const URL_POST = 'https://connectiot-app.azurewebsites.net/_bd/registro';
    const INTERVALO_ENVIO_MS = 5000;

    const ultimoEnvioPorTag = new Map();

    let nobleState = 'unknown';

    let bleConfig = {
        ativo: false,
        tokem: '',
        id_nivel_loc1: '',
        id_nivel_loc2: '',
        id_nivel_loc3: '',
        id_nivel_loc4: '',
        id_nivel_loc1_final: '',
        id_nivel_loc2_final: '',
        id_nivel_loc3_final: '',
        id_nivel_loc4_final: '',
        antena: '0'
    };

    let bleStatus = {
        scanning: false,
        ultimaTag: '',
        total: 0,
        startedAt: null
    };

    noble.on('stateChange', async (state) => {
        nobleState = state;
        console.log('stateChange:', state);

        if (state !== 'poweredOn') {
            bleStatus.scanning = false;
            console.log('Bluetooth não está poweredOn');
            return;
        }

        if (bleConfig.ativo) {
            try {
                await iniciarScan();
            } catch (err) {
                console.error('Erro ao iniciar scan após stateChange:', err);
            }
        }
    });

    noble.on('discover', async (p) => {
        try {
            if (!bleConfig.ativo) return;

            const tag = obterTagDoBeacon(p);
            if (!tag) return;

            const agora = Date.now();
            const ultimoEnvio = ultimoEnvioPorTag.get(tag) || 0;

            if ((agora - ultimoEnvio) < INTERVALO_ENVIO_MS) {
                return;
            }

            const payload = {
                tokem: bleConfig.tokem,
                tag: tag,
                data_leitura: new Date().toISOString(),
                antena: bleConfig.antena || '0',
                rssi: p.rssi ?? 0,
                bateria: '0',
                temperatura: '0',
                latitude: '',
                longitude: '',
                id_nivel_loc1: bleConfig.id_nivel_loc1 || '',
                id_nivel_loc2: bleConfig.id_nivel_loc2 || '',
                id_nivel_loc3: bleConfig.id_nivel_loc3 || '',
                id_nivel_loc4: bleConfig.id_nivel_loc4 || '',
                id_nivel_loc1_final: bleConfig.id_nivel_loc1_final || '',
                id_nivel_loc2_final: bleConfig.id_nivel_loc2_final || '',
                id_nivel_loc3_final: bleConfig.id_nivel_loc3_final || '',
                id_nivel_loc4_final: bleConfig.id_nivel_loc4_final || ''
            };

            const resposta = await fetch(URL_POST, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (resposta.ok) {
                ultimoEnvioPorTag.set(tag, agora);
                bleStatus.ultimaTag = tag;
                bleStatus.total++;
            } else {
                const texto = await resposta.text();
                console.error(`Erro POST ${resposta.status}:`, texto);
            }
        } catch (err) {
            console.error('Erro ao processar/enviar beacon:', err);
        }
    });

    noble.on('scanStart', () => {
        bleStatus.scanning = true;
        console.log('scanStart disparou');
    });

    noble.on('scanStop', () => {
        bleStatus.scanning = false;
        console.log('scanStop disparou');
    });

    async function iniciarScan() {
        if (nobleState !== 'poweredOn') {
            throw new Error(`Bluetooth não está pronto. Estado atual: ${nobleState}`);
        }

        if (bleStatus.scanning) {
            return;
        }

        console.log('Iniciando scan BLE...');
        await noble.startScanningAsync([], true);
        bleStatus.scanning = true;
        bleStatus.startedAt = new Date().toISOString();
    }

    async function pararScan() {
        if (!bleStatus.scanning) return;

        await noble.stopScanningAsync();
        bleStatus.scanning = false;
    }

    function obterTagDoBeacon(p) {
        const manufacturerData = p.advertisement?.manufacturerData;
        if (manufacturerData && manufacturerData.length > 0) {
            return manufacturerData.toString('hex').toUpperCase();
        }

        if (p.address && p.address !== 'unknown') {
            return p.address.replace(/:/g, '').toUpperCase();
        }

        if (p.id) {
            return String(p.id).toUpperCase();
        }

        return null;
    }

    app.post('/ble/start', async (req, res) => {
        try {
            const body = req.body || {};

            bleConfig = {
                ativo: true,
                tokem: body.tokem || '',
                id_nivel_loc1: body.id_nivel_loc1 || '',
                id_nivel_loc2: body.id_nivel_loc2 || '',
                id_nivel_loc3: body.id_nivel_loc3 || '',
                id_nivel_loc4: body.id_nivel_loc4 || '',
                id_nivel_loc1_final: body.id_nivel_loc1_final || '',
                id_nivel_loc2_final: body.id_nivel_loc2_final || '',
                id_nivel_loc3_final: body.id_nivel_loc3_final || '',
                id_nivel_loc4_final: body.id_nivel_loc4_final || '',
                antena: body.antena || '0'
            };

            ultimoEnvioPorTag.clear();
            bleStatus.total = 0;
            bleStatus.ultimaTag = '';

            await iniciarScan();

            return res.json({
                ok: true,
                msg: 'Leitura BLE iniciada com sucesso.',
                nobleState,
                bleConfig,
                bleStatus
            });
        } catch (err) {
            console.error('Erro /ble/start:', err);
            return res.status(500).json({
                ok: false,
                msg: err.message || 'Erro ao iniciar leitura BLE',
                bleDisponivel,
                bleErro
            });
        }
    });

    app.post('/ble/stop', async (req, res) => {
        try {
            bleConfig.ativo = false;
            await pararScan();

            return res.json({
                ok: true,
                msg: 'Leitura BLE finalizada com sucesso.',
                nobleState,
                bleStatus,
                bleDisponivel,
                bleErro
            });
        } catch (err) {
            console.error('Erro /ble/stop:', err);
            return res.status(500).json({
                ok: false,
                msg: err.message || 'Erro ao finalizar leitura BLE'
            });
        }
    });

    app.get('/ble/status', (req, res) => {
        return res.json({
            ok: true,
            nobleState,
            bleConfig,
            bleStatus,
            bleDisponivel,
            bleErro
        });
    });
};