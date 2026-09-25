// POST /api/ecms/subcontracts
// Mock of eCMS (Computer Guidance) subcontract creation for the Fisher Industries demo.

const REQUIRED = ['contract_number', 'vendor_name', 'project_code', 'amount'];
const DEFAULT_COST_CODE = '710.15';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const key = process.env.MOCK_API_KEY;
  return !key || req.headers['x-api-key'] === key;
}

// Works with Vercel's pre-parsed req.body and with a raw Node request stream.
async function readJson(req) {
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') body = body.trim() ? JSON.parse(body) : {};
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Body must be a JSON object');
  }
  return body;
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

// djb2 string hash -> 100..999, so the same contract always maps to the same number.
function threeDigits(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return 100 + (hash % 900);
}

module.exports = async (req, res) => {
  if (!authorized(req)) return send(res, 401, { error: 'Invalid API key' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return send(res, 400, { error: 'Invalid JSON body' });
  }

  const missing = REQUIRED.filter((field) => isBlank(body[field]));
  if (missing.length) return send(res, 400, { error: 'Missing fields: ' + missing.join(', ') });

  // ServiceNow data pills often arrive as strings, so accept "125000" as well as 125000.
  const amount = Number(body.amount);
  if (!Number.isFinite(amount)) return send(res, 400, { error: 'amount must be a number' });

  const contractNumber = String(body.contract_number).trim();
  const projectCode = String(body.project_code).trim();

  send(res, 201, {
    service: 'eCMS subcontract (mock)',
    subcontract_no: 'SC-' + projectCode + '-' + threeDigits(contractNumber),
    status: 'Created',
    job: projectCode,
    cost_code: isBlank(body.cost_code) ? DEFAULT_COST_CODE : String(body.cost_code),
    vendor_name: String(body.vendor_name).trim(),
    amount,
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    source_contract: contractNumber,
    created_at: new Date().toISOString()
  });
};
