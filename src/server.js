require('dotenv').config({ quiet: true });

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const { registerSockets } = require('./sockets');
const { programarRespaldos } = require('./services/respaldo.service');
const { setIo } = require('./services/notificacion.service');
const { programarRecordatorios } = require('./services/recordatorio.service');

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN },
});

app.set('io', io);
setIo(io);
registerSockets(io);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  programarRespaldos();
  programarRecordatorios();
});
