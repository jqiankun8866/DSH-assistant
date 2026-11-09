import { DatabaseSync } from 'node:sqlite';

const minute = 60_000;
function check(ok, message) { if (!ok) throw new Error(message); }
function time(value) { check(/^([01]\d|2[0-3]):[0-5]\d$/.test(value), '时间须为 HH:mm'); return value; }
function local(ms, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(ms).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}` };
}
export function quietAt(ms, profile) {
  if (!profile.quiet) return false;
  const hm = local(ms, profile.timeZone).hm;
  const { start, end } = profile.quiet;
  return start < end ? hm >= start && hm < end : hm >= start || hm < end;
}
// Search actual UTC instants: nonexistent DST wall times are skipped; repeated wall times use the first.
export function nextDaily(after, hm, zone, excludedDay) {
  time(hm);
  for (let ms = Math.floor(after / minute) * minute + minute; ms <= after + 3 * 86_400_000; ms += minute) {
    const p = local(ms, zone);
    if (p.hm === hm && p.day !== excludedDay) return ms;
  }
  throw new Error('未找到下一次执行时间');
}
function validateProfile(p) {
  check(typeof p.timeZone === 'string', '需要时区');
  local(Date.now(), p.timeZone);
  check(typeof p.enabled === 'boolean' && typeof p.inactivityEnabled === 'boolean', '需要主动联系开关');
  check(Number.isFinite(p.inactivityMs) && p.inactivityMs >= minute, '闲聊间隔至少一分钟');
  check(Number.isInteger(p.dailyLimit) && p.dailyLimit >= 1 && p.dailyLimit <= 20, '每日限额应为 1–20');
  check(Number.isFinite(p.minGapMs) && p.minGapMs >= 0, '消息间隔无效');
  check(['concise', 'normal'].includes(p.length), '篇幅无效');
  check(['plain', 'warm'].includes(p.tone), '语气无效');
  check(typeof p.nickname === 'string' && p.nickname.length <= 40, '称呼无效');
  if (p.quiet) { time(p.quiet.start); time(p.quiet.end); check(p.quiet.start !== p.quiet.end, '免打扰起止不能相同'); }
  if (p.location) {
    check(typeof p.location.name === 'string' && p.location.name.length > 0, '需要城市名');
    check(Number.isFinite(p.location.latitude) && Math.abs(p.location.latitude) <= 90, '纬度无效');
    check(Number.isFinite(p.location.longitude) && Math.abs(p.location.longitude) <= 180, '经度无效');
  }
}
export const defaultProfile = () => ({
  timeZone: 'Asia/Shanghai', enabled: false, inactivityEnabled: false,
  inactivityMs: 86_400_000, quiet: null, dailyLimit: 3, minGapMs: 30 * minute,
  nickname: '', tone: 'plain', length: 'concise', location: null,
});

export class Assistant {
  constructor({ path = ':memory:', send, weather, report, now = Date.now }) {
    check(typeof send === 'function', '需要发送适配器');
    this.send = send; this.weather = weather; this.report = report; this.now = now;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS profiles(peer TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS activity(peer TEXT PRIMARY KEY, lastInbound INTEGER, generation INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS native_deliveries(messageId TEXT PRIMARY KEY,peer TEXT NOT NULL,state TEXT NOT NULL,text TEXT,error TEXT,updated INTEGER NOT NULL);`);
  }
  close() { this.db.close(); }
  profile(peer) { const r = this.db.prepare('SELECT data FROM profiles WHERE peer=?').get(peer); return r ? JSON.parse(r.data) : defaultProfile(); }
  configure(peer, patch) {
    check(typeof peer === 'string' && peer.length > 0, '需要账号与会话组成的 peer');
    const allowed = Object.keys(defaultProfile());
    check(Object.keys(patch).every(k => allowed.includes(k)), '未知档案字段');
    const p = { ...this.profile(peer), ...patch }; validateProfile(p);
    this.db.prepare('INSERT OR REPLACE INTO profiles VALUES (?,?)').run(peer, JSON.stringify(p));
    return p;
  }
  inbound(peer) {
    this.db.prepare(`INSERT INTO activity VALUES (?,?,1) ON CONFLICT(peer) DO UPDATE
      SET lastInbound=excluded.lastInbound,generation=generation+1`).run(peer, this.now());
  }
  forget(peer) {
    this.db.exec('BEGIN IMMEDIATE');
    try {for (const table of ['profiles','activity','native_deliveries']) this.db.prepare(`DELETE FROM ${table} WHERE peer=?`).run(peer);this.db.exec('COMMIT')}
    catch(e){this.db.exec('ROLLBACK');throw e}
  }
}
