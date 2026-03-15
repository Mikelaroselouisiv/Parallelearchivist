// renderer.js — Dashboard PMG Auto-Archivist (nouvelle logique)
window.addEventListener('DOMContentLoaded', () => {
  const q = document.getElementById('q');
  const fDomain = document.getElementById('fDomain');
  const fType = document.getElementById('fType');
  const fExt = document.getElementById('fExt');
  const btnSearch = document.getElementById('btnSearch');
  const tbody = document.getElementById('tbody');
  const drawer = document.getElementById('drawer');
  const dClose = document.getElementById('dClose');
  const dTitle = document.getElementById('dTitle');
  const dHuman = document.getElementById('dHuman');
  const dPath = document.getElementById('dPath');
  const dArch = document.getElementById('dArch');
  const dStatus = document.getElementById('dStatus');
  const dSize = document.getElementById('dSize');
  const dDate = document.getElementById('dDate');
  const previewArea = document.getElementById('previewArea');
  const dReveal = document.getElementById('dReveal');
  const dOpen = document.getElementById('dOpen');

  const archiveModal = document.getElementById('archiveModal');
  const sourceDisplay = document.getElementById('sourceDisplay');
  const btnPickFile = document.getElementById('btnPickFile');
  const btnPickFolder = document.getElementById('btnPickFolder');
  const btnNextStep = document.getElementById('btnNextStep');
  const stepChoose = document.getElementById('stepChoose');
  const stepMeta = document.getElementById('stepMeta');
  const metaHuman = document.getElementById('metaHuman');
  const metaDomain = document.getElementById('metaDomain');
  const metaType = document.getElementById('metaType');
  const metaLang = document.getElementById('metaLang');
  const metaStatus = document.getElementById('metaStatus');
  const btnCancelArchive = document.getElementById('btnCancelArchive');
  const btnDoArchive = document.getElementById('btnDoArchive');
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const btnArchive = document.getElementById('btnArchive');

  let _selectedSourcePath = null;
  let _currentRow = null;

  function humanSize(bytes) {
    if (bytes == null) return '';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = bytes;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${Math.round(v * 10) / 10} ${u[i]}`;
  }
  const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

  async function refreshStats() {
    try {
      const s = await window.archivist.getStats();
      document.getElementById('statTotal').textContent = s.total ?? 0;
      document.getElementById('statToday').textContent = s.today ?? 0;
    } catch (_) {}
  }

  async function runSearch(skipRenderIfEmpty = false) {
    try {
      const filters = {};
      if (fDomain?.value) filters.domain = fDomain.value;
      if (fType?.value) filters.type = fType.value;
      if (fExt?.value) filters.ext = fExt.value;

      const query = q?.value?.trim() || '';
      const rows = await window.archivist.search(query, filters);

      // Ne pas afficher la liste si aucune recherche n'a été faite
      if (skipRenderIfEmpty && !query) {
        tbody.innerHTML = `<tr><td colspan="5" class="muted" style="padding: 40px; text-align: center;"></td></tr>`;
      } else {
        render(rows);
      }
      await refreshStats();
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Erreur de recherche</td></tr>`;
    }
  }

  function render(rows) {
    tbody.innerHTML = '';
    if (!rows?.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="padding:40px;text-align:center">Aucun résultat. Tapez un mot-clé ou utilisez les filtres.</td></tr>`;
      return;
    }
    const frag = document.createDocumentFragment();
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const displayName = r.human_desc || r.filename || '—';
      tr.dataset.id = r.id;
      tr.innerHTML = `
        <td class="col-name">${esc(displayName)}</td>
        <td class="col-path" title="${esc(r.path)}">${esc(r.path)}</td>
        <td>${esc(r.pmg_type || '')}</td>
        <td class="col-ext">${esc(r.ext || '')}</td>
        <td class="row-actions">
          <button class="btn" data-action="preview" data-id="${r.id}">👁</button>
          <button class="btn" data-action="reveal" data-path="${esc(r.path)}">📂</button>
        </td>
      `;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  function showPreview(ext, blobUrl) {
    previewArea.innerHTML = '';
    const ex = (ext || '').toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ex)) {
      const img = document.createElement('img');
      img.src = blobUrl;
      img.alt = 'Aperçu';
      previewArea.appendChild(img);
    } else if (ex === '.pdf') {
      const iframe = document.createElement('iframe');
      iframe.src = blobUrl;
      previewArea.appendChild(iframe);
    } else if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ex)) {
      const video = document.createElement('video');
      video.controls = true;
      video.src = blobUrl;
      previewArea.appendChild(video);
    } else {
      previewArea.innerHTML = '<span class="no-preview">Aperçu non disponible pour ce format</span>';
    }
  }

  async function openDrawer(row) {
    _currentRow = row;
    const id = row.id;
    const f = await window.archivist.getFileById(id);
    if (!f) return;
    drawer.classList.add('open');
    dTitle.textContent = f.human_desc || f.filename || '—';
    dHuman.textContent = f.human_desc || '—';
    dPath.textContent = f.path || '—';
    dArch.textContent = f.archived_to || '—';
    dStatus.textContent = f.status || '—';
    dSize.textContent = humanSize(f.size);
    dDate.textContent = f.mtime ? new Date(f.mtime).toLocaleString() : '—';
    dReveal.dataset.path = f.path;

    previewArea.innerHTML = '<span class="no-preview">Chargement…</span>';
    try {
      const b64 = await window.archivist.readFileForPreview(f.path);
      if (b64) {
        const mime = f.ext === '.pdf' ? 'application/pdf' :
          /\.(jpg|jpeg|png|gif|webp)$/i.test(f.ext) ? `image/${f.ext.slice(1)}` :
          /\.(mp4|webm)$/i.test(f.ext) ? `video/${f.ext.slice(1)}` : 'application/octet-stream';
        const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const blob = new Blob([buf], { type: mime });
        const url = URL.createObjectURL(blob);
        showPreview(f.ext, url);
      } else {
        previewArea.innerHTML = '<span class="no-preview">Aperçu non disponible</span>';
      }
    } catch {
      previewArea.innerHTML = '<span class="no-preview">Impossible de charger l’aperçu</span>';
    }
  }

  tbody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr || !tr.dataset.id) return;
    const btn = e.target.closest('[data-action]');
    if (btn?.dataset.action === 'reveal') {
      const p = btn.dataset.path;
      if (p) window.archivist.revealPath(p);
      return;
    }
    if (btn?.dataset.action === 'preview' || !btn) {
      openDrawer({ id: tr.dataset.id });
    }
  });

  dClose?.addEventListener('click', () => drawer.classList.remove('open'));
  dReveal?.addEventListener('click', () => {
    const p = dReveal.dataset.path;
    if (p) window.archivist.revealPath(p);
  });
  dOpen?.addEventListener('click', () => {
    const p = dReveal?.dataset?.path;
    if (p) window.archivist.openFile(p);
  });

  btnSearch?.addEventListener('click', runSearch);
  q?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (drawer.classList.contains('open')) drawer.classList.remove('open');
      if (archiveModal.classList.contains('open')) closeArchiveModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); q?.focus(); }
  });

  // --- Archive modal ---
  function openArchiveModal() {
    _selectedSourcePath = null;
    sourceDisplay.innerHTML = 'Aucun fichier sélectionné';
    btnNextStep.disabled = true;
    stepChoose.classList.remove('hidden');
    stepMeta.classList.add('hidden');
    btnDoArchive.classList.add('hidden');
    step1.classList.add('active');
    step2.classList.remove('active');
    archiveModal.classList.add('open');
  }

  function closeArchiveModal() {
    archiveModal.classList.remove('open');
  }

  btnArchive?.addEventListener('click', openArchiveModal);

  btnPickFile?.addEventListener('click', async () => {
    const p = await window.archivist.pickFile();
    if (p) {
      _selectedSourcePath = p;
      sourceDisplay.innerHTML = `<strong>Fichier :</strong> ${p}`;
      btnNextStep.disabled = false;
    }
  });

  btnPickFolder?.addEventListener('click', async () => {
    const p = await window.archivist.pickFolder();
    if (p) {
      _selectedSourcePath = p;
      sourceDisplay.innerHTML = `<strong>Dossier :</strong> ${p}`;
      btnNextStep.disabled = false;
    }
  });

  function getBaseName(pathStr) {
    const parts = (pathStr || '').split(/[/\\]/);
    let name = parts[parts.length - 1] || '';
    const dot = name.lastIndexOf('.');
    if (dot > 0) name = name.slice(0, dot); // enlève l'extension pour les fichiers
    return name.trim();
  }

  btnNextStep?.addEventListener('click', () => {
    stepChoose.classList.add('hidden');
    stepMeta.classList.remove('hidden');
    btnDoArchive.classList.remove('hidden');
    step1.classList.remove('active');
    step2.classList.add('active');
    metaHuman.value = getBaseName(_selectedSourcePath);
  });

  btnCancelArchive?.addEventListener('click', closeArchiveModal);
  archiveModal?.addEventListener('click', (e) => {
    if (e.target === archiveModal) closeArchiveModal();
  });

  btnDoArchive?.addEventListener('click', async () => {
    const humanDesc = (metaHuman?.value || '').trim();
    if (!humanDesc) {
      alert('Veuillez entrer un nom humain (recherchable).');
      return;
    }
    if (!_selectedSourcePath) return;
    try {
      const meta = {
        humanDesc,
        domain: metaDomain?.value || 'LEGAL',
        type: metaType?.value || 'CTR',
        lang: metaLang?.value || 'FR',
        status: metaStatus?.value || null,
      };
      const res = await window.archivist.archive(_selectedSourcePath, meta);
      closeArchiveModal();
      alert(`Archivage terminé : ${res.archived} fichier(s) archivé(s).${res.errors?.length ? '\nErreurs : ' + res.errors.join(', ') : ''}`);
      runSearch(false);
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  });

  runSearch(true);
});
