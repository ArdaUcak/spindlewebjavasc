const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const spindleFile = path.join(__dirname, 'spindle_data.csv');
const yedekFile = path.join(__dirname, 'yedek_data.csv');
const exportFile = path.join(__dirname, 'takip_export.csv');

const spindleHeaders = [
  'id',
  'Referans ID',
  'Çalışma Saati',
  'Takılı Olduğu Makine',
  'Makinaya Takıldığı Tarih',
  'Son Güncelleme'
];

const yedekHeaders = [
  'id',
  'Referans ID',
  'Açıklama',
  'Tamirde mi',
  'Bakıma Gönderilme',
  'Geri Dönme',
  'Söküldüğü Makine',
  'Sökülme Tarihi',
  'Son Güncelleme'
];

function escapeCsvValue(value = '') {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  values.push(current);
  return values;
}

function readCsv(filePath, headers) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  const lines = content.split(/\r?\n/).filter(Boolean);
  const dataLines = lines.slice(1);
  return dataLines.map((line) => {
    const values = parseCsvLine(line);
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] ?? '';
    });
    return entry;
  });
}

function writeCsv(filePath, headers, rows) {
  const headerLine = headers.map(escapeCsvValue).join(',');
  const dataLines = rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(','));
  const content = [headerLine, ...dataLines].join('\n');
  fs.writeFileSync(filePath, content, 'utf8');
}

function ensureFile(filePath, headers) {
  if (!fs.existsSync(filePath)) {
    writeCsv(filePath, headers, []);
  }
}

ensureFile(spindleFile, spindleHeaders);
ensureFile(yedekFile, yedekHeaders);

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.connection.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const safePath = path.normalize(path.join(publicDir, pathname));
  if (!safePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  let filePath = safePath;
  if (pathname === '/') {
    filePath = path.join(publicDir, 'index.html');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json'
    };
    const mime = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
    return true;
  }
  return false;
}

function getNextId(rows) {
  const ids = rows.map((row) => Number(row.id) || 0);
  const max = ids.length ? Math.max(...ids) : 0;
  return String(max + 1);
}

function timestamp() {
  return new Date().toLocaleString('tr-TR');
}

function handleLogin(req, res) {
  parseBody(req)
    .then(({ username, password }) => {
      const success = username === 'BAKIM' && password === 'MAXIME';
      if (success) {
        sendJson(res, 200, { success: true });
      } else {
        sendJson(res, 401, { success: false, message: 'Geçersiz bilgiler' });
      }
    })
    .catch(() => sendJson(res, 400, { success: false, message: 'Hatalı istek' }));
}

function filterByReferans(rows, searchTerm) {
  if (!searchTerm) return rows;
  const term = searchTerm.toLowerCase();
  return rows.filter((row) => (row['Referans ID'] || '').toLowerCase().includes(term));
}

function handleGetSpindle(req, res, search) {
  const rows = readCsv(spindleFile, spindleHeaders);
  sendJson(res, 200, filterByReferans(rows, search));
}

function handleGetYedek(req, res, search) {
  const rows = readCsv(yedekFile, yedekHeaders);
  sendJson(res, 200, filterByReferans(rows, search));
}

function handleAddSpindle(req, res) {
  parseBody(req)
    .then((body) => {
      if (!body.referansId) {
        sendJson(res, 400, { message: 'Referans ID gerekli' });
        return;
      }
      const rows = readCsv(spindleFile, spindleHeaders);
      const newRow = {
        id: getNextId(rows),
        'Referans ID': body.referansId,
        'Çalışma Saati': body.calismaSaati || '',
        'Takılı Olduğu Makine': body.makine || '',
        'Makinaya Takıldığı Tarih': body.takilmaTarihi || '',
        'Son Güncelleme': timestamp()
      };
      rows.push(newRow);
      writeCsv(spindleFile, spindleHeaders, rows);
      sendJson(res, 201, newRow);
    })
    .catch(() => sendJson(res, 400, { message: 'Hatalı istek' }));
}

function handleAddYedek(req, res) {
  parseBody(req)
    .then((body) => {
      if (!body.referansId) {
        sendJson(res, 400, { message: 'Referans ID gerekli' });
        return;
      }
      const rows = readCsv(yedekFile, yedekHeaders);
      const newRow = {
        id: getNextId(rows),
        'Referans ID': body.referansId,
        'Açıklama': body.aciklama || '',
        'Tamirde mi': body.tamirdeMi || '',
        'Bakıma Gönderilme': body.bakimaGonderilme || '',
        'Geri Dönme': body.geriDonme || '',
        'Söküldüğü Makine': body.sokulduguMakine || '',
        'Sökülme Tarihi': body.sokulmeTarihi || '',
        'Son Güncelleme': timestamp()
      };
      rows.push(newRow);
      writeCsv(yedekFile, yedekHeaders, rows);
      sendJson(res, 201, newRow);
    })
    .catch(() => sendJson(res, 400, { message: 'Hatalı istek' }));
}

function handleUpdate(req, res, type, id) {
  const isSpindle = type === 'spindle';
  const headers = isSpindle ? spindleHeaders : yedekHeaders;
  const filePath = isSpindle ? spindleFile : yedekFile;
  parseBody(req)
    .then((body) => {
      const rows = readCsv(filePath, headers);
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) {
        sendJson(res, 404, { message: 'Kayıt bulunamadı' });
        return;
      }
      if (isSpindle) {
        rows[index] = {
          ...rows[index],
          'Referans ID': body.referansId || '',
          'Çalışma Saati': body.calismaSaati || '',
          'Takılı Olduğu Makine': body.makine || '',
          'Makinaya Takıldığı Tarih': body.takilmaTarihi || '',
          'Son Güncelleme': timestamp()
        };
      } else {
        rows[index] = {
          ...rows[index],
          'Referans ID': body.referansId || '',
          'Açıklama': body.aciklama || '',
          'Tamirde mi': body.tamirdeMi || '',
          'Bakıma Gönderilme': body.bakimaGonderilme || '',
          'Geri Dönme': body.geriDonme || '',
          'Söküldüğü Makine': body.sokulduguMakine || '',
          'Sökülme Tarihi': body.sokulmeTarihi || '',
          'Son Güncelleme': timestamp()
        };
      }
      writeCsv(filePath, headers, rows);
      sendJson(res, 200, rows[index]);
    })
    .catch(() => sendJson(res, 400, { message: 'Hatalı istek' }));
}

function handleDelete(res, type, id) {
  const isSpindle = type === 'spindle';
  const headers = isSpindle ? spindleHeaders : yedekHeaders;
  const filePath = isSpindle ? spindleFile : yedekFile;
  const rows = readCsv(filePath, headers);
  const filtered = rows.filter((row) => row.id !== id);
  if (filtered.length === rows.length) {
    sendJson(res, 404, { message: 'Kayıt bulunamadı' });
    return;
  }
  writeCsv(filePath, headers, filtered);
  sendJson(res, 200, { success: true });
}

function handleExport(res) {
  const spindleRows = readCsv(spindleFile, spindleHeaders);
  const yedekRows = readCsv(yedekFile, yedekHeaders);
  const headers = ['Tablo', ...new Set([...spindleHeaders, ...yedekHeaders])];
  const combined = [
    ...spindleRows.map((row) => ({
      Tablo: 'Spindle',
      ...row
    })),
    ...yedekRows.map((row) => ({
      Tablo: 'Yedek',
      ...row
    }))
  ];
  writeCsv(exportFile, headers, combined);
  res.writeHead(200, {
    'Content-Type': 'text/csv',
    'Content-Disposition': 'attachment; filename="takip_export.csv"'
  });
  res.end(fs.readFileSync(exportFile));
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname, searchParams } = parsedUrl;

  if (req.method === 'POST' && pathname === '/login') {
    handleLogin(req, res);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/spindle') {
    handleGetSpindle(req, res, searchParams.get('search'));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/yedek') {
    handleGetYedek(req, res, searchParams.get('search'));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/spindle') {
    handleAddSpindle(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/yedek') {
    handleAddYedek(req, res);
    return;
  }

  const spindleMatch = pathname.match(/^\/api\/spindle\/(\d+)$/);
  if (spindleMatch) {
    const [, id] = spindleMatch;
    if (req.method === 'PUT') {
      handleUpdate(req, res, 'spindle', id);
      return;
    }
    if (req.method === 'DELETE') {
      handleDelete(res, 'spindle', id);
      return;
    }
  }

  const yedekMatch = pathname.match(/^\/api\/yedek\/(\d+)$/);
  if (yedekMatch) {
    const [, id] = yedekMatch;
    if (req.method === 'PUT') {
      handleUpdate(req, res, 'yedek', id);
      return;
    }
    if (req.method === 'DELETE') {
      handleDelete(res, 'yedek', id);
      return;
    }
  }

  if (req.method === 'GET' && pathname === '/api/export') {
    handleExport(res);
    return;
  }

  if (serveStatic(req, res, pathname)) {
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
