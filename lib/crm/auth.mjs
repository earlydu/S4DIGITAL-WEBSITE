// CRM authentication.
//
// Real accounts in a users table, not the site admin's single shared password.
// Passwords and PINs are scrypt hashes with per-value salts. Sessions are signed
// cookies rather than rows, so they work on serverless without a session store.
//
// The PIN is a convenience lock, not a second front door. It can only re-open a
// session that already exists and has not expired: the cookie is what proves who
// you are, the PIN just unlocks the screen. A stolen PIN with no cookie is
// worthless, which is the whole point of not trusting a four digit number.

import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { first, insert, update, select, nowISO } from './db.mjs';

const COOKIE = 's4_crm';
const SESSION_MS = 12 * 60 * 60 * 1000;   // 12 hours: a working day plus slack
const LOCK_MS = 30 * 60 * 1000;           // re-ask for the PIN after 30 idle minutes

const secret = () =>
  process.env.CRM_SESSION_SECRET ||
  process.env.ADMIN_SECRET ||
  process.env.ADMIN_PASSWORD ||
  '';

export const configured = () => Boolean(secret());

/* ------------------------------------------------------------------ hashing */

const KEYLEN = 64;

export function hash(plain) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(String(plain), salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${key}`;
}

export function verify(plain, stored) {
  if (!stored || !plain) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, key] = parts;
  let candidate;
  try { candidate = scryptSync(String(plain), salt, KEYLEN).toString('hex'); } catch { return false; }
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(key, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ sessions */

const sign = value => createHmac('sha256', secret()).update(value).digest('hex');

const constantEq = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

/** userId.tokenVersion.expiry.nonce.mac */
export function makeToken(user) {
  const exp = String(Date.now() + SESSION_MS);
  const nonce = randomBytes(8).toString('hex');
  const payload = `${user.id}.${user.token_version || 0}.${exp}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

export function readToken(token) {
  if (!token || !configured()) return null;
  const parts = String(token).split('.');
  if (parts.length !== 5) return null;
  const [id, ver, exp, nonce, mac] = parts;
  if (!constantEq(mac, sign(`${id}.${ver}.${exp}.${nonce}`))) return null;
  if (Number(exp) <= Date.now()) return null;
  return { id, version: Number(ver), issuedExp: Number(exp) };
}

export function cookieHeader(token, { secure = true } = {}) {
  const bits = [
    `${COOKIE}=${token || ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    token ? `Max-Age=${Math.floor(SESSION_MS / 1000)}` : 'Max-Age=0',
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export function readCookie(header) {
  if (!header) return '';
  const hit = String(header).split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`));
  return hit ? hit.slice(COOKIE.length + 1) : '';
}

/** The signed-in user, or null. Re-reads the row so a disabled account dies at once. */
export async function currentUser(req) {
  const claim = readToken(readCookie(req.headers.cookie));
  if (!claim) return null;
  const user = await first('users', { where: [{ col: 'id', op: 'eq', val: claim.id }] });
  if (!user || !user.active) return null;
  if (Number(user.token_version || 0) !== claim.version) return null;   // signed out everywhere
  return user;
}

/** What the browser is allowed to know about a user. Never the hashes. */
export const publicUser = u => u && ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role || 'admin',
  hasPin: Boolean(u.pin_hash),
  lockMinutes: Math.floor(LOCK_MS / 60000),
});

/* ------------------------------------------------------------------ accounts */

const normEmail = e => String(e || '').trim().toLowerCase();

export const findByEmail = email =>
  first('users', { where: [{ col: 'email', op: 'eq', val: normEmail(email) }] });

export async function createUser({ email, name, password, pin, role = 'admin' }) {
  const clean = normEmail(email);
  if (!clean || !clean.includes('@')) throw new Error('A real email address is needed.');
  if (!password || String(password).length < 10) {
    throw new Error('The password must be at least 10 characters.');
  }
  if (await findByEmail(clean)) throw new Error(`${clean} already has an account.`);
  return insert('users', {
    email: clean,
    name: String(name || clean.split('@')[0]),
    password_hash: hash(password),
    pin_hash: pin ? hash(String(pin)) : null,
    role,
    token_version: 1,
    active: 1,
    updated_at: nowISO(),
  });
}

export async function setPassword(userId, password) {
  if (!password || String(password).length < 10) {
    throw new Error('The password must be at least 10 characters.');
  }
  const user = await first('users', { where: [{ col: 'id', op: 'eq', val: userId }] });
  if (!user) throw new Error('No such user.');
  // Changing the password signs every other device out.
  return update('users', userId, {
    password_hash: hash(password),
    token_version: Number(user.token_version || 0) + 1,
  });
}

export async function setPin(userId, pin) {
  if (pin === null || pin === '') return update('users', userId, { pin_hash: null });
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('The PIN must be 4 to 8 digits.');
  return update('users', userId, { pin_hash: hash(String(pin)) });
}

export const listUsers = () =>
  select('users', { order: [{ col: 'created_at', dir: 'asc' }] });

/* -------------------------------------------------------------------- login */

/** Deliberately vague on failure: never say whether the email exists. */
export async function login({ email, password }) {
  const user = await findByEmail(email);
  const ok = user && user.active && verify(password, user.password_hash);
  if (!ok) return { error: 'That email and password do not match.' };
  await update('users', user.id, { last_login_at: nowISO() });
  return { user, token: makeToken(user) };
}

export async function checkPin(user, pin) {
  if (!user || !user.pin_hash) return false;
  return verify(String(pin || ''), user.pin_hash);
}

export async function signOutEverywhere(userId) {
  const user = await first('users', { where: [{ col: 'id', op: 'eq', val: userId }] });
  if (!user) return;
  await update('users', userId, { token_version: Number(user.token_version || 0) + 1 });
}

export const anyUsers = async () => (await select('users', { limit: 1, columns: ['id'] })).length > 0;
