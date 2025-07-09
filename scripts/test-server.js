const http = require('http');

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      console.log('Received POST:', body);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK\n');
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Simple POST server is running.\n');
  }
});

server.listen(8080, () => {
  console.log('Listening on port 8080...');
});