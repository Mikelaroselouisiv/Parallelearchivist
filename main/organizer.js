// organizer.js
import chokidar from 'chokidar';
import path from 'node:path';
import fs from 'node:fs/promises';
import { insertFile } from './db.js';
import { parsePMGName, targetPath } from './pmg-governance.js';

let watcher = null;
let currentSource = null;
let onNewFile = null;

// Callback pour prévenir le renderer quand un nouveau fichier est archivé
export function setOnNewFile(cb) { onNewFile = cb; }

// Compat ancienne API (no-op)
export function setRules() {}

export async function startWatcher(sourceDir) {
  await stopWatcher();
  currentSource = sourceDir;

  watcher = chokidar.watch(sourceDir, {
    // IMPORTANT: pas de modal pour l’inventaire initial
    ignoreInitial: true,
    persistent: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
  });

  watcher.on('add', async (file) => {
    try { await handleNewFile(file); }
    catch (e) { console.error('Move error', e); }
  });
}

export async function stopWatcher() {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function handleNewFile(absPath) {
  const st = await fs.stat(absPath);
  if (!st.isFile()) return;

  const filename = path.basename(absPath);
  const parsed = parsePMGName(filename);
  const ext = path.extname(filename).toLowerCase();

  let relTarget, destDir, finalDest;
  let unmatched = 0, domain_label = null, type_label = null, lang_label = null;

  if (parsed) {
    // Chemin logique: <Domaine complet>/<Type complet>/<Lang>
    relTarget = targetPath(currentSource, parsed);
    const parts = relTarget.split('/');
    domain_label = parts[0];
    type_label = parts[1];
    lang_label = parts[2];
    destDir = path.join(currentSource, relTarget);
  } else {
    // Nom non conforme -> À trier
    unmatched = 1;
    relTarget = 'À trier';
    destDir = path.join(currentSource, relTarget);
  }

  await ensureDir(destDir);
  finalDest = path.join(destDir, filename);

  try {
    await fs.rename(absPath, finalDest);
  } catch {
    // Collision: suffixe horodaté
    const base = path.basename(filename, ext);
    finalDest = path.join(destDir, `${base}_${Date.now()}${ext}`);
    await fs.rename(absPath, finalDest);
  }

  const rec = {
    path: finalDest,
    filename: path.basename(finalDest),
    ext,
    size: st.size,
    ctime: Math.floor(st.ctimeMs),
    mtime: Date.now(),
    archived_to: relTarget,
    action: parsed ? 'moved' : 'unmatched',
    pmg_domain: parsed?.domain || null,
    pmg_type:   parsed?.type   || null,
    pmg_idseq:  parsed?.idSeq  || null,
    pmg_lang:   parsed?.lang   || null,
    v_major:    parsed?.vMajor ?? null,
    v_minor:    parsed?.vMinor ?? null,
    v_patch:    parsed?.vPatch ?? null,
    domain_label, type_label, lang_label,
    unmatched,
    tags: null,
    human_desc: null,
  };

  const id = insertFile(rec);

  // Ouvre le modal de description SEULEMENT pour les nouveaux fichiers classés
  if (onNewFile && rec.action === 'moved') {
    onNewFile({
      id,
      filename: rec.filename,
      path: rec.path,
      archived_to: rec.archived_to,
      action: rec.action,
      size: rec.size,
      mtime: rec.mtime,
    });
  }
}
