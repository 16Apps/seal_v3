const net = require('net');
const aedes = require('aedes');

const broker = aedes();
const server = net.createServer(broker.handle);

server.listen(1883, '0.0.0.0', () => {
  console.log('MQTT ativo na porta 1883');
});