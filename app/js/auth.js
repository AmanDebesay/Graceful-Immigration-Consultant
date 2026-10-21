// Sign-in, password set/reset (from invite & recovery links) and two-factor challenge screens.
import { db, esc, fail } from './core.js';

const root = () => document.getElementById('app');
const appUrl = () => location.origin + location.pathname;

function frame(inner) {
  root().innerHTML = `<div class="auth">
    <div class="auth-art">
      <div class="brand"><img src="../public/img/logo-emblem.png" alt=""><b>Graceful</b></div>
      <div><h2>Practice management for Graceful Immigration</h2>
        <p>Assessments, clients, agreements and finances, all in one secure place hosted in Canada.</p></div>
      <small style="color:rgba(255,255,255,.55)">Authorized users only. Activity is logged.</small>
    </div>
    <div class="auth-form"><div class="auth-box">${inner}</div></div>
  </div>`;
}
const err = (msg) => { const b = document.getElementById('authMsg'); b.className = 'alert err'; b.textContent = msg; b.hidden = false; };
const ok = (msg) => { const b = document.getElementById('authMsg'); b.className = 'alert ok'; b.textContent = msg; b.hidden = false; };

export function showLogin(message) {
  frame(`<h1>Welcome back</h1><p>Sign in to your Graceful account.</p>
    <div id="authMsg" class="alert" hidden></div>
    <form id="loginForm">
      <div class="field"><label for="em">Email</label><input class="input" id="em" type="email" autocomplete="email" required></div>
      <div class="field"><label for="pw">Password</label><input class="input" id="pw" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary" type="submit">Sign in</button>
    </form>
    <div class="auth-links"><a href="#" id="forgot">Forgot password?</a><a href="../public/index.html">Back to website</a></div>`);
  if (message) ok(message);
  document.getElementById('forgot').onclick = (e) => { e.preventDefault(); showForgot(); };
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    const { error } = await db.auth.signInWithPassword({ email: em.value.trim(), password: pw.value });
    btn.disabled = false;
    if (error) return err(error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message);
    location.hash = '#/';
    window.dispatchEvent(new Event('auth-changed'));
  };
}

function showForgot() {
  frame(`<h1>Reset password</h1><p>We'll email you a link to set a new password.</p>
    <div id="authMsg" class="alert" hidden></div>
    <form id="fForm"><div class="field"><label for="em">Email</label><input class="input" id="em" type="email" required></div>
    <button class="btn btn-primary" type="submit">Send reset link</button></form>
    <div class="auth-links"><a href="#" id="back">Back to sign in</a></div>`);
  document.getElementById('back').onclick = (e) => { e.preventDefault(); showLogin(); };
  document.getElementById('fForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    const { error } = await db.auth.resetPasswordForEmail(em.value.trim(), { redirectTo: appUrl() });
    btn.disabled = false;
    if (error) return err(error.message);
    ok('If an account exists for that email, a reset link is on its way. Check your inbox.');
  };
}

export function showSetPassword(kind) {
  frame(`<h1>${kind === 'invite' ? 'Welcome to Graceful' : 'Choose a new password'}</h1>
    <p>${kind === 'invite' ? 'Set a password to activate your account.' : 'Enter a new password for your account.'}</p>
    <div id="authMsg" class="alert" hidden></div>
    <form id="spForm">
      <div class="field"><label for="p1">New password</label><input class="input" id="p1" type="password" autocomplete="new-password" required minlength="10"></div>
      <div class="field"><label for="p2">Confirm password</label><input class="input" id="p2" type="password" autocomplete="new-password" required></div>
      <p style="font-size:12.5px;color:var(--muted);margin:-4px 0 14px">At least 10 characters, with upper and lower case letters and a number.</p>
      <button class="btn btn-primary" type="submit">Save password</button>
    </form>`);
  document.getElementById('spForm').onsubmit = async (e) => {
    e.preventDefault();
    if (p1.value !== p2.value) return err('The passwords do not match.');
    if (!/[a-z]/.test(p1.value) || !/[A-Z]/.test(p1.value) || !/\d/.test(p1.value) || p1.value.length < 10) {
      return err('Use at least 10 characters with upper and lower case letters and a number.');
    }
    const btn = e.target.querySelector('button'); btn.disabled = true;
    const { error } = await db.auth.updateUser({ password: p1.value });
    btn.disabled = false;
    if (error) return err(error.message);
    sessionStorage.removeItem('gi_auth_kind');
    location.hash = '#/';
    window.dispatchEvent(new Event('auth-changed'));
  };
}

export function showLinkError(desc) {
  showLogin();
  err(/expired|invalid/i.test(desc) ? 'That link has expired or was already used. Ask an administrator for a new invite, or use "Forgot password?".' : desc);
}

/** Shows the 6-digit code screen; resolves once the session reaches aal2. */
export function showMfaChallenge(factorId) {
  frame(`<h1>Two-step verification</h1><p>Enter the 6-digit code from your authenticator app.</p>
    <div id="authMsg" class="alert" hidden></div>
    <form id="mfaForm"><div class="field"><input class="input otp" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
    <button class="btn btn-primary" type="submit">Verify</button></form>
    <div class="auth-links"><a href="#" id="out">Use a different account</a></div>`);
  document.getElementById('out').onclick = async (e) => { e.preventDefault(); await db.auth.signOut(); showLogin(); };
  document.getElementById('code').focus();
  document.getElementById('mfaForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const { data: ch, error: e1 } = await db.auth.mfa.challenge({ factorId });
      if (e1) throw e1;
      const { error: e2 } = await db.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.value.trim() });
      if (e2) throw e2;
      window.dispatchEvent(new Event('auth-changed'));
    } catch (x) { err(x.message?.includes('Invalid') ? 'That code is not correct. Try the newest code.' : x.message); }
    finally { btn.disabled = false; }
  };
}

export { esc, fail };
