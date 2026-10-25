import { db, state, esc, icon, toast, fail, modal, confirmBox, ROLE_LABEL, avatarHtml } from '../core.js';

export async function render(el) {
  const p = state.profile;
  const { data: factors } = await db.auth.mfa.listFactors();
  const totp = (factors?.totp || []).filter((f) => f.status === 'verified');

  el.innerHTML = `<div class="grid g-2" style="max-width:1000px">
    <div class="card"><div class="card-h"><h3>Profile</h3><span class="badge plain b-navy">${ROLE_LABEL[p.role]}</span></div>
      <div class="card-b photo-row">
        <span id="bigAv">${avatarHtml(p, 'avatar xl')}</span>
        <div><b>Profile photo</b><p class="dk-muted" style="margin:2px 0 10px">Shown on your profile in the top right of the dashboard. A clear head-and-shoulders photo works best.</p>
          <div class="row"><label class="btn btn-gold btn-sm">${icon('camera')} ${p.avatar_url ? 'Change photo' : 'Upload photo'}<input type="file" id="ph0" accept="image/jpeg,image/png,image/webp" hidden></label>
          ${p.avatar_url ? '<button class="btn btn-sm" id="rmPh" type="button">Remove</button>' : ''}</div></div></div>
      <form class="card-b" id="pf" style="border-top:1px solid var(--line)">
        <div class="field"><label>Full name</label><input class="input" id="n" value="${esc(p.full_name)}"></div>
        <div class="field"><label>Email</label><input class="input" value="${esc(p.email)}" disabled></div>
        <div class="row-2"><div class="field"><label>Phone</label><input class="input" id="ph" value="${esc(p.phone || '')}"></div>
        <div class="field"><label>Job title (shown under your name)</label><input class="input" id="jt" value="${esc(p.job_title || '')}" placeholder="e.g. RCIC – IRB"></div></div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">Save profile</button></div>
      </form></div>
    <div class="grid">
      <div class="card"><div class="card-h"><h3>Two-step verification</h3>${totp.length ? '<span class="badge b-GREEN">On</span>' : '<span class="badge b-AMBER">Off</span>'}</div>
        <div class="card-b">${totp.length
          ? `<p style="margin-bottom:14px">Your account asks for a code from your authenticator app each time you sign in.</p><button class="btn btn-danger" id="mfaOff">Turn off</button>`
          : `<p style="margin-bottom:14px">Protect client data: require a 6-digit code from an app like Microsoft Authenticator or Google Authenticator when you sign in. Strongly recommended for everyone with access to client files.</p>
             <button class="btn btn-gold" id="mfaOn">${icon('lock')} Turn on two-step verification</button>`}</div></div>
      <div class="card"><div class="card-h"><h3>Password</h3></div><form class="card-b" id="pw">
        <div class="field"><label>New password</label><input class="input" type="password" id="p1" autocomplete="new-password"></div>
        <div class="field"><label>Confirm new password</label><input class="input" type="password" id="p2" autocomplete="new-password"></div>
        <div class="row" style="justify-content:flex-end"><button class="btn" type="submit">Change password</button></div></form></div>
    </div></div>`;

  el.querySelector('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const patch = { full_name: el.querySelector('#n').value.trim(), phone: el.querySelector('#ph').value.trim() || null, job_title: el.querySelector('#jt').value.trim() || null };
    const { error } = await db.from('profiles').update(patch).eq('id', p.id);
    if (error) return fail(error);
    Object.assign(state.profile, patch); toast('Profile saved');
    window.dispatchEvent(new Event('profile-changed'));
  };

  const setAvatar = async (url) => {
    const { error } = await db.from('profiles').update({ avatar_url: url }).eq('id', p.id);
    if (error) throw error;
    state.profile.avatar_url = url;
    window.dispatchEvent(new Event('profile-changed'));
    render(el);
  };
  el.querySelector('#ph0').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('That image is too large. Choose one under 15 MB.');
      const blob = await squareJpeg(file, 400);
      const path = `${p.id}/avatar-${Date.now()}.jpg`;
      const { error } = await db.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (error) throw error;
      const old = p.avatar_url;
      await setAvatar(db.storage.from('avatars').getPublicUrl(path).data.publicUrl);
      const oldPath = old && old.split('/avatars/')[1];
      if (oldPath && oldPath.startsWith(p.id + '/')) db.storage.from('avatars').remove([oldPath]);
      toast('Photo updated');
    } catch (err) { fail(err); }
  };
  el.querySelector('#rmPh')?.addEventListener('click', async () => {
    try {
      const oldPath = p.avatar_url.split('/avatars/')[1];
      await setAvatar(null);
      if (oldPath && oldPath.startsWith(p.id + '/')) db.storage.from('avatars').remove([oldPath]);
      toast('Photo removed');
    } catch (err) { fail(err); }
  });
  el.querySelector('#pw').onsubmit = async (e) => {
    e.preventDefault();
    const a = el.querySelector('#p1').value, b = el.querySelector('#p2').value;
    if (a !== b) return fail(new Error('The passwords do not match.'));
    if (a.length < 10 || !/[a-z]/.test(a) || !/[A-Z]/.test(a) || !/\d/.test(a)) return fail(new Error('Use at least 10 characters with upper and lower case letters and a number.'));
    const { error } = await db.auth.updateUser({ password: a });
    if (error) return fail(error);
    e.target.reset(); toast('Password changed');
  };
  el.querySelector('#mfaOff')?.addEventListener('click', async () => {
    if (!(await confirmBox('Turn off two-step verification', 'Your account will only be protected by your password.', 'Turn off', true))) return;
    for (const f of totp) { const { error } = await db.auth.mfa.unenroll({ factorId: f.id }); if (error) return fail(error); }
    toast('Two-step verification turned off'); render(el);
  });
  el.querySelector('#mfaOn')?.addEventListener('click', async () => {
    // Remove abandoned, unverified enrolments first
    for (const f of (factors?.all || []).filter((x) => x.status !== 'verified')) await db.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Graceful ${Date.now()}` });
    if (error) return fail(error);
    modal({
      title: 'Set up two-step verification',
      body: `<ol style="margin-left:18px;line-height:1.7"><li>Open your authenticator app and add an account.</li><li>Scan this QR code (or enter the key below).</li><li>Type the 6-digit code it shows.</li></ol>
        <div class="qr"><img src="${data.totp.qr_code}" alt="QR code"></div>
        <p style="font-size:12px;color:var(--muted);text-align:center;word-break:break-all">Key: ${esc(data.totp.secret)}</p>
        <div class="field" style="margin-top:12px"><label>6-digit code</label><input class="input otp" id="code" inputmode="numeric" maxlength="6"></div>`,
      actions: [{ label: 'Cancel', onClick: async () => { await db.auth.mfa.unenroll({ factorId: data.id }); } },
        { label: 'Verify & turn on', cls: 'btn-primary', onClick: async (m) => {
          const { data: ch, error: e1 } = await db.auth.mfa.challenge({ factorId: data.id }); if (e1) throw e1;
          const { error: e2 } = await db.auth.mfa.verify({ factorId: data.id, challengeId: ch.id, code: m.querySelector('#code').value.trim() });
          if (e2) throw new Error('That code is not correct. Try the newest code.');
          toast('Two-step verification is on'); render(el);
        } }],
    });
  });
}

/** Centre-crops an image file to a square JPEG of the given size. */
function squareJpeg(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height), c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that image.'))), 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read.')); };
    img.src = url;
  });
}
