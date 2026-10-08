import './detail.css';
import { icon } from './icons.js';

const safe = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const fileLabels = { ready: '可检索', processing: '处理中', failed: '需处理' };
const aiLabels = { completed: '完整整理', partial: '部分整理', running: '整理中', not_started: '尚未整理', failed: '整理失败', blocked: '安全阻止' };
const tabs = ['概览', '原文', 'AI理解', '证据', '版本', '资料信息'];
const textOf = value => typeof value === 'string' ? value : value?.text || value?.title || value?.name || '';
const validPage = evidence => evidence?.sourceType !== '历史规则' && Number.isInteger(evidence?.page) && evidence.page > 0;
const verified = evidence => evidence?.verification === '已核验' && Boolean(evidence.verifiedBy) && Boolean(evidence.verifiedAt);
const evidenceStatus = evidence => verified(evidence) ? '已核验' : '待核验';
const extractionLabel = evidence => evidence.sourceType === '历史规则' ? '历史规则' : evidence.sourceType === 'AI生成' ? 'AI整理' : evidence.sourceType || '未提供';

function fileBadge(asset) {
  const format = ({ DOCX: '文档', PPTX: '演示', XLSX: '表格', TXT: '文本', MD: '文本', PNG: '图片', JPG: '图片', JPEG: '图片' })[asset.format] || asset.format || '文件';
  return `<span class="detail-file-badge format-${safe(asset.format).toLowerCase()}">${icon('file')}<b>${safe(format)}</b></span>`;
}

function status(kind, value) {
  const label = (kind === 'file' ? fileLabels : aiLabels)[value] || '未提供';
  return `<span class="detail-state ${kind}-${safe(value)}"><i aria-hidden="true"></i>${safe(label)}</span>`;
}

function note(message, warning = false) {
  return `<div class="detail-note ${warning ? 'warning' : ''}">${icon(warning ? 'warning' : 'info')}<p>${safe(message)}</p></div>`;
}

function empty(title, message, action = '') {
  return `<div class="detail-empty">${icon('sparkles')}<h3>${safe(title)}</h3><p>${safe(message)}</p>${action}</div>`;
}

function metadataRows(rows) {
  return rows.map(([label, value]) => `<dt>${safe(label)}</dt><dd>${safe(value || '未提供')}</dd>`).join('');
}

function processingStrip(asset) {
  const ready = asset.fileStatus === 'ready';
  const failed = asset.fileStatus === 'failed';
  const rows = [
    ['原文件', asset.localOnly ? '未上传' : '已保存', asset.localOnly ? 'clock' : 'checkCircle', asset.localOnly ? 'pending' : 'success'],
    ['内容解析', asset.localOnly ? '待接入处理' : ready ? '已完成' : failed ? '需处理' : '处理中', ready ? 'checkCircle' : failed ? 'warning' : 'clock', ready ? 'success' : failed ? 'warning' : 'pending'],
    ['检索', asset.localOnly ? '待接入处理' : fileLabels[asset.fileStatus] || '未提供', ready ? 'checkCircle' : failed ? 'warning' : 'clock', ready ? 'success' : failed ? 'warning' : 'pending'],
    ['AI整理', aiLabels[asset.aiStatus] || '未提供', asset.aiStatus === 'completed' ? 'checkCircle' : ['failed', 'blocked'].includes(asset.aiStatus) ? 'warning' : 'sparkles', asset.aiStatus === 'completed' ? 'success' : ['failed', 'blocked', 'partial'].includes(asset.aiStatus) ? 'warning' : 'pending'],
  ];
  return `<div class="detail-process-strip" aria-label="资料处理情况">${rows.map(([label, value, glyph, tone]) => `<div class="detail-process-item ${tone}"><span class="detail-process-icon">${icon(glyph)}</span><div><span>${label}</span><b>${safe(value)}</b></div></div>`).join('')}</div>`;
}

function recovery(asset) {
  if (asset.fileStatus === 'failed') return `<div class="detail-recovery">${note(asset.failureReason || '文件处理未完成，资料暂不可检索。', true)}<button class="btn" data-action="retry-file" data-id="${safe(asset.id)}">${icon('refresh')}重新处理</button></div>`;
  if (asset.aiStatus === 'failed') return `<div class="detail-recovery">${note(asset.failureReason || 'AI整理未完成。资料仍可检索，可以继续阅读或提问。', true)}<button class="btn" data-action="retry-ai" data-id="${safe(asset.id)}">${icon('refresh')}重新整理</button></div>`;
  if (asset.aiStatus === 'blocked') return note(asset.failureReason || 'AI整理已被安全策略阻止，请由资料负责人确认使用范围。', true);
  return '';
}

function overview(asset) {
  const hasUnderstanding = ['completed', 'partial'].includes(asset.aiStatus);
  const points = (asset.keyPoints || []).slice(0, 3);
  return `<section class="detail-overview">
    ${processingStrip(asset)}
    ${asset.localOnly ? note('当前仅保存了本地资料记录，原文件尚未上传，也未进行解析或建立检索索引。') : ''}
    ${asset.aiStatus === 'partial' ? note('AI尚未完整覆盖这份资料，以下内容仅反映已完成部分。') : ''}
    ${recovery(asset)}
    <section class="detail-block"><div class="detail-section-heading"><h3>${icon('sparkles')}AI摘要</h3><span class="detail-ai-label">AI整理内容</span></div>
      ${hasUnderstanding ? `<p class="detail-reading">${safe(asset.detailSummary || asset.summary || '尚无摘要内容。')}</p>` : `<div class="detail-summary-empty"><h4>${asset.aiStatus === 'running' ? 'AI摘要正在整理中' : '尚未生成AI摘要'}</h4><p>${asset.localOnly ? '接入文件与处理服务后，可上传原文件并进行AI整理。' : asset.fileStatus === 'ready' ? '资料已可检索，你仍可以阅读原文或基于资料提问。' : '原文件已保存，文件处理完成后可检索并进行AI整理。'}</p>${asset.fileStatus === 'ready' && asset.aiStatus === 'not_started' ? `<button class="btn" data-action="retry-ai" data-id="${safe(asset.id)}">${icon('sparkles')}开始整理</button>` : ''}</div>`}
    </section>
    ${hasUnderstanding && points.length ? `<section class="detail-block"><div class="detail-section-heading"><h3>值得关注</h3><span class="detail-subtle">${points.length} 条</span></div><ol class="detail-focus-list">${points.map((point, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><p>${safe(textOf(point))}</p></li>`).join('')}</ol></section>` : ''}
    <div class="detail-overview-bottom"><span>${icon('quote')}理解的依据，始终可以回到原文</span><button class="text-btn" data-action="detail-tab" data-tab="证据">查看原文证据 ${icon('arrow')}</button></div>
  </section>`;
}

function understanding(asset) {
  if (!['completed', 'partial'].includes(asset.aiStatus)) {
    const title = { running: 'AI正在整理资料', failed: 'AI整理失败', blocked: '本次整理已被安全阻止', not_started: '尚未生成AI理解' }[asset.aiStatus] || '尚无AI理解内容';
    const message = asset.failureReason || (asset.fileStatus === 'ready' ? '资料仍可检索，你可以继续查看原文和提问。' : '文件处理完成后可以进行AI整理。');
    const action = asset.fileStatus === 'ready' && ['failed', 'not_started'].includes(asset.aiStatus) ? `<button class="btn" data-action="retry-ai" data-id="${safe(asset.id)}">${icon('sparkles')}${asset.aiStatus === 'failed' ? '重新整理' : '开始整理'}</button>` : '';
    return empty(title, message, action);
  }
  const points = asset.keyPoints || [];
  return `${asset.aiStatus === 'partial' ? note('本次AI整理尚未完整覆盖资料，以下内容反映已完成部分。') : ''}
    <section class="detail-block"><div class="detail-section-heading"><h3>${icon('sparkles')}AI摘要</h3></div><p class="detail-reading">${safe(asset.detailSummary || asset.summary)}</p></section>
    <section class="detail-block"><div class="detail-section-heading"><h3>关键对象</h3><span class="detail-subtle">${(asset.entities || []).length} 个</span></div>${asset.entities?.length ? `<div class="detail-entity-tags">${asset.entities.map(entity => `<span>${icon('users')}${safe(textOf(entity))}</span>`).join('')}</div>` : '<p class="detail-subtle">暂无关键对象记录</p>'}</section>
    <section class="detail-block"><div class="detail-section-heading"><h3>关键观点</h3><span class="detail-subtle">${points.length} 条</span></div>${points.length ? points.map((point, index) => `<article class="detail-claim"><span>${String(index + 1).padStart(2, '0')}</span><div><p>${safe(textOf(point))}</p><button class="text-btn" data-action="detail-tab" data-tab="证据">${icon('link')}查看原文证据 ${icon('arrow')}</button></div></article>`).join('') : '<p class="detail-subtle">暂无关键观点记录</p>'}</section>
    <section class="detail-block"><div class="detail-section-heading"><h3>关联洞察</h3><span class="detail-ai-label">AI分析建议</span></div>${asset.insights?.length ? asset.insights.map(insight => `<div class="detail-insight">${icon('sparkles')}<p>${safe(textOf(insight))}</p></div>`).join('') : '<p class="detail-subtle">暂无关联洞察记录</p>'}</section>`;
}

function evidenceMetadata(asset, evidence) {
  return `<dl class="detail-evidence-metadata">${metadataRows([
    ['原文来源', asset.title],
    ['原文位置', validPage(evidence) ? `第 ${evidence.page} 页` : '待核验'],
    ['证据提取', extractionLabel(evidence)],
    ['核验状态', evidenceStatus(evidence)],
  ])}${verified(evidence) ? metadataRows([['核验记录', `${evidence.verifiedBy} · ${evidence.verifiedAt}`]]) : ''}</dl>`;
}

function evidenceCard(asset, evidence, index) {
  const reliable = validPage(evidence);
  return `<article class="detail-evidence-card" id="evidence-${safe(evidence.id)}">
    <header class="detail-evidence-head"><span>${icon('quote')}证据 ${String(index + 1).padStart(2, '0')}</span><span class="detail-verification ${verified(evidence) ? 'verified' : ''}">${icon(verified(evidence) ? 'checkCircle' : 'clock')}${evidenceStatus(evidence)}</span></header>
    <blockquote>${safe(evidence.quote)}</blockquote>
    ${evidenceMetadata(asset, evidence)}
    ${!reliable ? note(evidence.sourceType === '历史规则' ? '历史规则未提供可靠位置，请在原文中确认。' : '当前证据未提供可靠位置，请在原文中确认。', true) : ''}
    ${evidence.claim ? `<div class="detail-related-claim"><span>关联观点</span><p>${safe(evidence.claim)}</p></div>` : ''}
    <footer><button class="text-btn" data-action="detail-tab" data-tab="AI理解">${icon('link')}查看关联观点</button><button class="btn detail-locate-button" data-action="${reliable ? 'locate-evidence' : 'open-source-unlocated'}" data-id="${safe(evidence.id)}">${icon(reliable ? 'link' : 'file')}${reliable ? '定位原文' : '查看原文'} ${icon('arrow')}</button></footer>
  </article>`;
}

function evidenceView(asset) {
  if (!asset.evidence?.length) return empty('暂无原文证据', '当前没有可展示的证据记录。你可以先阅读原文。', '<button class="btn" data-action="detail-tab" data-tab="原文">查看原文</button>');
  return `<div class="detail-evidence-title"><div><h3>原文证据</h3><p>对照来源，核验每一个理解。</p></div><span>${asset.evidence.length} 条证据</span></div><div class="detail-evidence-list">${asset.evidence.map((evidence, index) => evidenceCard(asset, evidence, index)).join('')}</div>`;
}

function examplePaper(asset, evidence) {
  const reliable = validPage(evidence);
  return `<article class="detail-example-paper"><div class="detail-paper-label">明德公益基金会 <span>示例原文</span></div><h2>${safe(asset.title)}</h2><div class="detail-paper-divider"></div>
    <h3>${evidence ? '相关内容示例' : '资料内容示例'}</h3>
    <p>${safe(asset.summary)}</p>
    <p>以下为界面示例内容，并非这份资料的真实原文件。阅读时请对照真实原文，确认引文、上下文与资料版本。</p>
    ${reliable ? `<p class="highlight-source detail-source-highlight">${safe(evidence.quote)}</p>` : `<p>实际内容、章节结构及原文位置，以资料原文件为准。请在完整资料中阅读上下文，再确认相关观点。</p>`}
    <h3>阅读与核验</h3><p>核验时请同时确认引文、上下文和资料版本。原文可定位并不代表观点已经通过人工核验。</p>
    <footer><span>界面示例 · 非真实原文件</span>${reliable ? `<span>示例位置：第 ${evidence.page} 页</span>` : '<span>原文位置未指定</span>'}</footer>
  </article>`;
}

function sourceView(asset, state) {
  if (asset.localOnly) return empty('原文件尚未上传', '原文件未上传，仅保存了本地资料记录。接入文件服务后可预览。');
  const evidence = asset.evidence?.find(item => item.id === state.evidence);
  const split = Boolean(state.sourceSplit && evidence);
  const reliable = validPage(evidence);
  const viewer = `<div class="detail-source-viewer"><div class="detail-source-toolbar"><span>${icon('file')}示例原文</span><span>${evidence ? reliable ? `第 ${evidence.page} 页 · 共 ${asset.pages || '—'} 页` : '位置待核验' : '原文阅读示例'}</span><button class="text-btn" data-action="download" data-id="${safe(asset.id)}">${icon('download')}下载示例文本</button></div>${evidence ? `<div class="detail-source-note ${reliable ? '' : 'warning'}">${icon(reliable ? 'link' : 'warning')}<span>${reliable ? '示例片段已高亮，实际定位需连接原文服务。' : '没有可靠定位信息，未指定页码或高亮位置。'}</span></div>` : ''}<div class="detail-source-canvas">${examplePaper(asset, evidence)}</div></div>`;
  if (!split) return viewer;
  const index = asset.evidence.findIndex(item => item.id === evidence.id);
  return `<div class="detail-source-split"><aside class="detail-source-evidence"><button class="text-btn detail-back-to-evidence" data-action="detail-tab" data-tab="证据">${icon('back')}返回全部证据</button><div class="detail-source-evidence-title"><span>证据 ${String(index + 1).padStart(2, '0')}</span><span class="detail-verification ${verified(evidence) ? 'verified' : ''}">${evidenceStatus(evidence)}</span></div><blockquote>${safe(evidence.quote)}</blockquote>${evidenceMetadata(asset, evidence)}${!reliable ? note('位置需要在原文件中核验，当前未指定页码。', true) : ''}${evidence.claim ? `<div class="detail-related-claim"><span>关联观点</span><p>${safe(evidence.claim)}</p></div>` : ''}<p class="detail-source-disclaimer">请结合原文上下文确认。证据提取与人工核验是两个独立环节。</p></aside>${viewer}</div>`;
}

function versionView(asset) {
  const versions = asset.versions || [{ version: asset.version, date: asset.created, current: true }];
  return `<div class="detail-section-heading"><h3>版本记录</h3><span class="detail-subtle">${versions.length} 个版本</span></div><p class="detail-reading-caption">查看当前版本与历史记录。</p><div class="detail-version-list">${versions.map(version => `<article class="detail-version-item ${version.current ? 'current' : ''}"><span class="detail-version-dot"></span><div><div class="detail-version-title"><h4>${safe(version.version || version.name || '版本未提供')}</h4>${version.current ? '<span>当前版本</span>' : ''}</div><p>${safe(version.date || version.createdAt || '时间未提供')}</p>${version.note ? `<p class="detail-version-note">${safe(version.note)}</p>` : ''}<small>${safe(asset.title)}</small></div></article>`).join('')}</div>`;
}

function infoView(asset) {
  return `<section class="detail-block"><div class="detail-section-heading"><h3>基本信息</h3></div><dl class="detail-metadata">${metadataRows([
    ['文件类型', asset.format], ['文件大小', asset.fileSize], ['分类', asset.category],
    ['标签', asset.tags?.join('、') || '无'], ['负责人', asset.owner], ['敏感等级', asset.sensitivity],
    ['创建时间', asset.created], ['更新时间', asset.updated], ['当前版本', asset.version], ['页数', asset.pages],
  ])}</dl></section><details class="detail-technical"><summary><span>${icon('settings')}技术详情</span>${icon('down')}</summary><dl class="detail-metadata">${metadataRows([
    ['资料ID', asset.id], ['内容分片数量', asset.chunkCount], ['文件哈希', asset.fileHash],
    ['AI运行ID', asset.runId], ['模型', asset.model], ['提示词版本', asset.promptVersion],
    ['生成时间', asset.generatedAt], ['内容覆盖率', asset.coverage != null ? `${asset.coverage}%` : '未提供'],
  ])}</dl><p>当前原型未连接真实文件与处理服务。</p></details>`;
}

export function renderDrawer(asset, state, spaces) {
  const tab = tabs.includes(state.drawerTab) ? state.drawerTab : '概览';
  const content = tab === '原文' ? sourceView(asset, state) : tab === 'AI理解' ? understanding(asset) : tab === '证据' ? evidenceView(asset) : tab === '版本' ? versionView(asset) : tab === '资料信息' ? infoView(asset) : overview(asset);
  const split = tab === '原文' && state.sourceSplit && asset.evidence?.some(evidence => evidence.id === state.evidence);
  const space = spaces.find(item => item.id === asset.spaceId);
  return `<div class="detail-backdrop" data-action="close-detail"><section class="detail-drawer refined-detail ${state.expanded ? 'expanded' : ''} ${split ? 'source-split-active' : ''}" role="dialog" aria-modal="true" aria-labelledby="detail-title" tabindex="-1">
    <header class="detail-header"><div class="detail-top">${fileBadge(asset)}<div class="detail-title-wrap"><span class="detail-eyebrow">${safe(space?.name || '知识库')} <span>/</span> ${safe(asset.category || '未分类')}</span><h2 id="detail-title">${safe(asset.title)}</h2></div><button class="icon-btn" data-action="expand-detail" aria-label="${state.expanded ? '收起' : '展开'}详情" title="${state.expanded ? '收起' : '展开'}详情">${icon('expand')}</button><button class="icon-btn" data-action="close-detail" aria-label="关闭资料详情" title="关闭资料详情">${icon('close')}</button></div>
      <div class="detail-status"><span><small>文件</small>${status('file', asset.fileStatus)}</span><span><small>AI整理</small>${status('ai', asset.aiStatus)}</span><span class="detail-header-updated">${safe(asset.owner)} · ${safe(asset.updated)}</span></div>
      <div class="detail-actions"><button class="btn" data-action="detail-tab" data-tab="原文">${icon('file')}查看原文</button><button class="btn" data-action="download" data-id="${safe(asset.id)}">${icon('download')}下载示例文本</button><button class="btn detail-ask-button" data-action="ask-asset" data-id="${safe(asset.id)}" ${asset.fileStatus !== 'ready' ? 'disabled title="资料处理完成后可基于资料提问"' : ''}>${icon('sparkles')}基于资料提问</button></div>
    </header>
    <nav class="detail-tabs" role="tablist" aria-label="资料详情">${tabs.map(item => `<button id="detail-tab-${item}" role="tab" aria-selected="${tab === item}" aria-controls="detail-tabpanel" tabindex="${tab === item ? 0 : -1}" class="${tab === item ? 'active' : ''}" data-action="detail-tab" data-tab="${item}">${item}${item === '证据' ? `<small>${asset.evidence?.length || 0}</small>` : ''}</button>`).join('')}</nav>
    <div id="detail-tabpanel" class="detail-body ${tab === '原文' ? 'detail-source-body' : ''}" role="tabpanel" aria-labelledby="detail-tab-${tab}" tabindex="0">${content}</div>
    <footer class="detail-footer">${icon('shield')}<span>资料范围：${safe(space?.name || '知识库')}</span><span>示例数据 · 请以真实原文为依据</span></footer>
  </section></div>`;
}
