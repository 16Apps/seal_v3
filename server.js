require('dotenv').config();

var express = require('express');
var expressLayouts = require('express-ejs-layouts');
var cors = require('cors');
var bodyParser = require('body-parser');
var http = require('http');
const socketio = require('socket.io');
const axios = require('axios');

var app = express();
const port = process.env.PORT || 3000;

server = http.createServer(app);

app.set('view engine', 'ejs');  
app.set('layout', 'layout_login', 'layout_show');

app.use(expressLayouts);

app.use(cors());
app.use( bodyParser.json({limit: '500mb'}));
app.use(bodyParser.urlencoded({
  limit: '500mb',
  extended: true,
  parameterLimit:50000
}));

app.use(express.static(__dirname + '/public'));
server = http.createServer(app);

const io = socketio(server);

/** Rooms portal:{id_conta} por socket — para saber FECHADO no disconnect. */
const portalRoomsPorSocket = new Map(); // socket.id -> Set<room>
/** Últimos leitores vinculados ao portal (nome BASE: P01, não P01-E/P01-S). */
const portalGatewaysPorConta = new Map(); // idConta -> Set<deviceBase>
/** Intervalo de alerta vermelho enquanto portal da conta está FECHADO. */
const alertaPortalFechadoTimers = new Map(); // idConta -> Interval
const ALERTA_PORTAL_FECHADO_MS = 5000;

function tamanhoRoomPortal(room) {
  const r = io.sockets.adapter.rooms.get(room);
  return r ? r.size : 0;
}

/** GPO / sinaleiro usa o nome base do leitor (P01), agrupando P01-E e P01-S. */
function baseDeviceSinaleiro(tokem) {
  return String(tokem || '').trim().replace(/-[EeSs]$/, '');
}

function registrarGatewaysPortal(idConta, gateways) {
  const key = String(idConta || '');
  if (!key || !Array.isArray(gateways) || !gateways.length) return;

  let set = portalGatewaysPorConta.get(key);
  if (!set) {
    set = new Set();
    portalGatewaysPorConta.set(key, set);
  }

  gateways.forEach((g) => {
    const raw = typeof g === 'string'
      ? g
      : (g && (g.tokem || g.deviceName || g.device || g.descricao)) || '';
    const base = baseDeviceSinaleiro(raw);
    if (base) set.add(base);
  });

  console.log('[portal] gateways registrados', {
    id_conta: key,
    leitores: Array.from(set)
  });
}

async function dispararSinaleirosPortalFechado(idConta) {
  const key = String(idConta || '');
  const set = portalGatewaysPorConta.get(key);
  if (!set || !set.size) {
    console.log('[portal] alerta fechado: sem gateways vinculados', { id_conta: key });
    return;
  }

  const url = 'http://127.0.0.1:' + port + '/x_naturgy/sinaleiro';
  const leitores = Array.from(set);

  console.log('[portal] alerta vermelho (portal fechado)', {
    id_conta: key,
    leitores: leitores
  });

  for (const deviceName of leitores) {
    try {
      const res = await axios.post(
        url,
        { deviceName: deviceName, cor: 4, tempo: ALERTA_PORTAL_FECHADO_MS },
        { timeout: 6000, validateStatus: () => true }
      );
      console.log('[portal] sinaleiro', {
        deviceName: deviceName,
        status: res.status,
        ok: res.data && res.data.ok,
        ignored: res.data && res.data.ignored
      });
    } catch (e) {
      console.warn('[portal] sinaleiro falhou', deviceName, e.message);
    }
  }
}

function iniciarAlertaPortalFechado(idConta) {
  const key = String(idConta || '');
  if (!key || alertaPortalFechadoTimers.has(key)) return;

  console.log('[portal] iniciando alerta vermelho a cada 5s', { id_conta: key });
  const tick = function () {
    dispararSinaleirosPortalFechado(key);
  };
  tick();
  alertaPortalFechadoTimers.set(key, setInterval(tick, ALERTA_PORTAL_FECHADO_MS));
}

function pararAlertaPortalFechado(idConta) {
  const key = String(idConta || '');
  const timer = alertaPortalFechadoTimers.get(key);
  if (!timer) return;
  clearInterval(timer);
  alertaPortalFechadoTimers.delete(key);
  console.log('[portal] alerta vermelho parado (portal aberto)', { id_conta: key });
}

function logPortalStatus(idConta, room, extras) {
  const conexoes = tamanhoRoomPortal(room);
  const base = Object.assign({
    id_conta: String(idConta),
    room: room,
    conexoes: conexoes
  }, extras || {});

  if (conexoes === 0) {
    console.log('[portal] FECHADO', base);
    iniciarAlertaPortalFechado(idConta);
  } else {
    console.log('[portal] ABERTO', base);
    pararAlertaPortalFechado(idConta);
  }
}

// Ao conectar
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Presence do portal (movimentacao / posicao / ordens): room portal:{id_conta}
  socket.on('portal_join', (data) => {
    const idConta = data && (data.id_conta || data.idConta);
    if (!idConta) return;
    const room = 'portal:' + String(idConta);
    const origem = (data && (data.origem || data.portal)) || '-';

    registrarGatewaysPortal(idConta, data.gateways || data.leitores || []);

    socket.join(room);

    if (!portalRoomsPorSocket.has(socket.id)) {
      portalRoomsPorSocket.set(socket.id, new Set());
    }
    portalRoomsPorSocket.get(socket.id).add(room);

    logPortalStatus(idConta, room, { origem: origem, socket: socket.id, evento: 'join' });
  });

  /** Atualiza lista de leitores sem mudar presence (ex.: vincular/desvincular chip). */
  socket.on('portal_gateways', (data) => {
    const idConta = data && (data.id_conta || data.idConta);
    if (!idConta) return;
    registrarGatewaysPortal(idConta, data.gateways || data.leitores || []);
  });

  socket.on('portal_leave', (data) => {
    const idConta = data && (data.id_conta || data.idConta);
    if (!idConta) return;
    const room = 'portal:' + String(idConta);
    const origem = (data && (data.origem || data.portal)) || '-';

    socket.leave(room);

    const rooms = portalRoomsPorSocket.get(socket.id);
    if (rooms) {
      rooms.delete(room);
      if (!rooms.size) portalRoomsPorSocket.delete(socket.id);
    }

    setImmediate(() => {
      logPortalStatus(idConta, room, { origem: origem, socket: socket.id, evento: 'leave' });
    });
  });

  socket.on('disconnect', () => {
    const rooms = portalRoomsPorSocket.get(socket.id);
    portalRoomsPorSocket.delete(socket.id);
    if (!rooms || !rooms.size) return;

    setImmediate(() => {
      rooms.forEach((room) => {
        const idConta = String(room).replace(/^portal:/, '');
        logPortalStatus(idConta, room, {
          origem: '-',
          socket: socket.id,
          evento: 'disconnect'
        });
      });
    });
  });
});

app.set('io', io); // opcional, para acessar no controller
app.set('portalGatewaysPorConta', portalGatewaysPorConta);

var dbMongo = require('./config/mongo');

app.get('/', (req, res) => {
  res.render('pages/login/login', { layout: 'layout_login' });
});

app.get('/signup', (req, res) => {
  res.render('pages/login/signup', { layout: 'layout_login' });
});

app.get('/forgotpassword', (req, res) => {
  res.render('pages/login/forgotpassword', { layout: 'layout_login' });
});

app.get('/resetpassword', (req, res) => {
  res.render('pages/login/resetpassword', { layout: 'layout_login' });
});

app.get('/start', (req, res) => {
  res.render('pages/start', { layout: 'layout' });
});

app.get('/ia', (req, res) => {
  res.render('pages/ia', { layout: 'layout' });
});
app.get('/emulator', (req, res) => {
  res.render('pages/emulator', { layout: 'layout' });
});
app.get('/dashboard', (req, res) => {
  res.render('pages/dashboard', { layout: 'layout' });
});
app.get('/tracking', (req, res) => {
  res.render('pages/tracking', { layout: 'layout' });
});
app.get('/widget', (req, res) => {
  res.render('pages/widget', { layout: 'layout' });
});


app.get('/processo', (req, res) => {
  res.render('pages/posicao', { layout: 'layout' });
});
app.get('/alerta', (req, res) => {
  res.render('pages/alerta', { layout: 'layout' });
});
app.get('/interacao', (req, res) => {
  res.render('pages/interacao', { layout: 'layout' });
});

app.get('/portal_movimentacao', (req, res) => {
  res.render('pages/portal_movimentacao', { layout: 'layout' });
});
app.get('/portal_endereco', (req, res) => {
  res.render('pages/portal_endereco', { layout: 'layout' });
});
app.get('/portal_ordens_multiplas', (req, res) => {
  res.render('pages/portal_ordens_multiplas', { layout: 'layout' });
});
app.get('/portal_posicao', (req, res) => {
  res.render('pages/portal_posicao', { layout: 'layout' });
});


app.get('/rel_itens_associados', (req, res) => {
  res.render('pages/rel_itens_associados', { layout: 'layout' });
});

app.get('/rel_registros', (req, res) => {
  res.render('pages/rel_registros', { layout: 'layout' });
});

app.get('/item', (req, res) => {
  res.render('pages/item', { layout: 'layout' });
});
app.get('/categoria', (req, res) => {
  res.render('pages/categoria', { layout: 'layout' });
});
app.get('/categoria_item', (req, res) => {
  res.render('pages/categoria_item', { layout: 'layout' });
});

app.get('/importar', (req, res) => {
  res.render('pages/importar', { layout: 'layout' });
});

app.get('/localizacao', (req, res) => {
  res.render('pages/localizacao', { layout: 'layout' });
});
app.get('/gateway', (req, res) => {
  res.render('pages/gateway', { layout: 'layout' });
});
app.get('/equipamento', (req, res) => {
  res.render('pages/equipamento', { layout: 'layout' });
});

app.get('/profile', (req, res) => {
  res.render('pages/profile', { layout: 'layout' });
});

server.listen(port, () => {
    console.log(`Seal RTI Modelo > http://localhost:${port}`);
});

app.get('/site', (req, res) => {
  res.render('pages/login/login', { layout: 'layout_show' });
});

// rotas
require('./public/mongo/routes/default')(app, dbMongo);
require('./public/mongo/routes/registros')(app, dbMongo);
require('./public/mongo/routes/images')(app, dbMongo);
require('./public/mongo/routes/messages')(app, dbMongo);
require('./public/mongo/routes/sepioo')(app, dbMongo);
require('./public/mongo/routes/relatorios')(app, dbMongo);
require('./public/mongo/routes/dashboard')(app, dbMongo);
require('./public/mongo/routes/kpi')(app, dbMongo);
require('./public/mongo/routes/x_naturgy')(app, dbMongo);
require('./public/mongo/routes/x_oracle')(app, dbMongo);
require('./public/mongo/routes/x_dsv')(app, dbMongo);
require('./public/mongo/routes/x_vw')(app, dbMongo);
// require('./public/mongo/routes/xx_sync_bd')(app, dbMongo);
require('./public/mongo/routes/x_unimed')(app, dbMongo);

// require('./public/mongo/routes/auth_microsoft/api')(app, dbMongo);
// require('./public/mongo/routes/mqtt')(app, dbMongo);
// require('./public/mongo/routes/mqtt')(app, dbMongo, server);
// require('./public/mongo/routes/ble')(app, dbMongo);
// const iaRoute = require('./public/mongo/routes/ia.route');
// iaRoute(app);

fetch('https://api.ipify.org?format=json')
    .then(res => res.json())
    .then(data => {
        console.log('IP PUBLICO RAILWAY:', data.ip);
    })
    .catch(console.error);

    setInterval(() => {

      const mem = process.memoryUsage();
  
      console.log('MEMORIA SEALV4:', {
          rss: (mem.rss / 1024 / 1024).toFixed(2) + ' MB',
          heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
          heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
          external: (mem.external / 1024 / 1024).toFixed(2) + ' MB'
      });
  
  }, 60000);









