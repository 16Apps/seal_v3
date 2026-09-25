require('dotenv').config();

var express = require('express');
var expressLayouts = require('express-ejs-layouts');
var cors = require('cors');
var bodyParser = require('body-parser');
var http = require('http');
const socketio = require('socket.io');

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
// Ao conectar
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Presence do portal_movimentacao: room portal:{id_conta}
  socket.on('portal_join', (data) => {
    const idConta = data && (data.id_conta || data.idConta);
    if (!idConta) return;
    const room = 'portal:' + String(idConta);
    socket.join(room);
    console.log('[portal_join]', socket.id, room);
  });

  socket.on('portal_leave', (data) => {
    const idConta = data && (data.id_conta || data.idConta);
    if (!idConta) return;
    const room = 'portal:' + String(idConta);
    socket.leave(room);
    console.log('[portal_leave]', socket.id, room);
  });
});

app.set('io', io); // opcional, para acessar no controller

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
const iaRoute = require('./public/mongo/routes/ia.route');
iaRoute(app);









