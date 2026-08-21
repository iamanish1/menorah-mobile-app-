const { createServer } = require('http');

const createHttpServer = (app) => createServer(app);

module.exports = {
  createHttpServer
};
