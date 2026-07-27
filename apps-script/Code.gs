const DASHBOARDS = {
  ventas: {
    sheetName: 'Ventas',
    readRange: 'A1:Z500',
    writeRanges: ['F2:F100'],
  },
  inventarios: {
    sheetName: 'Inventarios',
    readRange: 'A1:Z500',
    writeRanges: ['F2:F100'],
  },
  produccion: {
    sheetName: 'Produccion',
    readRange: 'A1:Z500',
    writeRanges: ['F2:F100'],
  },
};

const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;
const NONCE_TTL_SECONDS = 300;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ ok: false, error: 'Missing request body.' });
    }

    const envelope = JSON.parse(e.postData.contents);
    verifyEnvelope_(envelope);

    const payload = JSON.parse(envelope.body);
    if (!payload || typeof payload.action !== 'string') {
      throw new Error('Invalid action.');
    }

    if (payload.action === 'getDashboard') {
      return getDashboard_(payload);
    }

    if (payload.action === 'updateDashboard') {
      return updateDashboard_(payload);
    }

    throw new Error('Unsupported action.');
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : 'Unhandled Apps Script error.',
    });
  }
}

function verifyEnvelope_(envelope) {
  if (!envelope || !envelope.timestamp || !envelope.nonce || !envelope.body || !envelope.signature) {
    throw new Error('Incomplete signed request.');
  }

  const timestamp = Number(envelope.timestamp);
  if (!isFinite(timestamp)) {
    throw new Error('Invalid timestamp.');
  }

  if (Math.abs(Date.now() - timestamp) > MAX_REQUEST_AGE_MS) {
    throw new Error('Expired request.');
  }

  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty('APPS_SCRIPT_SECRET');
  if (!secret) {
    throw new Error('APPS_SCRIPT_SECRET is not configured in Script Properties.');
  }

  const cache = CacheService.getScriptCache();
  const nonceKey = 'nonce:' + String(envelope.nonce);
  if (cache.get(nonceKey)) {
    throw new Error('Replay detected.');
  }

  const signedPayload = String(envelope.timestamp) + '.' + String(envelope.nonce) + '.' + String(envelope.body);
  const expectedSignature = hmacHex_(signedPayload, secret);

  if (!constantTimeEqual_(expectedSignature, String(envelope.signature).toLowerCase())) {
    throw new Error('Invalid signature.');
  }

  cache.put(nonceKey, '1', NONCE_TTL_SECONDS);
}

function getDashboard_(payload) {
  const config = getDashboardConfig_(payload.dashboardId);
  const sheet = getSheet_(config.sheetName);
  const values = sheet.getRange(config.readRange).getDisplayValues();

  return jsonResponse_({
    ok: true,
    data: values,
  });
}

function updateDashboard_(payload) {
  const config = getDashboardConfig_(payload.dashboardId);
  const requestedRange = String(payload.range || '').trim();

  if (!requestedRange || requestedRange.indexOf('!') !== -1) {
    throw new Error('Invalid range.');
  }

  const sheet = getSheet_(config.sheetName);
  const range = sheet.getRange(requestedRange);

  if (!isAllowedRange_(sheet, range, config.writeRanges || [])) {
    throw new Error('Range is not authorized for updates.');
  }

  if (!Array.isArray(payload.values)) {
    throw new Error('Values must be an array.');
  }

  const values = normalizeValues_(payload.values);
  if (values.length !== range.getNumRows()) {
    throw new Error('Row count does not match the requested range.');
  }

  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    if (!Array.isArray(values[rowIndex]) || values[rowIndex].length !== range.getNumColumns()) {
      throw new Error('Column count does not match the requested range.');
    }
  }

  const oldValues = range.getValues();
  range.setValues(values);

  return jsonResponse_({
    ok: true,
    oldValues: oldValues,
    data: {
      dashboardId: payload.dashboardId,
      updatedRange: range.getA1Notation(),
      rows: range.getNumRows(),
      columns: range.getNumColumns(),
    },
  });
}

function getDashboardConfig_(dashboardId) {
  const id = String(dashboardId || '').trim();
  const config = DASHBOARDS[id];
  if (!config) {
    throw new Error('Unknown dashboard.');
  }
  return config;
}

function getSheet_(sheetName) {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID is not configured in Script Properties.');
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Configured sheet was not found: ' + sheetName);
  }

  return sheet;
}

function isAllowedRange_(sheet, requestedRange, allowedRanges) {
  return allowedRanges.some(function (allowedA1) {
    const allowed = sheet.getRange(allowedA1);

    const requestedFirstRow = requestedRange.getRow();
    const requestedLastRow = requestedFirstRow + requestedRange.getNumRows() - 1;
    const requestedFirstColumn = requestedRange.getColumn();
    const requestedLastColumn = requestedFirstColumn + requestedRange.getNumColumns() - 1;

    const allowedFirstRow = allowed.getRow();
    const allowedLastRow = allowedFirstRow + allowed.getNumRows() - 1;
    const allowedFirstColumn = allowed.getColumn();
    const allowedLastColumn = allowedFirstColumn + allowed.getNumColumns() - 1;

    return requestedFirstRow >= allowedFirstRow &&
      requestedLastRow <= allowedLastRow &&
      requestedFirstColumn >= allowedFirstColumn &&
      requestedLastColumn <= allowedLastColumn;
  });
}

function normalizeValues_(values) {
  if (values.length === 0) return [];
  if (Array.isArray(values[0])) return values;
  return values.map(function (value) { return [value]; });
}

function hmacHex_(message, secret) {
  const bytes = Utilities.computeHmacSha256Signature(message, secret);
  return bytes.map(function (byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function constantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
