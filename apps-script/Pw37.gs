/* 3.7.0 (Pranav): salted, iterated SHA-256 passwords. Stored as 'h1$<iter>$<salt>$<hex>' in Users.password.
 * Plain-text values still sign in once and are re-saved hashed (pwUpgradeOnLogin_); pwMigrateAll() hashes the rest. */
var PW_ITER = 200;
function pwHex_(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) { var b = bytes[i] & 255; s += (b < 16 ? '0' : '') + b.toString(16); } return s; }
function pwDigest_(salt, plain, iter) {
  var h = pwHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + plain, Utilities.Charset ? Utilities.Charset.UTF_8 : undefined));
  for (var i = 1; i < iter; i++) h = pwHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset ? Utilities.Charset.UTF_8 : undefined));
  return h;
}
function pwIsHashed(stored) { return /^h1\$\d+\$[0-9a-f]+\$[0-9a-f]{64}$/.test(String(stored || '')); }
function pwHash(plain) {
  plain = String(plain || '');
  if (!plain || pwIsHashed(plain)) return plain;
  var salt = Utilities.getUuid().replace(/-/g, '');
  return 'h1$' + PW_ITER + '$' + salt + '$' + pwDigest_(salt, plain, PW_ITER);
}
/** Constant-time-ish compare. Accepts legacy plain text (until migrated). */
function pwCheck(stored, plain) {
  stored = String(stored || ''); plain = String(plain || '');
  if (!stored || !plain) return false;
  var want = stored, got = plain;
  if (pwIsHashed(stored)) { var p = stored.split('$'); want = p[3]; got = pwDigest_(p[2], plain, Number(p[1]) || PW_ITER); }
  if (want.length !== got.length) return false;
  var d = 0; for (var i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}
/** After a successful legacy sign-in: store the hash. Returns the stored value now in use. */
function pwUpgradeOnLogin_(u, plain) {
  if (!u || pwIsHashed(u.password)) return u && u.password;
  var h = pwHash(plain);
  try { updateRowById('Users', u.id, { password: h }); u.password = h; } catch (e) {}
  return u.password;
}
/** One-off (Run in the editor, or superadmin action): hash every plain-text password. Resumable; never logs a password. */
function pwMigrateAll(p) {
  if (p && p.requesterEmail !== undefined) { var r = getRequester(p); if (!r || !isSuperPerm(r)) return { success: false, error: 'Superadmin only' }; }
  var started = Date.now(), done = 0, left = 0;
  sheetToObjects('Users').forEach(function (u) {
    var v = String(u.password || '');
    if (!v || pwIsHashed(v)) return;
    if (Date.now() - started > 240000) { left++; return; }
    updateRowById('Users', u.id, { password: pwHash(v) }); done++;
  });
  if (typeof scBump === 'function') { try { scBump('users'); } catch (e) {} }
  return { success: true, data: { hashed: done, plainLeft: left, message: left ? 'Run again to finish' : 'No plain-text passwords left' } };
}
function pwPlainCount() { var rows = sheetToObjects('Users'); return rows.filter(function (u) { return u.password && !pwIsHashed(u.password); }).length; }
