// archive.js — logique d'archivage à la demande (bouton → choix fichier/dossier)
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { insertFile, getArchiveRoot, getNextIdSeqForDomainType } from './db.js';
import { DOMAINS, TYPES, LANGS, STATUS, targetPath, generateArchiveName, isSupportedExt } from './pmg-governance.js';

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function collectFilesFromPath(absPath, results = []) {
  const stat = fsSync.statSync(absPath);
  if (stat.isFile()) {
    const ext = path.extname(absPath).toLowerCase();
    if (isSupportedExt(ext)) results.push({ path: absPath, ext });
    return results;
  }
  if (stat.isDirectory()) {
    try {
      const entries = fsSync.readdirSync(absPath, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(absPath, e.name);
        if (e.isFile()) {
          const ext = path.extname(full).toLowerCase();
          if (isSupportedExt(ext)) results.push({ path: full, ext });
        } else if (e.isDirectory()) {
          collectFilesFromPath(full, results);
        }
      }
    } catch (_) {}
  }
  return results;
}

/**
 * Archive un ou plusieurs fichiers avec les métadonnées fournies.
 * @param {string} sourcePath - Chemin absolu fichier ou dossier
 * @param {object} meta - { humanDesc, domain, type, lang, status }
 * @returns {{ archived: number, errors: string[] }}
 */
export async function archiveFromPath(sourcePath, meta) {
  const { humanDesc, domain, type, lang, status } = meta;
  const files = collectFilesFromPath(sourcePath);
  const archiveRoot = getArchiveRoot();
  const relTarget = targetPath(archiveRoot, {
    domain,
    type,
    lang,
    idSeq: '001',
    vMajor: 1, vMinor: 0, vPatch: 0,
    ext: '.pdf'
  });
  const destDir = path.join(archiveRoot, relTarget);
  await ensureDir(destDir);

  const errors = [];
  let archived = 0;

  const versionFromStatus = (status === 'DRAFT') ? { major: 0, minor: 9, patch: 0 } : { major: 1, minor: 0, patch: 0 };

  for (const { path: filePath, ext } of files) {
    try {
      const idSeq = getNextIdSeqForDomainType(domain, type);
      const archiveName = generateArchiveName(domain, type, idSeq, lang, ext, status);
      let finalDest = path.join(destDir, archiveName);
      const st = await fs.stat(filePath);

      try {
        await fs.copyFile(filePath, finalDest);
      } catch {
        finalDest = path.join(destDir, path.basename(archiveName, ext) + '_' + Date.now() + ext);
        await fs.copyFile(filePath, finalDest);
      }

      const rec = {
        path: finalDest,
        filename: path.basename(finalDest),
        ext,
        size: st.size,
        ctime: Math.floor(st.ctimeMs),
        mtime: Date.now(),
        archived_to: relTarget,
        action: 'archived',
        pmg_domain: domain,
        pmg_type: type,
        pmg_idseq: idSeq,
        pmg_lang: lang,
        v_major: versionFromStatus.major, v_minor: versionFromStatus.minor, v_patch: versionFromStatus.patch,
        domain_label: DOMAINS[domain] || domain,
        type_label: TYPES[type] || type,
        lang_label: LANGS[lang] || lang,
        unmatched: 0,
        tags: null,
        human_desc: humanDesc || null,
        status: status || null,
      };
      insertFile(rec);
      archived++;
    } catch (e) {
      errors.push(`${path.basename(filePath)}: ${e.message}`);
    }
  }

  return { archived, errors };
}

export { getArchiveRoot };
