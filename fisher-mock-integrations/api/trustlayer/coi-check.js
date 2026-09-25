// POST /api/trustlayer/coi-check
// Mock of TrustLayer certificate-of-insurance verification for the Fisher Industries demo.

const REQUIREMENTS = {
  general_liability_per_occurrence: 1000000,
  auto_liability: 1000000,
  workers_comp: 'Statutory',
  additional_insured: 'Fisher Industries'
};

const PROFILES = {
  'ironpeak site services': {
    status: 'Expired',
    certificate: {
      carrier: 'Desert Mutual Insurance',
      policy_number: 'GL-IP-44821',
      general_liability_per_occurrence: 1000000,
      auto_liability: 1000000,
      workers_comp: 'Statutory',
      additional_insured: true,
      expiration_date: '2026-08-31'
    },
    gaps: ['Certificate expired on 2026-08-31']
  },
  'canyon haul logistics': {
    status: 'Missing',
    certificate: null,
    gaps: ['No certificate of insurance on file']
  },
  'red mesa equipment services llc': {
    status: 'Deficient',
    certificate: {
      carrier: 'Sonoran Casualty Co.',
      policy_number: 'GL-RM-10392',
      general_liability_per_occurrence: 250000,
      auto_liability: 0,
      workers_comp: 'Statutory',
      additional_insured: false,
      expiration_date: '2027-03-31'
    },
    gaps: [
      'General liability 250,000 below required 1,000,000',
      'No automobile liability',
      'Fisher Industries not named as additional insured'
    ]
  }
};

const DEFAULT_PROFILE = {
  status: 'Compliant',
  certificate: {
    carrier: 'Southwest General Insurance',
    policy_number: 'GL-STD-00001',
    general_liability_per_occurrence: 2000000,
    auto_liability: 1000000,
    workers_comp: 'Statutory',
    additional_insured: true,
    expiration_date: '2027-12-31'
  },
  gaps: []
};

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

module.exports = async (req, res) => {
  if (!authorized(req)) return send(res, 401, { error: 'Invalid API key' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return send(res, 400, { error: 'Invalid JSON body' });
  }

  const vendorName = typeof body.vendor_name === 'string' ? body.vendor_name.trim() : '';
  if (!vendorName) return send(res, 400, { error: 'Missing fields: vendor_name' });

  const profile = PROFILES[vendorName.toLowerCase()] || DEFAULT_PROFILE;

  send(res, 200, {
    service: 'COI verification (TrustLayer mock)',
    vendor_name: vendorName,
    project_code: body.project_code ?? null,
    reference: body.reference ?? null,
    status: profile.status,
    compliant: profile.status === 'Compliant',
    requirements: REQUIREMENTS,
    certificate: profile.certificate,
    gaps: profile.gaps,
    checked_at: new Date().toISOString()
  });
};
