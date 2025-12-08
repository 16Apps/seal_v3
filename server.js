var express = require('express');
var expressLayouts = require('express-ejs-layouts');
var cors = require('cors');
var bodyParser = require('body-parser');
var http = require('http');

var app = express();
const port = process.env.PORT || 5000;

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

app.get('/dashboard', (req, res) => {
  res.render('pages/dashboard', { layout: 'layout' });
});

app.get('/posicao', (req, res) => {
  res.render('pages/posicao', { layout: 'layout' });
});
app.get('/alerta', (req, res) => {
  res.render('pages/alerta', { layout: 'layout' });
});
app.get('/interacao', (req, res) => {
  res.render('pages/interacao', { layout: 'layout' });
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
    console.log(`16Apps Modelo > http://localhost:${port}`);
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









