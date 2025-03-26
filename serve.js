const express = require('express');

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use(express.static('public'));
app.use('/dist', express.static('dist'));
app.listen(9988, () => {
  console.error('listening on port 9988');
});
