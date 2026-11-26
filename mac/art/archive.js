(() => {
  'use strict';
  const archive = JSON.parse(document.querySelector('#works').textContent);
  const byId = (id) => document.getElementById(id);
  const form = byId('archive-search');
  const grid = byId('art-grid');
  const results = byId('result-count');
  const paging = byId('pagination');
  const empty = byId('no-works');
  const viewer = byId('art-viewer');
  const perPage = 12;
  const chapterAbbreviations = ['Desk', 'Chapter I', 'Chapter II', 'Chapter III', 'Chapter IV', 'Chapter V'];
  let matches = [];
  let page = 0;
  let viewing = 0;
  let opener = null;
  const textElement = (tag, cls, text) => {
    const element = document.createElement(tag);
    element.className = cls;
    element.textContent = text;
    return element;
  };
  const fold = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').toLowerCase();
  const imageLink = (item, mode) => mode + '/' + item.image + '.webp';
  const alt = (item) => item.title + ', ' + item.format.toLowerCase() + ' from ' + archive.chapters[item.chapter];
  function card(item, index) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = imageLink(item, 'plates');
    link.className = 'archive-card';
    link.dataset.index = index;
    link.setAttribute('aria-label', 'View ' + item.title + ', ' + item.format.toLowerCase());
    const preview = textElement('span', 'archive-image', '');
    const img = document.createElement('img');
    img.alt = '';
    img.width = 480; img.height = 315; img.loading = 'lazy'; img.decoding = 'async';
    img.src = imageLink(item, 'previews');
    const arrow = textElement('span', 'archive-open', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    preview.append(img, arrow);
    const tags = textElement('span', 'archive-tags', '');
    tags.append(textElement('span', '', item.format), textElement('span', '', chapterAbbreviations[item.chapter]));
    link.append(preview, tags, textElement('span', 'archive-card-title', item.title));
    li.appendChild(link);
    return li;
  }
  function renderPage() {
    const totalPages = Math.ceil(matches.length / perPage);
    page = Math.min(Math.max(0, page), Math.max(0, totalPages - 1));
    const start = page * perPage;
    const stop = Math.min(start + perPage, matches.length);
    const items = matches.slice(start, stop).map((item, i) => card(item, start + i));
    grid.replaceChildren(...items);
    results.textContent = matches.length === 1 ? '1 work' : matches.length + ' works';
    paging.hidden = totalPages < 2;
    byId('archive-page-number').textContent = 'Page ' + (page + 1) + ' of ' + totalPages;
    byId('archive-prev').disabled = page === 0;
    byId('archive-next').disabled = page + 1 >= totalPages;
    empty.hidden = matches.length !== 0;
  }
  function filter() {
    const query = fold(form.elements.search.value.trim()).split(/\s+/).filter(Boolean);
    const type = form.elements.type.value;
    const chapter = form.elements.chapter.value;
    matches = archive.works.filter((item) => {
      if ((!form.elements.spoilers.checked && item.spoiler) || (type && item.type !== type) || (chapter && String(item.chapter) !== chapter)) return false;
      const haystack = fold([item.title, item.format, archive.groups[item.type], archive.chapters[item.chapter], chapterAbbreviations[item.chapter], item.source.replace(/[/-]/g, ' ')].join(' '));
      return query.every(term => haystack.includes(term));
    });
    page = 0;
    renderPage();
  }
  function turn(delta) {
    page += delta;
    renderPage();
    byId('catalog-title').focus();
  }
  function paintViewer(index) {
    viewing = index;
    const item = matches[index];
    byId('art-view-position').textContent = 'Work ' + (index + 1) + ' of ' + matches.length;
    byId('art-view-title').textContent = item.title;
    byId('art-view-info').textContent = [item.format, archive.chapters[item.chapter], item.size.join(' × ') + ' px'].join(' · ');
    const img = byId('art-view-image');
    img.alt = alt(item); img.src = imageLink(item, 'plates');
    byId('art-view-source').href = img.src;
    byId('art-view-prev').disabled = index === 0;
    byId('art-view-next').disabled = index + 1 === matches.length;
  }
  form.hidden = false;
  byId('fallback').hidden = true;
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', filter);
  byId('clear-search').addEventListener('click', () => { form.reset(); filter(); form.elements.search.focus(); });
  byId('archive-prev').addEventListener('click', () => turn(-1));
  byId('archive-next').addEventListener('click', () => turn(1));
  grid.addEventListener('click', event => {
    const link = event.target.closest('.archive-card');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || typeof viewer.showModal !== 'function') return;
    event.preventDefault();
    opener = link;
    paintViewer(Number(link.dataset.index));
    viewer.showModal();
    byId('art-close').focus();
  });
  byId('art-close').addEventListener('click', () => viewer.close());
  viewer.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus(); });
  viewer.addEventListener('click', (event) => { if (event.target === viewer) {
    const rect = viewer.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) viewer.close();
  } });
  byId('art-view-prev').addEventListener('click', () => paintViewer(viewing - 1));
  byId('art-view-next').addEventListener('click', () => paintViewer(viewing + 1));
  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' && viewing > 0) { event.preventDefault(); paintViewer(viewing - 1); }
    if (event.key === 'ArrowRight' && viewing + 1 < matches.length) { event.preventDefault(); paintViewer(viewing + 1); }
  });
  filter();
})();
