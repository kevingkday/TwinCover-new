const DEFAULT_SECRET_KEY = 'twincover-production-secret-key-super-secure-change-in-prod-2026';
const DEFAULT_GOOGLE_CLIENT_ID = '298609254625-5mda01igci6vn3r9askeroa136blm58c.apps.googleusercontent.com';
const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse(detail, status = 400) {
  return jsonResponse({ detail }, status);
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2_sha256$${iterations}$${toHex(salt)}$${toHex(new Uint8Array(derived))}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('pbkdf2_sha256$')) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  if (!iterations || salt.length === 0 || expected.length === 0) return false;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    expected.length * 8
  );
  return timingSafeEqual(new Uint8Array(derived), expected);
}

async function getHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const fullPayload = { ...payload, exp };
  const enc = new TextEncoder();
  const headerB64 = toBase64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  return `${signingInput}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const key = await getHmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

function serializeUser(row) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name || '',
    agency_name: row.agency_name || 'TwinCover Commercial Advisors',
    created_at: row.created_at,
  };
}

async function requireAuthUser(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  const secret = env.SECRET_KEY || DEFAULT_SECRET_KEY;
  const payload = await verifyJwt(token, secret);
  if (!payload?.sub) {
    return null;
  }
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(payload.sub).first();
  return row || null;
}

async function handleRegister(request, env) {
  const body = await request.json().catch(() => null);
  const email = (body?.email || '').trim().toLowerCase();
  const password = body?.password || '';
  if (!email || !email.includes('@')) {
    return errorResponse('Valid email is required', 422);
  }
  if (password.length < 6) {
    return errorResponse('Password must be at least 6 characters', 422);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return errorResponse('A user with this email already exists', 400);
  }

  const fullName = (body?.full_name || '').trim() || email.split('@')[0];
  const agencyName = (body?.agency_name || '').trim() || 'TwinCover Commercial Advisors';
  const hashedPassword = await hashPassword(password);

  await env.DB.prepare(
    'INSERT INTO users (email, hashed_password, full_name, agency_name) VALUES (?, ?, ?, ?)'
  ).bind(email, hashedPassword, fullName, agencyName).run();

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const secret = env.SECRET_KEY || DEFAULT_SECRET_KEY;
  const accessToken = await signJwt({ sub: user.email, user_id: user.id }, secret);

  return jsonResponse({
    access_token: accessToken,
    token_type: 'bearer',
    user: serializeUser(user),
  }, 201);
}

async function handleLogin(request, env) {
  const body = await request.json().catch(() => null);
  const email = (body?.email || '').trim().toLowerCase();
  const password = body?.password || '';
  if (!email || !password) {
    return errorResponse('Email and password are required', 422);
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user || !(await verifyPassword(password, user.hashed_password))) {
    return errorResponse('Incorrect email or password', 401);
  }

  const secret = env.SECRET_KEY || DEFAULT_SECRET_KEY;
  const accessToken = await signJwt({ sub: user.email, user_id: user.id }, secret);

  return jsonResponse({
    access_token: accessToken,
    token_type: 'bearer',
    user: serializeUser(user),
  });
}

async function handleGoogle(request, env) {
  const body = await request.json().catch(() => null);
  const credential = body?.credential;
  if (!credential) {
    return errorResponse('Missing Google credential', 422);
  }

  const tokenInfoResp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );
  if (!tokenInfoResp.ok) {
    return errorResponse('Invalid Google credential', 401);
  }

  const payload = await tokenInfoResp.json();
  const expectedClientId = env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
  if (expectedClientId && payload.aud !== expectedClientId) {
    return errorResponse('Google token audience mismatch', 401);
  }

  const email = (payload.email || '').trim().toLowerCase();
  const emailVerified = String(payload.email_verified || '').toLowerCase() === 'true';
  if (!email || !emailVerified) {
    return errorResponse('Google account email is not verified', 401);
  }

  let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) {
    const randomPw = toHex(crypto.getRandomValues(new Uint8Array(24)));
    const hashedPassword = await hashPassword(randomPw);
    const fullName = (payload.name || '').trim() || email.split('@')[0];
    const agencyName = (body?.agency_name || '').trim() || 'TwinCover Commercial Advisors';

    await env.DB.prepare(
      'INSERT INTO users (email, hashed_password, full_name, agency_name) VALUES (?, ?, ?, ?)'
    ).bind(email, hashedPassword, fullName, agencyName).run();

    user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  } else if (!user.full_name && payload.name) {
    await env.DB.prepare(
      'UPDATE users SET full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(payload.name.trim(), user.id).run();
    user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  }

  const secret = env.SECRET_KEY || DEFAULT_SECRET_KEY;
  const accessToken = await signJwt({ sub: user.email, user_id: user.id }, secret);

  return jsonResponse({
    access_token: accessToken,
    token_type: 'bearer',
    user: serializeUser(user),
  });
}

async function handleGetMe(request, env) {
  const user = await requireAuthUser(request, env);
  if (!user) {
    return errorResponse('Could not validate credentials', 401);
  }
  return jsonResponse(serializeUser(user));
}

async function handlePatchMe(request, env) {
  const user = await requireAuthUser(request, env);
  if (!user) {
    return errorResponse('Could not validate credentials', 401);
  }

  const body = await request.json().catch(() => null);
  let nextFullName = user.full_name;
  let nextAgencyName = user.agency_name;

  if (body && Object.prototype.hasOwnProperty.call(body, 'full_name') && body.full_name !== null) {
    const cleaned = String(body.full_name).trim();
    if (!cleaned) {
      return errorResponse('Value cannot be blank', 422);
    }
    nextFullName = cleaned;
  }

  if (body && Object.prototype.hasOwnProperty.call(body, 'agency_name') && body.agency_name !== null) {
    const cleaned = String(body.agency_name).trim();
    if (!cleaned) {
      return errorResponse('Value cannot be blank', 422);
    }
    nextAgencyName = cleaned;
  }

  await env.DB.prepare(
    'UPDATE users SET full_name = ?, agency_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(nextFullName, nextAgencyName, user.id).run();

  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  return jsonResponse(serializeUser(updated));
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (!env.DB) {
    return errorResponse("Cloudflare D1 binding 'DB' is not configured", 500);
  }

  const rawPath = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  const route = rawPath.replace(/^\/+|\/+$/g, '');

  try {
    if (route === 'register' && request.method === 'POST') {
      return await handleRegister(request, env);
    }
    if (route === 'login' && request.method === 'POST') {
      return await handleLogin(request, env);
    }
    if (route === 'google' && request.method === 'POST') {
      return await handleGoogle(request, env);
    }
    if (route === 'me' && request.method === 'GET') {
      return await handleGetMe(request, env);
    }
    if (route === 'me' && request.method === 'PATCH') {
      return await handlePatchMe(request, env);
    }
    return errorResponse('Auth endpoint not found', 404);
  } catch (err) {
    return errorResponse(err?.message || 'Authentication service error', 500);
  }
}
