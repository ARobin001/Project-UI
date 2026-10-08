import './style.css';
import './design.css';
import { renderDrawer } from './detail.js';
import { spaces as seedSpaces, assets as seedAssets } from './data.js';
import { icon } from './icons.js';

const $ = (q, parent = document) => parent.querySelector(q);
const safe = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing retains in-memory state. */ } };
const storedSpaces = read('mingde-spaces', []);
let spaces = [...seedSpaces.map(s => storedSpaces.find(saved => saved.id === s.id) || s), ...storedSpaces.filter(s => !seedSpaces.some(seed => seed.id === s.id))];
let assets = [...seedAssets, ...read('mingde-assets', [])];
const state = {
  centerTab: '全部类型', centerQuery: '', centerScope: 'all', centerSort: 'recent', view: '全部', favorites: read('mingde-favorites', ['org', 'cases']),
  recent: read('mingde-recent', ['org', 'cases', 'rural']), category: '全部资料', fileStatus: 'all', aiStatus: 'all',
  assetQuery: '', sort: 'recent', selected: new Set(), drawerTab: '概览', evidence: null, expanded: false,
  chatAsset: null, chatSpace: 'org', messages: [], sending: false, chatEpoch: 0, batch: null, taskFilter: '全部',
  sourceSplit: false, detailReturn: null, recentTimes: read('mingde-recent-times', {})
};
let lastFocus = null;
let currentRoute;
const fileLabels = { ready: '可检索', processing: '处理中', failed: '需处理' };
const aiLabels = { completed: '完整整理', partial: '部分整理', running: '整理中', not_started: '尚未整理', failed: '整理失败', blocked: '安全阻止' };
const typeLabels = { PERSONAL: '个人', ORGANIZATION: '机构', PROJECT: '项目与专题', TOPIC: '项目与专题', INDUSTRY: '行业', EXPERT: '专家' };
const batchEligible = a => a && a.fileStatus === 'ready' && ['not_started', 'partial', 'failed'].includes(a.aiStatus);
function updatedRank(item) {
  if (item.updatedAt) return Date.parse(item.updatedAt) || 0;
  const text = item.updated || '';
  if (text === '刚刚') return Date.now();
  const time = text.match(/(\d{1,2}):(\d{2})/);
  const minutes = time ? Number(time[1]) * 60 + Number(time[2]) : 0;
  if (text.startsWith('今天')) return 100000 + minutes;
  if (text.startsWith('昨天')) return 98000 + minutes;
  const date = text.match(/(\d+)月(\d+)日/);
  return date ? Number(date[1]) * 3000 + Number(date[2]) * 100 : 0;
}
function syncOverlayAccess() {
  const open = !!$('#overlays').children.length;
  document.body.classList.toggle('has-overlay', open);
  $('#app').inert = open;
}

function parseRoute() {
  const path = location.pathname;
  const match = path.match(/^\/knowledge\/spaces\/([^/]+)(?:\/assets\/([^/]+))?\/?$/);
  if (match) return { page: 'space', spaceId: decodeURIComponent(match[1]), assetId: match[2] ? decodeURIComponent(match[2]) : null };
  const jobs = path.match(/^\/knowledge\/spaces\/([^/]+)\/organize\/?$/);
  if (jobs) return { page: 'jobs', spaceId: decodeURIComponent(jobs[1]) };
  if (path === '/chat') return { page: 'chat', assetId: new URLSearchParams(location.search).get('asset') };
  return { page: 'center' };
}
function navigate(path, reset = false, options = {}) {
  if (reset) { state.category = '全部资料'; state.assetQuery = ''; state.fileStatus = 'all'; state.aiStatus = 'all'; state.selected.clear(); }
  const previousScroll = window.scrollY;
  history.pushState(options.historyState || {}, '', path); render();
  window.scrollTo(0, options.preserveScroll ? previousScroll : 0);
}
function spacePath(id) { return `/knowledge/spaces/${encodeURIComponent(id)}`; }
function openSpace(id) {
  state.recent = [id, ...state.recent.filter(s => s !== id)].slice(0, 3); save('mingde-recent', state.recent);
  state.recentTimes[id] = Date.now(); save('mingde-recent-times', state.recentTimes);
  navigate(spacePath(id), true);
}
function avatar(name, cls = '') { return `<span class="avatar ${cls}" aria-label="${safe(name)}">${safe(String(name || '明').slice(0, 1))}</span>`; }
function formatName(format) { return ({ DOCX: '文档', PPTX: '演示', XLSX: '表格', TXT: '文本', PNG: '图片', JPG: '图片', MD: '文本' })[format] || format; }
function fileIcon(a, large = false) { return `<span class="file-icon format-${safe(a.format).toLowerCase()} ${large ? 'large' : ''}">${icon('file')}<b>${safe(formatName(a.format))}</b></span>`; }
function statusBadge(kind, val) { return `<span class="status ${kind}-${safe(val)}"><i></i>${safe((kind === 'file' ? fileLabels : aiLabels)[val] || val)}</span>`; }
function render() {
  const previouslyDrawer = !!$('.detail-drawer');
  currentRoute = parseRoute();
  const r = currentRoute;
  if (r.page === 'chat' && r.assetId) {
    state.chatAsset = assets.find(a => a.id === r.assetId) || null;
    if (state.chatAsset) state.chatSpace = state.chatAsset.spaceId;
  }
  const space = spaces.find(s => s.id === r.spaceId);
  const detail = r.assetId && r.page === 'space' ? assets.find(a => a.id === r.assetId && a.spaceId === r.spaceId) : null;
  if (detail) {
    const query = new URLSearchParams(location.search);
    const requestedTab = query.get('tab');
    if (['概览','原文','AI理解','证据','版本','资料信息'].includes(requestedTab)) state.drawerTab = requestedTab;
    const requestedEvidence = query.get('evidence');
    if (requestedEvidence && detail.evidence?.some(e => e.id === requestedEvidence)) {
      state.evidence = requestedEvidence;
      state.sourceSplit = state.drawerTab === '原文';
    }
  }
  document.title = `${detail?.title || space?.name || (r.page === 'chat' ? '问明德AI' : '知识中心')} · 明德AI`;
  const backgroundRoute = detail && state.detailReturn?.page === 'chat' ? {page:'chat'} : r;
  $('#app').innerHTML = shell(backgroundRoute, backgroundRoute.page === 'chat' ? null : space);
  const main = $('#main');
  if (detail && state.detailReturn?.page === 'chat') main.innerHTML = chatPage();
  else if (detail && state.detailReturn?.page === 'jobs') main.innerHTML = jobsPage(space);
  else if (r.page === 'center') main.innerHTML = centerPage();
  else if (r.page === 'chat') main.innerHTML = chatPage();
  else if (!space) main.innerHTML = `<div class="empty page-empty">${icon('book')}<h2>未找到这个知识库</h2><p>知识库可能已归档，或链接已失效。</p><button class="btn primary" data-action="home">返回知识中心</button></div>`;
  else if (r.page === 'jobs') main.innerHTML = jobsPage(space);
  else main.innerHTML = spacePage(space);
  if (!$('#overlays').querySelector('.modal-backdrop, .upload-backdrop')) {
    $('#overlays').innerHTML = detail ? drawer(detail) : '';
    if (detail && !previouslyDrawer) requestAnimationFrame(() => $('[data-action="close-detail"]')?.focus());
    if (!detail && r.assetId && r.page === 'space') toast('未找到此知识库中的资料');
  }
  syncOverlayAccess();
  if ($('#space-result-count')) updateCards();
  if ($('#asset-count')) updateAssets();
}
function shell(r, space) {
  return `<aside class="sidebar">
    <a class="brand" href="/knowledge" data-nav="/knowledge"><span class="brand-mark">${icon('layers')}</span><strong>明德<span>AI</span></strong></a>
    <button class="organization" data-action="organization"><span class="org-symbol">明</span><span><b>明德公益基金会</b><small>组织工作空间</small></span>${icon('down')}</button>
    <div class="nav-caption">工作空间</div>
    <nav aria-label="主导航">
      <button class="nav-item ${r.page === 'chat' ? 'active' : ''}" data-action="chat">${icon('sparkles')}<span>问明德AI</span></button>
      <button class="nav-item ${r.page !== 'chat' ? 'active' : ''}" data-action="home">${icon('book')}<span>知识中心</span>${r.page !== 'chat' ? '<span class="nav-dot"></span>' : ''}</button>
    </nav>
    <div class="nav-caption second">快捷访问</div>
    <button class="nav-item ${state.view === '收藏' && r.page === 'center' ? 'soft-active' : ''}" data-action="favorites">${icon('star')}<span>我的收藏</span><small>${state.favorites.length}</small></button>
    <button class="nav-item" data-action="recent">${icon('clock')}<span>最近使用</span></button>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-note"><span class="note-symbol">${icon('leaf')}</span><b>让知识，成为行动的依据</b><p>沉淀组织经验<br>连接每一次思考</p></div>
    <button class="nav-item support" data-action="guide">${icon('help')}<span>使用指南</span>${icon('arrow')}</button>
    <div class="prototype-label"><span></span>交互原型 · 示例数据</div>
    <button class="profile" data-action="profile">${avatar('林晓', 'profile-avatar')}<span><b>林晓</b><small>知识管理员</small></span>${icon('dots')}</button>
  </aside>
  <div class="workspace">
    <header class="topbar"><div class="breadcrumbs"><button class="icon-btn sidebar-toggle" data-action="toggle-sidebar" aria-label="展开导航">${icon('panel')}</button><span>工作空间</span>${icon('chevron')}<button data-action="home">知识中心</button>${space ? `${icon('chevron')}<span class="crumb-current">${safe(space.name)}</span>` : r.page === 'chat' ? `${icon('chevron')}<span class="crumb-current">问明德AI</span>` : ''}</div><div class="topbar-right"><span class="topbar-context">组织知识工作空间</span><button class="icon-btn" data-action="guide" aria-label="帮助">${icon('help')}</button><button class="icon-btn notification" data-action="notifications" aria-label="通知">${icon('bell')}<i></i></button><span class="topbar-divider"></span>${avatar('林晓', 'top-avatar')}</div></header>
    <main id="main" tabindex="-1"></main>
  </div>`;
}
function centerPage() {
  const title = state.view === '收藏' ? '我的收藏' : state.view === '最近' ? '最近使用' : '知识中心';
  return `<section class="center-page">
    <div class="page-heading"><div><h1>${title}<span class="title-dot"></span></h1></div><button class="btn primary" data-action="create-space">${icon('plus')}新建知识库</button></div>
    <div class="center-toolbar"><label class="search-field center-search">${icon('search')}<input id="space-search" type="search" value="${safe(state.centerQuery)}" placeholder="搜索知识库名称或用途" aria-label="搜索知识库"/><kbd>⌘ K</kbd></label></div>
    <div class="center-tabs" role="tablist" aria-label="知识库类型">${['全部类型', '个人', '机构', '项目与专题', '行业', '专家'].map(t => `<button role="tab" aria-selected="${state.centerTab === t}" class="${state.centerTab === t ? 'selected' : ''}" data-action="center-tab" data-tab="${t}">${t}</button>`).join('')}</div>
    <div class="section-heading center-filter-row"><div class="center-filter-left"><label class="center-scope">${icon('users')}<select id="space-scope" aria-label="知识库关系范围"><option value="all" ${state.centerScope === 'all' ? 'selected' : ''}>全部范围</option><option value="owned" ${state.centerScope === 'owned' ? 'selected' : ''}>我负责的</option><option value="shared" ${state.centerScope === 'shared' ? 'selected' : ''}>与我共享</option></select>${icon('down')}</label><span id="space-result-count"></span></div><label class="sort-control">${icon('filter')}<select id="space-sort" aria-label="知识库排序"><option value="recent" ${state.centerSort === 'recent' ? 'selected' : ''}>最近更新</option><option value="name" ${state.centerSort === 'name' ? 'selected' : ''}>名称排序</option></select>${icon('down')}</label></div>
    <div id="space-grid" class="space-grid">${spaceCards()}</div>
    ${state.view === '全部' && !state.centerQuery && state.centerTab === '全部类型' && state.centerScope === 'all' ? `<section class="recent-section"><div class="section-heading"><h2>${icon('clock')}最近使用</h2><button class="text-btn" data-action="recent">查看全部 ${icon('arrow')}</button></div><div class="recent-grid">${state.recent.map(id => spaces.find(s => s.id === id)).filter(Boolean).map(s => `<button class="recent-item" data-action="open-space" data-id="${s.id}"><span class="space-symbol ${safe(s.color)} small">${icon(s.icon)}</span><span><b>${safe(s.name)}</b><small>${state.recentTimes[s.id] ? '最近访问' : '上次访问'}</small></span>${icon('arrow')}</button>`).join('')}</div></section>` : ''}
    <footer class="page-footer"><span>${icon('shield')}知识库是资料、检索与问答的共同范围</span><span>交互原型 · 示例数据</span></footer>
  </section>`;
}
function filteredSpaces() {
  return spaces.filter(s => (state.centerTab === '全部类型' || typeLabels[s.type] === state.centerTab)
    && `${s.name} ${s.description}`.toLowerCase().includes(state.centerQuery.toLowerCase())
    && (state.view !== '收藏' || state.favorites.includes(s.id))
    && (state.view !== '最近' || state.recent.includes(s.id))
    && (state.centerScope !== 'owned' || s.owner === '林晓')
    && (state.centerScope !== 'shared' || s.shared));
}
function spaceCards() {
  const filtered = filteredSpaces();
  if (state.view === '最近') filtered.sort((a,b) => state.recent.indexOf(a.id) - state.recent.indexOf(b.id));
  else if (state.centerSort === 'name') filtered.sort((a,b) => a.name.localeCompare(b.name, 'zh'));
  else filtered.sort((a,b) => updatedRank(b) - updatedRank(a));
  if (!filtered.length) {
    const emptyCollection = !state.centerQuery && state.centerTab === '全部类型' && state.centerScope === 'all';
    const title = emptyCollection && state.view === '收藏' ? '还没有收藏的知识库' : emptyCollection && state.view === '最近' ? '还没有最近访问记录' : '没有找到相关知识库';
    return `<div class="empty grid-empty">${icon(state.view === '收藏' ? 'star' : 'search')}<h3>${title}</h3><p>${emptyCollection && state.view === '收藏' ? '点击知识库卡片上的星标，即可加入收藏。' : '试试其他关键词，或清除当前筛选。'}</p><button class="btn" data-action="clear-center">${emptyCollection ? '浏览知识库' : '清除筛选'}</button></div>`;
  }
  return filtered.map((s,index) => `<article class="space-card" style="--card-delay:${index * 35}ms">
    <div class="card-top"><span class="space-symbol ${safe(s.color)}">${icon(s.icon)}</span><a class="card-heading" href="${spacePath(s.id)}" data-space="${s.id}"><h3>${safe(s.name)}</h3><span class="space-type">${safe(({PERSONAL:'个人知识',ORGANIZATION:'机构知识',PROJECT:'项目知识',TOPIC:'专题知识',INDUSTRY:'行业知识',EXPERT:'专家知识'})[s.type])}</span></a><div class="card-tools"><button class="icon-btn favorite ${state.favorites.includes(s.id) ? 'is-favorite' : ''}" data-action="favorite" data-id="${s.id}" aria-label="${state.favorites.includes(s.id) ? '取消收藏' : '收藏'}${safe(s.name)}" aria-pressed="${state.favorites.includes(s.id)}">${icon('star')}</button><button class="icon-btn" data-action="space-menu" data-id="${s.id}" aria-label="${safe(s.name)}更多操作">${icon('dots')}</button></div></div>
    <a class="card-main" href="${spacePath(s.id)}" data-space="${s.id}"><p>${safe(s.description)}</p><div class="card-counts"><span>${icon('file')}<b>${s.assetCount}</b> 份资料</span><i></i><span><b>${s.categoryCount}</b> 个分类</span></div><span class="card-open">打开知识库 ${icon('arrow')}</span></a>
    <div class="card-bottom"><div class="card-members">${avatar(s.owner,'mini')}<span>${safe(s.owner)}<small class="member-count">${Number(s.members) || 1}名成员</small></span></div><span class="card-updated">${safe(s.updated)}更新</span></div>
  </article>`).join('');
}
function updateCards() {
  $('#space-grid').innerHTML = spaceCards();
  $('#space-result-count').textContent = `${filteredSpaces().length} 个知识库`;
}
function spacePage(space) {
  const ownAssets = assets.filter(a => a.spaceId === space.id);
  const categories = space.categories || [...new Set(ownAssets.map(a => a.category))];
  const batch = state.batch?.spaceId === space.id ? state.batch : null;
  return `<section class="library-page"><div class="page-heading compact"><div><button class="back-link" data-action="home">${icon('back')}知识中心</button><h1>${safe(space.name)}<span class="space-heading-type">${safe(({ORGANIZATION:'机构知识',PROJECT:'项目知识',TOPIC:'专题知识',INDUSTRY:'行业知识',EXPERT:'专家知识',PERSONAL:'我的知识'})[space.type] || space.type)}</span></h1></div><div class="heading-actions"><button class="btn" data-action="organize-menu">${icon('sparkles')}AI整理 ${icon('down')}</button><button class="btn primary" data-action="upload">${icon('plus')}添加资料</button><button class="icon-btn" data-action="space-menu" data-id="${space.id}" aria-label="知识库设置">${icon('dots')}</button></div></div>
  ${batch && batch.status !== 'done' ? `<button class="batch-banner" data-action="jobs">${icon('sparkles')}<span>明德AI${batch.status === 'paused' ? '已暂停整理' : '正在整理'} <b>${batch.completed} / ${batch.ids.length}</b></span><span class="batch-current">后台任务示例</span><span>查看进度 ${icon('arrow')}</span></button>` : ''}
  <div class="library-layout"><aside class="category-nav"><button class="category-item ${state.category === '全部资料' && state.fileStatus === 'all' ? 'active' : ''}" data-action="category" data-name="全部资料">${icon('layers')}全部资料<span>${ownAssets.length}</span></button><div class="category-caption">资料分类</div>${categories.map(c => `<button class="category-item ${state.category === c ? 'active' : ''}" data-action="category" data-name="${safe(c)}">${icon('folder')}${safe(c)}<span>${ownAssets.filter(a => a.category === c).length}</span></button>`).join('')}<div class="category-divider"></div><button class="category-item ${state.fileStatus === 'processing' ? 'active' : ''}" data-action="quick-status" data-status="processing">${icon('clock')}处理中<span>${ownAssets.filter(a => a.fileStatus === 'processing').length}</span></button><button class="category-item ${state.fileStatus === 'failed' ? 'active' : ''}" data-action="quick-status" data-status="failed">${icon('warning')}处理失败<span>${ownAssets.filter(a => a.fileStatus === 'failed').length}</span></button><div class="library-tip">${icon('info')}<span>文件可检索与AI整理<br>是两项独立状态</span></div></aside>
  <div class="asset-area"><div class="asset-search-row"><label class="search-field">${icon('search')}<input id="asset-search" type="search" value="${safe(state.assetQuery)}" placeholder="搜索资料名称、摘要或标签" aria-label="搜索资料"/></label><button class="icon-btn" data-action="list-help" aria-label="列表显示说明">${icon('list')}</button></div><div class="asset-state-tabs" role="tablist" aria-label="文件状态">${[['all','全部'],['ready','可检索'],['processing','处理中'],['failed','需处理']].map(([val,text]) => `<button role="tab" aria-selected="${state.fileStatus === val}" class="${state.fileStatus === val ? 'active' : ''}" data-action="file-filter" data-value="${val}">${text}<span>${val === 'all' ? ownAssets.length : ownAssets.filter(a => a.fileStatus === val).length}</span></button>`).join('')}</div><div class="asset-filters"><label>${icon('sparkles')}<select id="ai-filter" aria-label="AI整理状态"><option value="all">全部AI整理状态</option>${Object.entries(aiLabels).map(([val,label]) => `<option value="${val}" ${state.aiStatus === val ? 'selected' : ''}>${label}</option>`).join('')}<option value="incomplete" ${state.aiStatus === 'incomplete' ? 'selected' : ''}>未完整整理</option></select>${icon('down')}</label><span class="filter-count" id="asset-count"></span><label>${icon('filter')}<select id="asset-sort" aria-label="资料排序"><option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>最近更新</option><option value="name" ${state.sort === 'name' ? 'selected' : ''}>名称排序</option></select>${icon('down')}</label></div><div id="selection-bar"></div><div class="asset-table"><div class="table-header"><input id="select-all" type="checkbox" aria-label="选择当前结果的全部资料"/><span>资料名称</span><span>分类</span><span>文件状态</span><span>AI整理</span><span>更新时间</span><span></span></div><div id="asset-rows">${assetRows(space.id)}</div></div><div class="list-footer"><span>显示当前知识库的示例资料</span><span>点击资料查看原文与证据 ${icon('arrow')}</span></div></div></div></section>`;
}
function filteredAssets(spaceId) {
  let list = assets.filter(a => a.spaceId === spaceId && (state.category === '全部资料' || a.category === state.category)
    && (state.fileStatus === 'all' || a.fileStatus === state.fileStatus)
    && (state.aiStatus === 'all' || (state.aiStatus === 'incomplete' ? a.aiStatus !== 'completed' : a.aiStatus === state.aiStatus))
    && `${a.title} ${a.summary} ${(a.tags || []).join(' ')}`.toLowerCase().includes(state.assetQuery.toLowerCase()));
  if (state.sort === 'name') list.sort((a,b) => a.title.localeCompare(b.title,'zh'));
  else list.sort((a,b) => updatedRank(b) - updatedRank(a));
  return list;
}
function assetRows(id) {
  const list = filteredAssets(id);
  if (!list.length) return `<div class="empty">${icon('search')}<h3>没有符合条件的资料</h3><p>尝试其他关键词，或清除当前筛选。</p><button class="btn" data-action="clear-assets">清除筛选</button></div>`;
  return list.map(a => `<div class="asset-row ${currentRoute.assetId === a.id ? 'is-open' : ''} ${state.selected.has(a.id) ? 'is-selected' : ''}"><input type="checkbox" class="asset-checkbox" value="${safe(a.id)}" aria-label="选择${safe(a.title)}" ${state.selected.has(a.id) ? 'checked' : ''}/><a href="${spacePath(id)}/assets/${a.id}" class="asset-title-cell" data-asset="${a.id}">${fileIcon(a)}<span><b>${safe(a.title)}</b><small>${safe(a.summary)}</small></span></a><span class="asset-category">${safe(a.category)}</span><span title="${a.fileStatus === 'ready' ? '资料可搜索并用于知识问答' : a.fileStatus === 'failed' ? '资料处理失败，可能暂不可检索' : '正在解析与建立检索索引'}">${a.localOnly ? '<span class="status file-processing"><i></i>待接入处理</span>' : statusBadge('file',a.fileStatus)}</span><span title="${a.aiStatus === 'failed' ? 'AI整理失败不会影响已就绪资料的检索' : a.aiStatus === 'partial' ? '仅完成部分内容整理' : aiLabels[a.aiStatus]}">${statusBadge('ai',a.aiStatus)}</span><span class="asset-updated">${safe(a.updated)}</span><button class="icon-btn" data-action="asset-menu" data-id="${a.id}" aria-label="${safe(a.title)}更多操作">${icon('dots')}</button></div>`).join('');
}
function updateAssets() {
  if (!$('#asset-rows')) return;
  $('#asset-rows').innerHTML = assetRows(currentRoute.spaceId);
  const list = filteredAssets(currentRoute.spaceId);
  $('#asset-count').textContent = `${list.length} 份资料`;
  const eligibleCount = [...state.selected].filter(id => batchEligible(assets.find(a => a.id === id))).length;
  $('#selection-bar').innerHTML = state.selected.size ? `<div class="selection-bar"><span>已选择 <b>${state.selected.size}</b> 份资料</span><button class="text-btn" data-action="organize-selected" ${eligibleCount ? '' : 'disabled'}>${icon('sparkles')}开始AI整理${eligibleCount ? `（${eligibleCount}份）` : ''}</button><button class="text-btn cancel-selection" data-action="clear-selection">取消选择</button></div>` : '';
  const checkbox = $('#select-all');
  checkbox.checked = !!list.length && list.every(a => state.selected.has(a.id));
  checkbox.indeterminate = !checkbox.checked && list.some(a => state.selected.has(a.id));
}
function drawer(a) { return renderDrawer(a, state, spaces); }

function chatPage() {
  const asset = state.chatAsset;
  const space = spaces.find(s => s.id === state.chatSpace);
  return `<section class="chat-layout"><aside class="conversation-sidebar"><button class="btn" data-action="new-chat">${icon('plus')}新建对话</button><div class="nav-caption">当前对话</div><button class="conversation-item active">${icon('chat')}<span>${state.messages.find(m=>m.role==='user')?.text ? safe(state.messages.find(m=>m.role==='user').text.slice(0,13)) : '新的知识问答'}</span></button><div class="conversation-note">${icon('shield')}回答附带资料来源<br>请结合原文进行核验</div></aside><div class="chat-main"><header class="chat-header"><h2>问明德AI<span class="demo-tag">示例问答</span></h2><button class="btn subtle" data-action="chat-scope">${icon(asset ? 'file' : 'book')}${safe(asset?.title || space?.name || '选择知识范围')}${icon('down')}</button></header><div id="chat-messages" class="chat-messages">${state.messages.length ? messagesHTML() : `<div class="chat-welcome"><span class="welcome-symbol">${icon('sparkles')}</span><div class="eyebrow">有依据的思考，从这里开始</div><h1>你好，今天想了解什么？</h1><p>${asset ? `围绕「${safe(asset.title)}」，一起理解资料里的内容。` : '选择知识范围，让组织经验帮助你完成工作。'}</p><div class="suggestions">${(asset ? ['这份资料的主要内容是什么？','有哪些值得关注的关键观点？','请给出原文依据'] : ['乡村教育项目方案的主要内容是什么？','机构财务管理有哪些要求？','如何开展项目评估？']).map(t => `<button data-action="suggestion" data-text="${t}">${icon('chat')}<span>${t}</span>${icon('arrow')}</button>`).join('')}</div></div>`}</div><form id="chat-form" class="composer"><textarea id="chat-input" rows="2" placeholder="输入问题，让明德AI从资料中寻找依据……" aria-label="输入问题" ${state.sending ? 'disabled' : ''}></textarea><div class="composer-bottom"><button type="button" class="context-chip" data-action="chat-scope">${icon(asset ? 'file' : 'book')}${asset ? '仅使用此资料' : safe(space?.name || '选择范围')}${icon('down')}</button><span>Enter 发送 · Shift + Enter 换行</span><button class="send-btn" type="submit" aria-label="发送问题" ${state.sending ? 'disabled' : ''}>${icon('arrow')}</button></div></form><p class="chat-disclaimer">当前为交互演示，未连接知识检索与AI服务。请以原文为依据。</p></div></section>`;
}
function messagesHTML() {
  return state.messages.map(m => m.role === 'user' ? `<div class="message user-message"><span>${safe(m.text)}</span>${avatar('林晓')}</div>` : `<div class="message ai-message"><span class="ai-avatar">${icon('sparkles')}</span><div class="message-content"><div class="answer-label">明德AI <span>示例回答 · ${safe(m.scope || '')}</span></div><div class="answer-text">${m.loading ? `<span class="thinking">${icon('search')}正在查找相关资料<span class="dots-animation">···</span></span>` : safe(m.text).replace(/\n/g,'<br/>')}</div>${m.citations?.length ? `<div class="citations"><div class="citation-caption">${icon('quote')}引用来源</div>${m.citations.map((c,i) => `<button class="citation-card" data-action="citation" data-id="${c.assetId}" data-evidence="${c.evidenceId}"><span class="citation-number">${i+1}</span><span><b>${safe(c.title)}</b><small>${c.page ? `第 ${c.page} 页` : '相关段落'} · 待核验</small></span>${icon('arrow')}</button>`).join('')}</div>` : ''}${m.noResult ? '<button class="btn subtle" data-action="chat-scope">调整知识范围</button>' : ''}</div></div>`).join('');
}
async function sendQuestion(text) {
  text = text.trim(); if (!text || state.sending) return;
  const epoch = state.chatEpoch; state.sending = true;
  const scope = state.chatAsset?.title || spaces.find(s => s.id === state.chatSpace)?.name;
  const answer = { role:'ai', text:'', loading:true, scope, citations:[] };
  state.messages.push({role:'user',text},answer); render();
  await delay(600); if (epoch !== state.chatEpoch) return;
  const pool = assets.filter(a => a.fileStatus === 'ready' && (state.chatAsset ? a.id === state.chatAsset.id : a.spaceId === state.chatSpace));
  const terms = text.replace(/[？?，,。！!]/g,' ').split(/\s+/).filter(Boolean);
  const relevant = pool.filter(a => terms.some(t => `${a.title} ${a.summary} ${(a.tags || []).join(' ')}`.includes(t) || [...t.matchAll(/.{2}/g)].some(([pair]) => `${a.title} ${a.summary}`.includes(pair))));
  const chosen = state.chatAsset ? pool.slice(0,1) : relevant.slice(0,2);
  answer.loading = false;
  if (!chosen.length) { answer.noResult = true; answer.text = '当前知识范围内没有找到足够依据。\n\n你可以调整问题、扩大知识范围，或添加相关资料。'; }
  else {
    answer.citations = chosen.filter(a => a.evidence?.length).map(a => ({assetId:a.id,evidenceId:a.evidence[0].id,title:a.title,page:a.evidence[0].page}));
    const full = `根据当前范围内的示例资料，可以关注以下内容：\n\n${chosen.map((a,i) => `${i+1}. ${a.summary}${a.evidence?.length ? ` [${answer.citations.findIndex(c=>c.assetId===a.id)+1}]` : ''}`).join('\n\n')}\n\n以上是原型中的示例总结。请打开引用来源，对照原文确认具体要求。`;
    for (let i=0;i<full.length;i+=9) { if (epoch !== state.chatEpoch) return; answer.text = full.slice(0,i+9); updateMessages(); await delay(18); }
  }
  state.sending = false; if (parseRoute().page === 'chat') { render(); scrollMessages(); $('#chat-input')?.focus(); }
}
function updateMessages() { if ($('#chat-messages')) { $('#chat-messages').innerHTML = messagesHTML(); scrollMessages(); } }
function scrollMessages() { const el = $('#chat-messages'); if(el) el.scrollTop = el.scrollHeight; }
function delay(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }

function jobsPage(space) {
  const b = state.batch?.spaceId === space.id ? state.batch : null;
  const tasks = b ? b.ids.map(id=>assets.find(a=>a.id===id)).filter(Boolean) : assets.filter(a=>a.spaceId===space.id && ['running','failed','partial','blocked'].includes(a.aiStatus));
  const labels = {running:'处理中',failed:'失败',partial:'部分完成',completed:'已完成',not_started:'待处理',blocked:'已阻止'};
  const filtered = tasks.filter(a=>state.taskFilter==='全部'||labels[a.aiStatus]===state.taskFilter);
  return `<section class="jobs-page"><div class="page-heading compact"><div><button class="back-link" data-action="open-space" data-id="${space.id}">${icon('back')}${safe(space.name)}</button><h1>AI整理中心</h1><p>查看资料整理进度，处理需要关注的任务。</p></div><button class="btn primary" data-action="open-space" data-id="${space.id}">${icon('plus')}选择资料</button></div><div class="batch-card"><div><span class="eyebrow">当前批次</span><h2>${b ? b.status === 'paused' ? '整理已暂停' : b.status === 'done' ? '本批次已结束' : '正在整理资料' : '没有正在运行的批次'}</h2><p>${b ? `已完成 ${b.completed} / ${b.ids.length} 份资料` : '从知识库选择资料，开始一批AI整理。'}</p></div>${b ? `<div class="batch-actions">${b.status === 'paused' ? `<button class="btn" data-action="resume-batch">${icon('play')}继续</button>` : b.status === 'running' ? `<button class="btn" data-action="pause-batch">${icon('pause')}暂停</button>` : ''}<button class="btn" data-action="retry-batch" ${!tasks.some(a=>a.aiStatus==='failed') ? 'disabled' : ''}>${icon('refresh')}重试失败项</button></div>` : `<span class="batch-empty-icon">${icon('sparkles')}</span>`}${b ? `<div class="batch-progress"><span style="width:${Math.round(b.completed/b.ids.length*100)}%"></span></div>` : ''}</div><p class="background-note">${icon('info')}原型中的整理任务在当前标签页内模拟运行；离开此页面仍会继续。</p><div class="jobs-tabs">${['全部','待处理','处理中','已完成','部分完成','失败','已阻止'].map(t=>`<button class="${state.taskFilter===t?'active':''}" data-action="task-filter" data-value="${t}">${t}</button>`).join('')}</div><div class="jobs-table"><div class="jobs-row jobs-table-header"><span>资料名称</span><span>当前阶段</span><span>状态</span><span>操作</span></div>${filtered.length ? filtered.map(a=>`<div class="jobs-row"><span class="jobs-title">${fileIcon(a)}<b>${safe(a.title)}</b></span><span>${a.aiStatus==='running'?'提取关键对象':a.aiStatus==='failed'?'整理服务超时':'—'}</span><span>${statusBadge('ai',a.aiStatus)}</span><button class="text-btn" data-action="job-detail" data-id="${a.id}">${a.aiStatus==='failed'?'查看原因':'查看资料'} ${icon('arrow')}</button></div>`).join('') : '<div class="empty">'+icon('checkCircle')+'<h3>此状态下没有任务</h3><p>切换状态查看其他整理任务。</p></div>'}</div></section>`;
}

function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(()=>el.classList.remove('visible'),3000); }
function showModal(title,body,footer='') {
  lastFocus = document.activeElement;
  $('#overlays').innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><header><h2 id="modal-title">${safe(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="关闭">${icon('close')}</button></header><div class="modal-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</section></div>`;
  syncOverlayAccess();
  requestAnimationFrame(()=>$('.modal input, .modal button, .modal')?.focus());
}
function dismissOverlay() { $('#overlays').innerHTML = ''; syncOverlayAccess(); }
function closeModal() { dismissOverlay(); if(parseRoute().assetId && parseRoute().page === 'space') render(); else lastFocus?.focus(); }
function createSpace() {
  showModal('新建知识库',`<form id="create-space-form"><label class="form-field">知识库名称 <span>*</span><input name="name" maxlength="40" required placeholder="例如：乡村教育专题库"/></label><label class="form-field">知识库类型<select name="type"><option value="ORGANIZATION">机构知识</option><option value="PERSONAL">我的知识</option><option value="PROJECT">项目知识</option><option value="TOPIC">专题知识</option><option value="INDUSTRY">行业知识</option><option value="EXPERT">专家知识</option></select></label><label class="form-field">用途说明<textarea name="description" maxlength="100" rows="3" placeholder="用一句话说明这里保存什么资料"></textarea></label><label class="form-field">可见范围<select name="visibility"><option value="members">指定成员</option><option value="organization">组织成员可查看</option><option value="private">仅自己</option></select><small>类型不决定权限，可见范围单独设置。此原型仅保存本地示例。</small></label></form>`,`<button class="btn" data-action="close-modal">取消</button><button class="btn primary" type="submit" form="create-space-form">创建知识库</button>`);
}
function uploadDrawer() {
  lastFocus = document.activeElement;
  const s = spaces.find(s=>s.id===currentRoute.spaceId);
  $('#overlays').innerHTML=`<div class="upload-backdrop" data-action="close-modal"><section class="upload-drawer" role="dialog" aria-modal="true" aria-labelledby="upload-title"><header><h2 id="upload-title">添加资料</h2><button class="icon-btn" data-action="close-modal" aria-label="关闭上传">${icon('close')}</button></header><form id="upload-form"><p class="upload-location">上传至 <b>${safe(s.name)}</b></p><label class="drop-zone" id="drop-zone">${icon('upload')}<b>拖拽文件到此处，或<span>选择文件</span></b><small>PDF、Office、文本与图片 · 单个文件不超过 50MB</small><input id="upload-file" type="file" accept=".pdf,.docx,.xlsx,.pptx,.csv,.txt,.md,.png,.jpg,.jpeg" required aria-label="选择文件"/></label><p class="demo-upload-note">当前为本地上传演示，正式上传规则需由服务端提供。</p><div id="upload-file-info"></div><label class="form-field">资料标题 <span>*</span><input name="title" id="upload-title-input" required maxlength="120" placeholder="选择文件后自动填写"/></label><label class="form-field">分类<select name="category">${[...(s.categories || []),'未分类'].filter((v,i,a)=>a.indexOf(v)===i).map(c=>`<option ${state.category===c?'selected':''}>${safe(c)}</option>`).join('')}</select></label><label class="form-field">敏感等级<select name="sensitivity"><option>内部资料</option><option>公开资料</option><option>敏感资料</option></select></label><div id="upload-progress"></div><footer><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary" type="submit" id="upload-submit">${icon('upload')}添加示例资料</button></footer></form></section></div>`;
  syncOverlayAccess(); requestAnimationFrame(()=>$('[data-action="close-modal"]')?.focus());
}
function spaceMenu(id) {
  const s = spaces.find(s=>s.id===id);
  showModal(s.name,`<div class="menu-list"><button data-action="open-space" data-id="${id}">${icon('book')}打开知识库 ${icon('arrow')}</button><button data-action="ask-space" data-id="${id}">${icon('sparkles')}基于此库提问 ${icon('arrow')}</button><button data-action="favorite" data-id="${id}">${icon('star')}${state.favorites.includes(id)?'取消收藏':'收藏知识库'}</button><button data-action="settings-space" data-id="${id}">${icon('settings')}知识库设置 ${icon('arrow')}</button></div>`);
}
function assetMenu(id) {
  const a=assets.find(a=>a.id===id);
  showModal(a.title,`<div class="menu-list"><button data-action="job-detail" data-id="${id}">${icon('file')}查看详情 ${icon('arrow')}</button><button data-action="download" data-id="${id}">${icon('download')}下载示例文本</button>${a.fileStatus==='ready'?`<button data-action="ask-asset" data-id="${id}">${icon('sparkles')}基于资料提问</button>`:''}${a.fileStatus==='failed'?`<button data-action="retry-file" data-id="${id}">${icon('refresh')}重新处理</button>`:''}${['failed','partial','not_started'].includes(a.aiStatus)&&a.fileStatus==='ready'?`<button data-action="retry-ai" data-id="${id}">${icon('sparkles')}重新整理</button>`:''}</div>`);
}
function startBatch(ids) {
  const requested = ids.length;
  ids=ids.filter(id=>batchEligible(assets.find(a=>a.id===id)));
  if(!ids.length) return toast('请选取可检索且待完善的资料；已完成、整理中与安全阻止项不可重复整理');
  if(state.batch && ['running','paused'].includes(state.batch.status)) return toast('当前有未结束的批次，请先查看整理进度');
  const b=state.batch={spaceId:assets.find(a=>a.id===ids[0]).spaceId,ids,completed:0,status:'running'};
  ids.forEach(id=>{assets.find(a=>a.id===id).aiStatus='not_started';}); closeModal(); state.selected.clear(); render(); toast(requested > ids.length ? `已开始 ${ids.length} 份示例整理，跳过 ${requested - ids.length} 份不可处理资料` : '示例整理已开始，离开页面仍会继续'); runBatch(b);
}
async function runBatch(b) {
  for(const id of b.ids){
    while(b.status==='paused') await delay(200);
    const a=assets.find(a=>a.id===id); a.aiStatus='running'; if(['space','jobs'].includes(parseRoute().page))render();
    await delay(2600); while(b.status==='paused') await delay(200);
    a.aiStatus='completed'; b.completed++; if(['space','jobs'].includes(parseRoute().page))render();
  }
  b.status='done'; if(['space','jobs'].includes(parseRoute().page))render(); toast('本批次示例整理已完成');
}
function downloadSample(a) {
  const blob=new Blob([`示例资料：${a.title}\n\n${a.summary}\n\n${(a.evidence||[]).map(e=>e.quote).join('\n\n')}\n\n此文件是明德AI界面原型的示例文本，并非原始资料。`],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob), link=document.createElement('a'); link.href=url;link.download=`${a.title}-示例.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已下载示例文本');
}
function openDetail(id,tab='概览',evidence=null) {
  const a=assets.find(a=>a.id===id);if(!a)return;
  const source = parseRoute();
  if (!(source.page === 'space' && source.assetId)) {
    state.detailReturn = {path:location.pathname + location.search, page:source.page, scroll:window.scrollY, chatScroll:$('#chat-messages')?.scrollTop || 0, focusAsset:id};
  }
  lastFocus=document.activeElement; dismissOverlay(); state.drawerTab=tab;state.evidence=evidence;state.sourceSplit=!!evidence;
  const query = new URLSearchParams({tab}); if(evidence) query.set('evidence',evidence);
  navigate(`${spacePath(a.spaceId)}/assets/${a.id}?${query}`,false,{preserveScroll:true,historyState:{detailReturn:state.detailReturn}});
}
function closeDetail() {
  const origin = state.detailReturn;
  const fallback = spacePath(currentRoute.spaceId);
  state.expanded=false;state.sourceSplit=false;state.detailReturn=null;dismissOverlay();
  history.replaceState({},'',origin?.path || fallback);render();
  window.scrollTo(0,origin?.scroll || 0);
  if($('#chat-messages')) $('#chat-messages').scrollTop=origin?.chatScroll || 0;
  requestAnimationFrame(()=>{
    const selector = origin?.page === 'chat' ? `[data-action="citation"][data-id="${CSS.escape(origin.focusAsset)}"]` : origin?.focusAsset ? `[data-asset="${CSS.escape(origin.focusAsset)}"]` : '#main';
    $(selector)?.focus({preventScroll:true});
  });
}
function updateDetailRoute() {
  const query = new URLSearchParams({tab:state.drawerTab});
  if(state.evidence) query.set('evidence',state.evidence);
  history.replaceState({detailReturn:state.detailReturn},'',`${location.pathname}?${query}`);
}

document.addEventListener('click',e=>{
  const link=e.target.closest('[data-nav],[data-space],[data-asset]');
  if(link){if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();if(link.dataset.space)openSpace(link.dataset.space);else if(link.dataset.asset)openDetail(link.dataset.asset);else{state.view='全部';navigate(link.dataset.nav);}return;}
  const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
  if(b.classList.contains('detail-backdrop')&&e.target!==b)return;
  if((b.classList.contains('modal-backdrop')||b.classList.contains('upload-backdrop'))&&e.target!==b)return;
  const action=b.dataset.action,id=b.dataset.id;
  switch(action){
    case 'home':closeModal();state.view='全部';navigate('/knowledge');break;
    case 'chat':closeModal();state.chatAsset=null;navigate('/chat');break;
    case 'favorites':state.view='收藏';state.centerTab='全部类型';state.centerScope='all';state.centerQuery='';navigate('/knowledge');break;
    case 'recent':state.view='最近';state.centerTab='全部类型';state.centerScope='all';state.centerQuery='';navigate('/knowledge');break;
    case 'shared':state.centerScope=state.centerScope==='shared'?'all':'shared';render();break;
    case 'center-tab':state.centerTab=b.dataset.tab;render();updateCards();break;
    case 'clear-center':state.centerQuery='';state.centerTab='全部类型';state.centerScope='all';state.view='全部';render();break;
    case 'open-space':closeModal();openSpace(id);break;
    case 'favorite':state.favorites=state.favorites.includes(id)?state.favorites.filter(v=>v!==id):[...state.favorites,id];save('mingde-favorites',state.favorites);if($('.modal'))closeModal();render();toast(state.favorites.includes(id)?'已加入我的收藏':'已取消收藏');break;
    case 'space-menu':spaceMenu(id);break;
    case 'create-space':createSpace();break;
    case 'settings-space':{
      const s=spaces.find(s=>s.id===id);showModal('知识库设置',`<form id="settings-form" data-id="${id}"><label class="form-field">知识库名称<input name="name" maxlength="40" required value="${safe(s.name)}"/></label><label class="form-field">用途说明<textarea name="description" rows="3" maxlength="100">${safe(s.description)}</textarea></label><div class="inline-notice">${icon('info')}此原型仅演示名称与说明编辑。成员及权限管理需接入组织权限服务。</div></form>`,`<button class="btn" data-action="close-modal">取消</button><button class="btn primary" type="submit" form="settings-form">保存</button>`);break;
    }
    case 'category':state.category=b.dataset.name;state.selected.clear();render();updateAssets();break;
    case 'quick-status':state.fileStatus=b.dataset.status;state.category='全部资料';state.selected.clear();render();updateAssets();break;
    case 'file-filter':state.fileStatus=b.dataset.value;state.selected.clear();render();updateAssets();break;
    case 'clear-assets':state.category='全部资料';state.assetQuery='';state.fileStatus='all';state.aiStatus='all';state.selected.clear();render();updateAssets();break;
    case 'clear-selection':state.selected.clear();updateAssets();break;
    case 'upload':uploadDrawer();break;
    case 'asset-menu':assetMenu(id);break;
    case 'close-detail':closeDetail();break;
    case 'expand-detail':state.expanded=!state.expanded;render();break;
    case 'detail-tab':state.drawerTab=b.dataset.tab;state.evidence=null;state.sourceSplit=false;updateDetailRoute();render();$(`.detail-tabs [data-tab="${CSS.escape(state.drawerTab)}"]`)?.focus();break;
    case 'open-source-unlocated':
    case 'locate-evidence':state.evidence=id;state.drawerTab='原文';state.sourceSplit=true;updateDetailRoute();render();$('.highlight-source')?.scrollIntoView({block:'center',behavior:'smooth'});break;
    case 'ask-asset':{
      const a=assets.find(a=>a.id===id);if(a.fileStatus!=='ready')return toast('资料处理完成后可提问');closeModal();state.chatEpoch++;state.sending=false;state.messages=[];state.chatAsset=a;state.chatSpace=a.spaceId;navigate(`/chat?asset=${encodeURIComponent(id)}`);break;
    }
    case 'ask-space':closeModal();state.chatAsset=null;state.chatSpace=id;state.chatEpoch++;state.sending=false;state.messages=[];navigate('/chat');break;
    case 'download':downloadSample(assets.find(a=>a.id===id));break;
    case 'entity':showModal(b.dataset.name,`<p class="reading-text">该对象由示例资料中的内容整理得出。请查看关联原文证据，确认对象名称与上下文。</p>`,`<button class="btn" data-action="close-modal">返回</button>`);break;
    case 'organize-menu':showModal('AI整理',`<div class="menu-list"><button data-action="organize-selected" ${![...state.selected].some(id=>batchEligible(assets.find(a=>a.id===id)))?'disabled':''}>${icon('checkCircle')}整理选中资料 <small>${state.selected.size} 份</small></button><button data-action="organize-incomplete">${icon('sparkles')}整理当前未完成资料</button><button data-action="jobs">${icon('list')}进入AI整理中心 ${icon('arrow')}</button></div><p class="muted small-text">仅处理文件已可检索的资料。安全阻止项不会自动重试。</p>`);break;
    case 'organize-selected':startBatch([...state.selected]);break;
    case 'organize-incomplete':{
      const ids=filteredAssets(currentRoute.spaceId).filter(a=>a.fileStatus==='ready'&&['not_started','partial','failed'].includes(a.aiStatus)).map(a=>a.id);startBatch(ids);break;
    }
    case 'jobs':closeModal();navigate(`${spacePath(currentRoute.spaceId)}/organize`);break;
    case 'job-detail':openDetail(id);break;
    case 'retry-ai':startBatch([id]);break;
    case 'retry-file':{
      const a=assets.find(a=>a.id===id);a.fileStatus='processing';closeModal();render();toast('已开始示例重新处理');setTimeout(()=>{a.fileStatus='ready';render();toast('示例资料已可检索');},2600);break;
    }
    case 'pause-batch':state.batch.status='paused';render();toast('示例整理已暂停');break;
    case 'resume-batch':state.batch.status='running';render();break;
    case 'retry-batch':startBatch(state.batch.ids.filter(id=>assets.find(a=>a.id===id).aiStatus==='failed'));break;
    case 'task-filter':state.taskFilter=b.dataset.value;render();break;
    case 'new-chat':state.chatEpoch++;state.sending=false;state.messages=[];render();break;
    case 'suggestion':sendQuestion(b.dataset.text);break;
    case 'citation':openDetail(id,'原文',b.dataset.evidence);break;
    case 'chat-scope':showModal('选择知识范围',`<p class="muted">后续问题将使用新范围，已有回答保留原来的范围。</p><div class="scope-list">${spaces.map(s=>`<button class="${state.chatSpace===s.id&&!state.chatAsset?'selected':''}" data-action="choose-scope" data-id="${s.id}"><span class="space-symbol ${safe(s.color)} small">${icon(s.icon)}</span><span><b>${safe(s.name)}</b><small>${safe(s.description)}</small></span>${state.chatSpace===s.id&&!state.chatAsset?icon('check'):icon('chevron')}</button>`).join('')}</div>${state.chatAsset?'<p class="muted">当前仅使用：'+safe(state.chatAsset.title)+'</p>':''}`);break;
    case 'choose-scope':state.chatSpace=id;state.chatAsset=null;history.replaceState({},'','/chat');closeModal();render();toast('后续问题将使用所选知识库');break;
    case 'close-modal':closeModal();break;
    case 'organization':showModal('当前组织',`<div class="organization-info">${icon('building')}<h3>明德公益基金会</h3><p>当前原型使用此组织的示例知识库。</p></div>`);break;
    case 'profile':showModal('个人信息',`<div class="organization-info">${avatar('林晓','profile-avatar')}<h3>林晓</h3><p>示例知识管理员 · 明德公益基金会</p></div>`);break;
    case 'notifications':showModal('通知',`<div class="empty">${icon('bell')}<h3>暂无新通知</h3><p>资料处理与整理通知将在这里显示。</p></div>`);break;
    case 'guide':showModal('使用指南',`<div class="guide-steps"><div><span>01</span><h3>选择知识库</h3><p>按用途找到合适的知识范围。</p></div><div><span>02</span><h3>查找与阅读资料</h3><p>搜索或筛选资料，打开详情查看原文。</p></div><div><span>03</span><h3>理解与核验</h3><p>查看AI理解与证据，回到原文确认。</p></div><div><span>04</span><h3>基于资料提问</h3><p>进入问明德AI，保留明确的知识范围。</p></div></div><div class="inline-notice">${icon('info')}这是中文界面交互原型。示例数据、上传、整理和问答均未连接后端。</div>`);break;
    case 'list-help':showModal('资料列表',`<p class="reading-text">文件状态说明资料能否检索；AI整理状态说明摘要、观点与证据的整理进度。两项状态独立展示。</p>`);break;
    case 'toggle-sidebar':document.body.classList.toggle('nav-open');break;
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='space-search'){state.centerQuery=e.target.value;updateCards();}
  if(e.target.id==='asset-search'){state.assetQuery=e.target.value;state.selected.clear();updateAssets();}
});
document.addEventListener('change',e=>{
  if(e.target.id==='space-sort'){state.centerSort=e.target.value;updateCards();}
  if(e.target.id==='space-scope'){state.centerScope=e.target.value;render();}
  if(e.target.id==='ai-filter'){state.aiStatus=e.target.value;state.selected.clear();updateAssets();}
  if(e.target.id==='asset-sort'){state.sort=e.target.value;updateAssets();}
  if(e.target.classList.contains('asset-checkbox')){e.target.checked?state.selected.add(e.target.value):state.selected.delete(e.target.value);updateAssets();}
  if(e.target.id==='select-all'){filteredAssets(currentRoute.spaceId).forEach(a=>e.target.checked?state.selected.add(a.id):state.selected.delete(a.id));updateAssets();}
  if(e.target.id==='upload-file')selectFile(e.target.files[0]);
});
function selectFile(file){
  if(!file)return;
  const formats=['pdf','docx','xlsx','pptx','csv','txt','md','png','jpg','jpeg'];
  const ext=file.name.split('.').pop().toLowerCase();
  if(!formats.includes(ext)||file.size>50*1024*1024){$('#upload-file').value='';$('#upload-file-info').innerHTML=`<p class="form-error">${!formats.includes(ext)?'此示例不支持该文件格式。':'文件超过 50MB，请选择更小的文件。'}</p>`;return;}
  $('#upload-title-input').value=file.name.replace(/\.[^.]+$/,'');
  $('#upload-file-info').innerHTML=`<div class="selected-file">${icon('file')}<span><b>${safe(file.name)}</b><small>${(file.size/1024/1024).toFixed(2)} MB</small></span>${icon('checkCircle')}</div>`;
}
document.addEventListener('dragover',e=>{if(e.target.closest('#drop-zone')){e.preventDefault();$('#drop-zone').classList.add('dragging');}});
document.addEventListener('dragleave',e=>{if(e.target.closest('#drop-zone'))$('#drop-zone').classList.remove('dragging');});
document.addEventListener('drop',e=>{
  if(!e.target.closest('#drop-zone'))return;e.preventDefault();$('#drop-zone').classList.remove('dragging');
  const file=e.dataTransfer.files[0];if(file){const dt=new DataTransfer();dt.items.add(file);$('#upload-file').files=dt.files;selectFile(file);}
});
document.addEventListener('submit',async e=>{
  if(e.target.id==='create-space-form'){
    e.preventDefault();const f=new FormData(e.target);const s={id:`space-${Date.now()}`,name:f.get('name').trim(),type:f.get('type'),description:f.get('description').trim()||'汇集资料，沉淀工作经验',owner:'林晓',members:1,updated:'刚刚',updatedAt:new Date().toISOString(),assetCount:0,categoryCount:0,icon:'book',color:'purple',categories:['未分类'],visibility:f.get('visibility')};if(!s.name)return;
    spaces.push(s);save('mingde-spaces',spaces);closeModal();state.centerTab='全部类型';state.view='全部';state.centerQuery='';openSpace(s.id);toast('知识库已创建在本地原型中');
  }
  if(e.target.id==='settings-form'){
    e.preventDefault();const f=new FormData(e.target),s=spaces.find(s=>s.id===e.target.dataset.id);s.name=f.get('name').trim();s.description=f.get('description').trim();if(!s.name)return;s.updatedAt=new Date().toISOString();s.updated='刚刚';save('mingde-spaces',spaces);closeModal();render();toast('示例知识库设置已保存');
  }
  if(e.target.id==='chat-form'){e.preventDefault();sendQuestion($('#chat-input').value);}
  if(e.target.id==='upload-form'){
    e.preventDefault();const file=$('#upload-file').files[0];if(!file)return;const f=new FormData(e.target),spaceId=currentRoute.spaceId;const a={id:`asset-${Date.now()}`,spaceId,title:f.get('title').trim(),format:file.name.split('.').pop().toUpperCase(),summary:'仅保存本地资料记录，原文件尚未上传，内容处理待接入。',category:f.get('category'),owner:'林晓',updated:'刚刚',updatedAt:new Date().toISOString(),fileStatus:'processing',aiStatus:'not_started',localOnly:true,tags:['本地记录'],fileSize:`${(file.size/1024/1024).toFixed(2)} MB`,pages:null,evidence:[],keyPoints:[]};
    if(!a.title)return;assets.unshift(a);const s=spaces.find(s=>s.id===spaceId);s.assetCount++;s.updated='刚刚';s.updatedAt=new Date().toISOString();save('mingde-spaces',spaces);save('mingde-assets',assets.filter(a=>!seedAssets.some(x=>x.id===a.id)));closeModal();render();toast('本地资料记录已添加，文件上传与处理服务尚未接入');
  }
});
document.addEventListener('keydown',e=>{
  if(e.target.matches('.detail-tabs [role="tab"]') && ['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
    e.preventDefault();
    const tabs = [...$('.detail-tabs').querySelectorAll('[role="tab"]')];
    const current = tabs.indexOf(e.target);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
  }
  if(e.key==='Escape'){if($('.modal-backdrop,.upload-backdrop'))closeModal();else if($('.detail-drawer'))closeDetail();}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&!$('#overlays').children.length){e.preventDefault();($('#space-search')||$('#asset-search')||$('#chat-input'))?.focus();}
  if(e.target.id==='chat-input'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendQuestion(e.target.value);}
  if(e.key==='Tab'&&$('#overlays').children.length){
    const dialog=$('#overlays [role="dialog"]');const focusable=[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select,textarea,summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);if(!first){e.preventDefault();dialog.focus();}else if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}
  }
});
window.addEventListener('popstate',event=>{dismissOverlay();state.detailReturn=event.state?.detailReturn || null;render();});
render();if($('#space-result-count'))updateCards();if($('#asset-count'))updateAssets();
