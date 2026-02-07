const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL || 'chifundobiziweck@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || '1234';

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function buildMultipart(fields, fileFieldName, filename, fileBuffer) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
  const nl = '\r\n';
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}${nl}`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"${nl}${nl}`));
    parts.push(Buffer.from(String(value)));
    parts.push(Buffer.from(nl));
  }

  // file part
  parts.push(Buffer.from(`--${boundary}${nl}`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="${fileFieldName}"; filename="${filename}"${nl}`));
  parts.push(Buffer.from(`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet${nl}${nl}`));
  parts.push(fileBuffer);
  parts.push(Buffer.from(nl));

  parts.push(Buffer.from(`--${boundary}--${nl}`));

  const body = Buffer.concat(parts);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  return { body, contentType };
}

async function main() {
  console.log('Logging in...');
  const login = await jsonFetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });

  if (!login.ok) {
    console.error('Login failed', login.status, login.data);
    process.exit(1);
  }

  const accessToken = login.data?.data?.accessToken || login.data?.accessToken || (login.data && login.data.accessToken) || (login.data && login.data.data && login.data.data.accessToken);
  if (!accessToken) {
    console.error('No accessToken in login response:', JSON.stringify(login.data, null, 2));
    process.exit(1);
  }
  console.log('Got access token');

  // Get seller shops
  console.log('Fetching seller shops...');
  const shopsRes = await jsonFetch(`${BASE}/api/shops/my-shops`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!shopsRes.ok) {
    console.error('Failed to fetch shops', shopsRes.status, shopsRes.data);
    process.exit(1);
  }

  const shops = shopsRes.data?.data?.shops || shopsRes.data?.shops || shopsRes.data;
  if (!shops || !shops.length) {
    console.error('No shops found for this user:', JSON.stringify(shopsRes.data, null, 2));
    process.exit(1);
  }

  const shopId = shops[0].id || shops[0].shop_id || shops[0];
  console.log('Using shopId:', shopId);

  const filePath = path.resolve(__dirname, '..', 'bulk-upload-300.xlsx');
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  const fileBuffer = fs.readFileSync(filePath);

  console.log('Uploading file with autoCommit=true...');
  const { body, contentType } = buildMultipart({ autoCommit: 'true' }, 'file', 'bulk-upload-300.xlsx', fileBuffer);

  const uploadRes = await fetch(`${BASE}/api/shops/${shopId}/products/bulk`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
      'Content-Length': String(body.length)
    },
    body
  });

  const uploadText = await uploadRes.text();
  let uploadJson;
  try { uploadJson = JSON.parse(uploadText); } catch (e) { uploadJson = uploadText; }

  console.log('Upload status:', uploadRes.status);
  console.log(JSON.stringify(uploadJson, null, 2));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
