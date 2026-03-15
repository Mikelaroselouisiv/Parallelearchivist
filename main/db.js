// db.js
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import Database from 'better-sqlite3';

const appData = process.platform === 'win32'
  ? process.env.APPDATA
  : path.join(os.homedir(), 'Library', 'Application Support');

const appDir = path.join(appData, 'PMG-AutoArchivist');
const storageDir = path.join(appDir, 'storage');
const dbPath = path.join(storageDir, 'archive.db');
const configPath = path.join(appDir, 'config.json');

const DEFAULT_ARCHIVE_ROOT = path.join(appDir, 'archive');

let _db;
export function db(){ return _db; }

export async function ensureDB() {
  fs.mkdirSync(storageDir, { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL,
      filename TEXT NOT NULL,
      ext TEXT,
      size INTEGER,
      ctime INTEGER,
      mtime INTEGER,
      archived_to TEXT,
      action TEXT,
      pmg_domain TEXT,
      pmg_type TEXT,
      pmg_idseq TEXT,
      pmg_lang TEXT,
      v_major INTEGER,
      v_minor INTEGER,
      v_patch INTEGER,
      domain_label TEXT,
      type_label TEXT,
      lang_label TEXT,
      unmatched INTEGER DEFAULT 0,
      tags TEXT DEFAULT NULL,
      human_desc TEXT DEFAULT NULL,
      status TEXT DEFAULT NULL
    );
  `);
  try {
    _db.exec(`ALTER TABLE files ADD COLUMN status TEXT DEFAULT NULL`);
  } catch (_) { /* column exists */ }

  _db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      filename, path, tags, pmg_domain, pmg_type, pmg_lang,
      domain_label, type_label, lang_label, human_desc,
      content='files', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, filename, path, tags, pmg_domain, pmg_type, pmg_lang, domain_label, type_label, lang_label, human_desc)
      VALUES (new.id, new.filename, new.path, new.tags, new.pmg_domain, new.pmg_type, new.pmg_lang, new.domain_label, new.type_label, new.lang_label, new.human_desc);
    END;

    CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, filename, path, tags, pmg_domain, pmg_type, pmg_lang, domain_label, type_label, lang_label, human_desc)
      VALUES ('delete', old.id, old.filename, old.path, old.tags, old.pmg_domain, old.pmg_type, old.pmg_lang, old.domain_label, old.type_label, old.lang_label, old.human_desc);
      INSERT INTO files_fts(rowid, filename, path, tags, pmg_domain, pmg_type, pmg_lang, domain_label, type_label, lang_label, human_desc)
      VALUES (new.id, new.filename, new.path, new.tags, new.pmg_domain, new.pmg_type, new.pmg_lang, new.domain_label, new.type_label, new.lang_label, new.human_desc);
    END;

    CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, filename, path, tags, pmg_domain, pmg_type, pmg_lang, domain_label, type_label, lang_label, human_desc)
      VALUES ('delete', old.id, old.filename, old.path, old.tags, old.pmg_domain, old.pmg_type, old.pmg_lang, old.domain_label, old.type_label, old.lang_label, old.human_desc);
    END;
  `);
}

export function getArchiveRoot() {
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (data.archiveRoot && typeof data.archiveRoot === 'string') return data.archiveRoot;
  } catch (_) {}
  return DEFAULT_ARCHIVE_ROOT;
}

export function setArchiveRoot(absPath) {
  fs.mkdirSync(appDir, { recursive: true });
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_) {}
  data.archiveRoot = absPath;
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

/** Prochain IDSEQ pour (domain, type) — format 3 chiffres */
export function getNextIdSeqForDomainType(domain, type) {
  const row = _db.prepare(`
    SELECT MAX(CAST(pmg_idseq AS INTEGER)) AS maxId
    FROM files WHERE pmg_domain = @domain AND pmg_type = @type
  `).get({ domain, type });
  const next = (row?.maxId ?? 0) + 1;
  return String(next).padStart(3, '0');
}

export function insertFile(rec) {
  const stmt = _db.prepare(`
    INSERT INTO files (
      path, filename, ext, size, ctime, mtime, archived_to, action,
      pmg_domain, pmg_type, pmg_idseq, pmg_lang, v_major, v_minor, v_patch,
      domain_label, type_label, lang_label, unmatched, tags, human_desc, status
    ) VALUES (
      @path, @filename, @ext, @size, @ctime, @mtime, @archived_to, @action,
      @pmg_domain, @pmg_type, @pmg_idseq, @pmg_lang, @v_major, @v_minor, @v_patch,
      @domain_label, @type_label, @lang_label, @unmatched, @tags, @human_desc, @status
    )
  `);
  const r = { ...rec, status: rec.status ?? null };
  const info = stmt.run(r);
  return info.lastInsertRowid;
}

export function insertManualFile(absPath) {
  const st = fs.statSync(absPath);
  const rec = {
    path: absPath,
    filename: path.basename(absPath),
    ext: path.extname(absPath).toLowerCase(),
    size: st.size,
    ctime: Math.floor(st.ctimeMs),
    mtime: Math.floor(st.mtimeMs),
    archived_to: null,
    action: 'indexed',
    pmg_domain: null, pmg_type: null, pmg_idseq: null, pmg_lang: null,
    v_major: null, v_minor: null, v_patch: null,
    domain_label: null, type_label: null, lang_label: null,
    unmatched: 1,
    tags: null,
    human_desc: null,
  };
  const id = insertFile(rec);
  return { id, ...rec };
}

export function updateHumanDesc(id, text) {
  _db.prepare(`UPDATE files SET human_desc=@text WHERE id=@id`).run({ id, text });
}

export function getFileById(id) {
  return _db.prepare(`SELECT * FROM files WHERE id = @id`).get({ id });
}

export function getStats() {
  const total = _db.prepare(`SELECT COUNT(*) AS c FROM files`).get().c;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = _db.prepare(`SELECT COUNT(*) AS c FROM files WHERE mtime >= @t`).get({ t: todayStart.getTime() }).c;
  return { total, today };
}

export function queryFiles(q, filters) {
  const where = [];
  const params = {};
  if (filters.domain)      { where.push('pmg_domain = @domain'); params.domain = filters.domain; }
  if (filters.type)        { where.push('pmg_type = @type');     params.type   = filters.type;   }
  if (filters.lang)        { where.push('pmg_lang = @lang');     params.lang   = filters.lang;   }
  if (filters.ext)         { where.push('ext = @ext');           params.ext    = filters.ext.toLowerCase(); }
  if (filters.onlyMatched) { where.push('unmatched = 0'); }
  if (filters.from)        { where.push('ctime >= @from'); params.from = filters.from; }
  if (filters.to)          { where.push('ctime <= @to');   params.to   = filters.to;   }

  if (!q || q.trim() === '') {
    const sql = `SELECT * FROM files ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY mtime DESC LIMIT 500`;
    return _db.prepare(sql).all(params);
  }

  try {
    return _db.prepare(`
      SELECT f.* FROM files f
      JOIN files_fts ft ON ft.rowid = f.id
      WHERE files_fts MATCH @match
      ${where.length ? 'AND ' + where.join(' AND ') : ''}
      ORDER BY f.mtime DESC LIMIT 500
    `).all({ match: q, ...params });
  } catch {
    const likeQ = `%${q}%`;
    return _db.prepare(`
      SELECT * FROM files
      WHERE (filename LIKE @like OR path LIKE @like OR IFNULL(tags,'') LIKE @like
             OR IFNULL(domain_label,'') LIKE @like OR IFNULL(type_label,'') LIKE @like
             OR IFNULL(human_desc,'') LIKE @like)
      ${where.length ? ' AND ' + where.join(' AND ') : ''}
      ORDER BY mtime DESC LIMIT 500
    `).all({ like: likeQ, ...params });
  }
}
