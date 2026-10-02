/**
 * 3.5.3 — Superadmin › App settings › Email sender: "sender emails" (Gmail "Send mail as" aliases of the script owner).
 *
 * What Google allows (checked 2026-10): the Gmail API calls that CREATE an alias and send its verification mail
 * (users.settings.sendAs.create / .verify, scope gmail.settings.sharing) are "only available to service account clients
 * that have been delegated domain-wide authority" — i.e. Google Workspace domains. The owner here is a consumer
 * @gmail.com account, so the app cannot add an alias itself; it is ONE manual step in Gmail settings (owner signed in).
 * Reading aliases IS allowed for the owner: GmailApp.getAliases() (verified aliases only) and users.settings.sendAs.list
 * (also shows pending ones) — both covered by the https://mail.google.com/ scope (no extra scope).
 *
 * The list of addresses the superadmin wants is kept in App Setting mail_sender_list (JSON array). "Use this sender"
 * sets mail_from only when Gmail reports the alias as verified; sendAppMail() still falls back to the script account.
 * Without the mail.google.com scope (before the one-time re-authorise) the status reads "unknown" — nothing breaks.
 */
var MS353_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
var MS353_HOWTO = 'Google only lets Workspace domains add a "Send mail as" address through the API, so this one step is done by hand: ' +
  'sign in to Gmail as the script owner › Settings (gear) › See all settings › Accounts › "Send mail as" › Add another email address › ' +
  'enter the address, tick "Treat as an alias" › Next › Send verification. Open the verification email in that inbox and click the link ' +
  '(or enter the code). Then come back here, tap Refresh, and "Use this sender".';

function ms353List() {
  var raw = String(getSetting('mail_sender_list', '') || '');
  var a = []; try { a = JSON.parse(raw || '[]'); } catch (e) { a = []; }
  return (Array.isArray(a) ? a : []).map(function (x) { return String(x || '').trim().toLowerCase(); }).filter(function (x) { return MS353_RE.test(x); })
    .filter(function (x, i, arr) { return arr.indexOf(x) === i; });
}
function ms353Owner() { try { return String(Session.getEffectiveUser().getEmail() || ''); } catch (e) { return ''; } }

/** Gmail's view of the owner's aliases. ok=false (with reason) when the scope is not authorised yet. */
function ms353Gmail() {
  var out = { ok: false, verified: [], sendAs: {}, error: '' };
  try { out.verified = (GmailApp.getAliases() || []).map(function (x) { return String(x).toLowerCase(); }); out.ok = true; }
  catch (e) { out.error = 'GmailApp: ' + String(e.message || e); }
  try {
    var res = UrlFetchApp.fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      (JSON.parse(res.getContentText()).sendAs || []).forEach(function (s) {
        if (s.isPrimary) out.primary = String(s.sendAsEmail).toLowerCase();
        out.sendAs[String(s.sendAsEmail).toLowerCase()] = { status: s.isPrimary ? 'primary' : String(s.verificationStatus || 'accepted'), name: s.displayName || '' };
      });
      out.ok = true;
    } else if (!out.ok) out.error += ' · sendAs.list HTTP ' + res.getResponseCode();
  } catch (e2) { if (!out.ok) out.error += ' · sendAs.list: ' + String(e2.message || e2); }
  return out;
}
function ms353Status(email, g) {
  if (!g.ok) return 'unknown';
  if (g.verified.indexOf(email) >= 0) return 'verified';
  var s = g.sendAs[email];
  if (s && (s.status === 'accepted' || s.status === 'primary')) return 'verified';
  if (s && s.status === 'pending') return 'pending';
  return 'not_added';
}
function ms353Payload(note) {
  var g = ms353Gmail(), from = String(getSetting('mail_from', '') || '').trim().toLowerCase();
  var list = ms353List();
  g.verified.forEach(function (x) { if (list.indexOf(x) < 0) list.push(x); }); // aliases already verified in Gmail show up too
  Object.keys(g.sendAs).forEach(function (x) { if (g.sendAs[x].status !== 'primary' && list.indexOf(x) < 0) list.push(x); });
  return { success: true, data: {
    owner: g.primary || ms353Owner(), current: from, provider: String(getSetting('mail_provider', 'auto') || 'auto'),
    gmailCheck: g.ok, gmailError: g.ok ? '' : (g.error || 'not authorised'), note: note || '',
    canCreateViaApi: false, howTo: MS353_HOWTO,
    senders: list.map(function (e) { return { email: e, status: ms353Status(e, g), current: e === from }; })
  } };
}
function ms353Super(p) { var u = v3Requester(p); if (!u || !isSuperPerm(u)) throw new Error('Superadmin only'); return u; }

function listMailSenders(p) { ms353Super(p); return ms353Payload(); }

function addMailSender(p) {
  var u = ms353Super(p);
  var e = String(p.email || '').trim().toLowerCase();
  if (!MS353_RE.test(e)) return { success: false, error: 'Enter a valid email address' };
  var owner = (ms353Gmail().primary || ms353Owner()).toLowerCase();
  if (owner && e === owner) return { success: false, error: e + ' is the script account itself — no alias needed (leave "Send from" blank)' };
  var list = ms353List(); if (list.indexOf(e) < 0) list.push(e);
  setSetting('mail_sender_list', JSON.stringify(list), u.email);
  return ms353Payload('Added ' + e + '. Google does not let the app create the Gmail alias for a @gmail.com owner — do the one manual step below, then Refresh.');
}

function removeMailSender(p) {
  var u = ms353Super(p);
  var e = String(p.email || '').trim().toLowerCase();
  if (e && e === String(getSetting('mail_from', '') || '').trim().toLowerCase()) return { success: false, error: 'This is the sender in use — switch to another sender (or the script account) first' };
  setSetting('mail_sender_list', JSON.stringify(ms353List().filter(function (x) { return x !== e; })), u.email);
  return ms353Payload('Removed ' + e + ' from the list (the Gmail alias itself is not deleted).');
}

/** Superadmin code required. email blank = send from the script account again. */
function useMailSender(p) {
  var u;
  try { u = requireSuperCode(p); } catch (eS) { return { success: false, error: eS.message, needsCode: !!eS.needsCode }; }
  var e = String(p.email || '').trim().toLowerCase();
  if (e) {
    var g = ms353Gmail();
    if (!g.ok) return { success: false, error: 'Cannot check Gmail aliases yet (the script owner has to re-authorise the app once). mail_from not changed.' };
    var st = ms353Status(e, g);
    if (st !== 'verified') return { success: false, error: e + ' is ' + (st === 'pending' ? 'still pending — click the link in its verification email first' : 'not a "Send mail as" alias of the owner yet') + '. mail_from not changed.' };
    var list = ms353List(); if (list.indexOf(e) < 0) { list.push(e); setSetting('mail_sender_list', JSON.stringify(list), u.email); }
  }
  setSetting('mail_from', e, u.email);
  var prov = String(getSetting('mail_provider', 'auto') || 'auto').toLowerCase();
  var brevo = prov === 'brevo' || (prov === 'auto' && !!mailBrevoKey());
  return ms353Payload(e ? ('Now sending from ' + e + (brevo ? ' — note: Brevo is the active provider, so switch "Send with" to Google for this to apply' : '') + '. If Gmail ever refuses it, mail falls back to the script account.')
    : 'Now sending from the script account.');
}

function routeMailSenders353(action, p) {
  var map = { listMailSenders: listMailSenders, addMailSender: addMailSender, removeMailSender: removeMailSender, useMailSender: useMailSender };
  var fn = map[action]; if (!fn) return null;
  try { return fn(p || {}); } catch (e) { return v3Err(e); }
}
