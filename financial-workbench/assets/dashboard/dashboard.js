'use strict';
const $ = id => document.getElementById(id);
const labels = { accounting: '会计', securities: '证券', auditing: '审计', narrative: '文字', disclosures: '企业披露' };
const state = { session: null, profiles: {}, job: null, timer: null, heartbeat: null, revision: 0, result: null, local: null, selected: null, files: [], importing: false, category: 'all', running: false };
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const link = (url, title) => {
  try { const u = new URL(url); if (u.protocol !== 'https:') return escapeHtml(title); return `<a href="${escapeHtml(u.href)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`; } catch { return escapeHtml(title); }
};
const statusTag = s => `<span class="tag ${s === 'supported' ? 'ok' : s === 'conflict' ? 'bad' : 'ask'}">${s === 'supported' ? '有依据支持' : s === 'conflict' ? '发现冲突' : '待核查'}</span>`;
function setBanner(text, error = false) { $('runBanner').textContent = text; $('runBanner').classList.toggle('error', error); }
function headers() { return {'Content-Type':'application/json', 'X-Session-Id':state.session?.sessionId || '', 'X-Session-Token':state.session?.token || ''}; }
async function api(path, body) {
  const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: headers(), body: body === undefined ? undefined : JSON.stringify(body), cache:'no-store' });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || `请求失败 ${r.status}`); return data;
}
function money(value, currency) { return Number.isFinite(value) ? `${currency === 'UNKNOWN' ? '币种未定' : currency} ${value.toLocaleString('zh-CN', {maximumFractionDigits:6})}m` : '—'; }
function currencyOf(token) {
  if (/^(?:USD|US\$)$/i.test(token)) return 'USD'; if (/^(?:AUD|A\$)$/i.test(token)) return 'AUD';
  if (/^(?:CNY|RMB|CN¥|人民币)$/i.test(token)) return 'CNY'; if (/^(?:HKD|HK\$|港币)$/i.test(token)) return 'HKD';
  if (/^(?:EUR|€)$/i.test(token)) return 'EUR'; if (/^(?:GBP|£)$/i.test(token)) return 'GBP';
  if (/^JPY$/i.test(token)) return 'JPY'; if (/^SGD$/i.test(token)) return 'SGD'; return 'UNKNOWN';
}
function findMoneyNear(text, keywords, fallback = 'AUTO') {
  const lower = text.toLowerCase(), found = [];
  const pattern = /(?:(USD|AUD|CNY|RMB|HKD|EUR|GBP|JPY|SGD|US\$|HK\$|A\$|CN¥|人民币|港币|\$|€|£)\s*)?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(billion|million|bn|m\b|亿元|亿|万元|万)?/gi;
  for (const match of text.matchAll(pattern)) {
    if (!match[1] && !match[3]) continue;
    if (/^\s*(?:per\b[^.;,\n]{0,35}\bshare|\/\s*share|每股)/i.test(text.slice(match.index + match[0].length))) continue;
    if (/每股\s*$/.test(text.slice(Math.max(0,match.index-8),match.index))) continue;
    for (const word of keywords) {
      let pos = lower.indexOf(word.toLowerCase());
      while (pos >= 0) {
        const end = pos + word.length, amountEnd = match.index + match[0].length;
        const gap = match.index >= end ? text.slice(end, match.index) : amountEnd <= pos ? text.slice(amountEnd,pos) : null;
        if (gap !== null && gap.length <= 30 && /^(?:\s|[:,：，\-]|为|约|达|的|现金|合计|人民币|\b(?:of|was|were|is|at|in|the|cash|and|approximately|about|total|estimated)\b)*$/i.test(gap)) {
          const unit = (match[3] || '').toLowerCase(), multiplier = /^(b|bn)/.test(unit) ? 1000 : /^亿/.test(unit) ? 100 : /^万/.test(unit) ? .01 : unit ? 1 : .000001;
          let currency = currencyOf(match[1] || ''); const currencyInferred = currency === 'UNKNOWN' && fallback !== 'AUTO'; if (currencyInferred) currency = fallback;
          found.push({value:Number(match[2].replace(/,/g,''))*multiplier, currency, currencyInferred, index:match.index, quote:match[0].trimEnd(), distance:gap.length});
        }
        pos = lower.indexOf(word.toLowerCase(), pos + word.length);
      }
    }
  }
  return found.sort((a,b)=>a.distance-b.distance || a.index-b.index)[0] || null;
}
function localAnalyze(text, currency, region) {
  const checks = [], entries = [], amounts = {};
  const specs = {
    price: [['equity value','purchase price','cash consideration','for','股权价值','收购对价','购买价','总对价'], 'Cr Consideration payable / cash (candidate)', 'credit'],
    contingent: [['contingent consideration','或有对价'], 'Cr Contingent consideration (candidate)', 'credit'],
    netAssets: [['net assets at fair value','net assets','可识别净资产','净资产公允价值'], 'Dr Identifiable net assets (candidate)', 'debit'],
    fees: [['transaction advisory fees','advisory fees','交易顾问费','收购费用'], 'Dr Acquisition costs / allocation pending', 'debit'],
    termination: [['termination fee','终止费','分手费'], 'Memo: termination fee classification pending', 'debit']
  };
  for (const [id,[keywords,account,side]] of Object.entries(specs)) {
    const amount = findMoneyNear(text, keywords, currency); if (!amount) continue; amounts[id] = amount;
    entries.push({account, debit:side==='debit'?amount.value:null, credit:side==='credit'?amount.value:null, currency:amount.currency, quote:amount.quote, note:'即时提取候选；账簿层次、确认日期、对方科目与计量基础待核对。' + (amount.currencyInferred ? '币种由本次选项补充，原文未明确。' : '')});
  }
  function check(title, regex, analysis) { const m = regex.exec(text); if (m) checks.push({title,quote:m[0],analysis,status:'pending',category:'narrative',sourceUrls:[]}); }
  check('计划交易与交割确认应区分', /will (?:pay|acquire|assume)|signed.{0,35}agreement|拟收购|计划支付|尚未交割|预计完成/i, '需确认取得控制或其他确认触发日；签约、融资承诺不等于交割或到账。');
  check('每股价格不能直接当作总对价', /(?:USD|US\$|\$)?\s*\d+(?:\.\d+)?\s*per\b[^.;\n]{0,25}share|每股.{0,15}\d+/i, '核对股数、总对价口径与适用日期；不将每股金额列为交易总额。');
  check('融资承诺与实际到账分别处理', /commitment|to be received|承诺融资|融资承诺|将收到/i, '需要区分承诺、已借款、现金到账、费用和后续再融资，不从承诺金额生成现金分录。');
  check('延迟交割费需要条款与日期', /ticking fee|延迟交割费/i, '需股数、天数、cap及交割日；金额不足时只记备忘，不填零或配平。');
  check('币种不能仅由美元符号决定', /(?<![A-Za-z])\$\s*\d/, currency==='AUTO'?'$ 本身不足以区分 USD/AUD 等；补充资料或选择分录币种。':'未明确币种的金额使用本次所选币种作为假设，仍需核对原始文件。');
  if (region==='US') check('NCI 计量政策需核对 US GAAP', /proportionate share|按比例.{0,15}净资产/i, '不能直接沿用 IFRS 下的 NCI 计量选项；核对交易范围、ASC 条文与公允价值证据。');
  if ((amounts.price || amounts.contingent) && !amounts.netAssets) checks.push({title:'缺少 PPA／商誉计量依据',quote:amounts.price?.quote || amounts.contingent.quote,analysis:'暂不生成商誉差额；需可识别资产负债、收购日、NCI与对价计量资料。',status:'pending',category:'accounting',sourceUrls:[]});
  return {entries,checks,amounts};
}
function renderSource() {
  const text = $('dealText').value, quote = state.selected;
  if (!text) { $('sourceView').innerHTML='<span class="empty">开始后显示可点击的原文证据。</span>'; return; }
  const i = quote ? text.indexOf(quote) : -1;
  $('sourceView').innerHTML = i<0 ? escapeHtml(text) : escapeHtml(text.slice(0,i))+`<mark>${escapeHtml(quote)}</mark>`+escapeHtml(text.slice(i+quote.length));
  if(i>=0) $('sourceView').querySelector('mark')?.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function quoteButton(quote) { return quote && $('dealText').value.includes(quote) ? `<button class="pill evidence" data-quote="${escapeHtml(quote)}">原文</button>` : '<span class="empty">缺少证据</span>'; }
function renderEntries() {
  const rows = state.result?.journalEntries?.length ? state.result.journalEntries : state.local?.entries || [];
  $('entryRows').innerHTML = rows.map(e=>`<tr><td><strong>${escapeHtml(e.account)}</strong><p class="panel-tools">${escapeHtml(e.note)}</p></td><td class="amount">${money(e.debit,e.currency)}</td><td class="amount">${money(e.credit,e.currency)}</td><td>${quoteButton(e.quote)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">尚无有证据支持的分录候选；可能需要账簿、金额或交易资料。</td></tr>';
  $('metricEntries').textContent=rows.length; $('metricAmounts').textContent=Object.keys(state.local?.amounts || {}).length;
}
function card(f) { return `<article class="rule ${f.status==='supported'?'ok':f.status==='conflict'?'bad':'ask'}"><div class="rule-top"><h3>${escapeHtml(f.title)}</h3>${statusTag(f.status)}</div><p>${escapeHtml(f.analysis)}</p>${f.quote?`<blockquote>${escapeHtml(f.quote)}</blockquote>${quoteButton(f.quote)}`:''}${f.ruleReference?`<p class="panel-tools">依据：${escapeHtml(f.ruleReference)} · 版本：${escapeHtml(f.applicableVersion||'待核查')}</p>`:''}${f.suggestedWording?`<p><strong>建议文字：</strong>${escapeHtml(f.suggestedWording)}</p>`:''}<div class="source-links">${(f.sourceUrls||[]).map((u,i)=>link(u,`官方依据 ${i+1}`)).join(' · ')}</div></article>`; }
function renderFindings() {
  const findings=state.result?.findings || [];
  $('ruleList').innerHTML=findings.filter(f=>state.category==='all'||f.category===state.category).map(card).join('') || `<p class="empty">${state.running?'正在审查文字并检索官方条文…':state.result?'当前类别暂无发现。':'点击“开始审查”后显示联网对比结果。'}</p>`;
  $('metricFindings').textContent=findings.length;
}
function renderRegion() {
  const p=state.profiles[$('regionSelect').value]; if(!p)return;
  $('regionSummary').innerHTML=['accounting','securities','auditing'].map(k=>`<div><strong>${labels[k]}</strong><span>${escapeHtml(p[k])}</span></div>`).join('')+`<p class="panel-tools">${escapeHtml(p.scopeNote)}</p>`;
  $('sourceCatalog').innerHTML=p.sources.map(s=>`<p><span class="source-kind">${labels[s.category]}</span> ${link(s.url,s.title)}<small>${escapeHtml(s.accessNote)}</small></p>`).join('');
}
function renderResult() {
  $('reviewSummary').textContent=state.result?.summary || '';
  renderEntries();renderFindings();
  const sources=state.result?.sources || [];
  $('retrievedSection').hidden=!sources.length;
  const access={read:'正文已读',index:'目录入口',blocked:'访问受限','search-only':'仅搜索结果'};
  $('retrievedSources').innerHTML=sources.map(s=>`<article class="retrieved"><strong>${link(s.url,s.title)}</strong><p>${labels[s.category]} · ${escapeHtml(access[s.accessStatus]||s.accessStatus)} · ${escapeHtml(s.authority)}</p><p>${escapeHtml(s.ruleReference)} · ${escapeHtml(s.effectiveDate||'生效期待核查')}</p>${s.relevantExcerpt?`<blockquote>${escapeHtml(s.relevantExcerpt)}</blockquote>`:''}<small>检索：${escapeHtml(s.retrievedAt)}</small></article>`).join('');
  $('limitations').innerHTML=(state.result?.limitations||[]).length?`<strong>待补资料与本次限制</strong><ul>${state.result.limitations.map(v=>`<li>${escapeHtml(v)}</li>`).join('')}</ul>`:'';
}
function running(value) { state.running=value; $('startBtn').disabled=!state.session||value||state.importing; $('cancelBtn').hidden=!value; $('startBtn').textContent=value?'审查进行中…':'开始审查'; }
async function cancelJob() {
  clearTimeout(state.timer);const id=state.job;state.job=null;
  running(false);
  if(id&&state.session)try{await api('/api/cancel/'+id,{});}catch{}
}
function invalidate(message='输入或选项已变动，请点击“开始审查”重新核对。') {
  state.revision++;cancelJob();state.result=null;state.local=null;state.selected=null;
  $('reviewSummary').textContent='';$('liveEvents').textContent='';$('limitations').textContent='';$('retrievedSection').hidden=true;
  $('retrievedSources').textContent='';$('localChecks').innerHTML='<p class="empty">等待开始。</p>';
  $('metricAmounts').textContent='0';$('metricEntries').textContent='0';$('metricStatus').textContent='待开始';
  $('entryRows').innerHTML='<tr><td colspan="4" class="empty">点击“开始审查”重新生成。</td></tr>';
  renderFindings();renderSource();setBanner(message);
}
async function poll(id, revision) {
  if(state.job!==id||state.revision!==revision)return;
  try{
    const j=await api('/api/jobs/'+id);
    if(state.job!==id||state.revision!==revision)return;
    setBanner(j.message,j.status==='error');
    $('liveEvents').innerHTML=(j.events||[]).slice(-4).map(e=>`<div>↗ ${escapeHtml(e.query)}</div>`).join('');
    if(j.status==='done'){state.result=j.result;state.job=null;running(false);$('metricStatus').textContent='待复核';renderResult();return;}
    if(j.status==='error'){state.job=null;running(false);$('metricStatus').textContent='未完成';return;}
    state.timer=setTimeout(()=>poll(id,revision),1200);
  }catch(e){if(state.revision!==revision)return;await cancelJob();$('metricStatus').textContent='未完成';setBanner(e.message,true);}
}
async function start() {
  if(!state.session)return setBanner('本机服务未连接，请运行 start-dashboard.cmd。',true);
  const text=$('dealText').value;if(!text.trim())return setBanner('请先粘贴文字或导入文件。',true);
  if(text.length>800000)return setBanner('最多审查 800,000 字符，请按章节拆分。',true);
  await cancelJob();const revision=++state.revision;
  state.result=null;state.local=localAnalyze(text,$('currencySelect').value,$('regionSelect').value);state.selected=null;
  $('localChecks').innerHTML=state.local.checks.map(card).join('')||'<p class="empty">未发现这些基础检查项；不代表已合规。联网审查继续进行。</p>';
  $('liveEvents').textContent='';$('reviewSummary').textContent='';$('limitations').textContent='';$('retrievedSection').hidden=true;
  renderSource();renderEntries();running(true);renderFindings();$('metricStatus').textContent='审查中';
  setBanner('已开始：文字检查已显示，正在联网搜索并读取所选地区的官方条文…');
  try{
    const j=await api('/api/review',{text,region:$('regionSelect').value,currency:$('currencySelect').value,documentType:$('documentType').value,reportingPeriod:$('reportingPeriod').value});
    if(state.revision!==revision){await api('/api/cancel/'+j.jobId,{});return;}
    state.job=j.jobId;poll(j.jobId,revision);
  }catch(e){if(state.revision===revision){running(false);$('metricStatus').textContent='未完成';setBanner(e.message,true);}}
}
function filterFiles(){const types={all:'.pdf,.docx,.xlsx,.xlsm,.xls,.csv,.tsv,.html,.htm,.xhtml,.xml,.txt,.s1,.json',pdf:'.pdf',word:'.docx',excel:'.xlsx,.xlsm,.xls,.csv,.tsv',disclosure:'.pdf,.html,.htm,.xhtml,.xml,.txt,.s1,.json'};$('files').accept=types[$('fileFormat').value];}
async function importFiles() {
  const files=[...$('files').files];if(!files.length)return;
  invalidate('正在本机提取文件文字…');state.importing=true;running(false);const revision=state.revision;
  for(const f of files){
    if(revision!==state.revision)break;
    try{
      if(f.size>25*1024*1024)throw new Error('超过单个文件 25 MB 上限。');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('读取文件失败。'));reader.readAsDataURL(f);});
      const result=await api('/api/import',{name:f.name,data});if(revision!==state.revision)break;
      const combined=[$('dealText').value,`[文件：${result.name}]\n${result.text}`].filter(Boolean).join('\n\n');
      if(combined.length>800000)throw new Error('合计文字超过 800,000 字符，请拆分后导入。');
      $('dealText').value=combined;state.files.push({name:result.name,characters:result.characters,warnings:result.warnings});
    }catch(e){if(revision===state.revision)state.files.push({name:f.name,error:e.message});}
  }
  state.importing=false;running(false);$('files').value='';$('charCount').textContent=$('dealText').value.length.toLocaleString()+' 字符';
  $('fileList').innerHTML=state.files.map(f=>`<div class="file-item ${f.error?'failed':''}"><strong>${escapeHtml(f.name)}</strong><small>${f.error?escapeHtml(f.error):`${f.characters.toLocaleString()} 字符`}</small>${(f.warnings||[]).map(w=>`<small class="warning">${escapeHtml(w)}</small>`).join('')}</div>`).join('');
  renderSource();if(revision===state.revision)setBanner('文件导入已处理。检查字符框和导入提示，然后点击“开始审查”。');
}
function clearContent(){invalidate('已清空本次内容。');$('dealText').value='';$('files').value='';$('reportingPeriod').value='';state.files=[];$('fileList').textContent='';$('charCount').textContent='0 字符';$('metricStatus').textContent='待输入';renderSource();}
function exportReview(){
  if(!$('dealText').value.trim())return setBanner('尚无可导出的原文。',true);
  const payload={schemaVersion:3,createdAt:new Date().toISOString(),sourceText:$('dealText').value,sourceOffsetUnit:'UTF-16 code units; end exclusive',region:$('regionSelect').value,currency:$('currencySelect').value,reportingPeriod:$('reportingPeriod').value,documentType:$('documentType').value,files:state.files,local:state.local,review:state.result,reviewState:state.running?'in-progress':state.result?'returned-for-human-review':'not-completed',amountUnit:'million',ledgerState:'unposted-incomplete-candidates'};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='financial-workbench-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function closeSession(){
  state.revision++;clearTimeout(state.timer);clearInterval(state.heartbeat);
  if(state.session)navigator.sendBeacon('/api/session/close',JSON.stringify(state.session));
  state.session=null;state.result=null;state.local=null;state.files=[];state.job=null;state.selected=null;
  $('dealText').value='';$('files').value='';$('fileList').textContent='';$('sourceView').textContent='';$('ruleList').textContent='';$('entryRows').textContent='';$('reviewSummary').textContent='';$('retrievedSources').textContent='';$('liveEvents').textContent='';$('localChecks').textContent='';$('limitations').textContent='';
}
async function init(){
  $('dealText').value='';$('files').value='';$('reportingPeriod').value='';
  try{
    const [profiles,health]=await Promise.all([fetch('/profiles.json',{cache:'no-store'}).then(r=>r.json()),api('/api/health')]);
    state.profiles=profiles;state.session=await api('/api/session',{});renderRegion();
    $('connection').textContent=health.codexAvailable?'本机已连接 · Codex 联网审阅':'本机已连接 · 缺少 Codex CLI';
    $('connection').classList.add('ready');running(false);
    state.heartbeat=setInterval(()=>{if(state.session)api('/api/heartbeat',{}).catch(()=>{});},15000);
  }catch(e){$('connection').textContent='本机服务未连接';setBanner('请运行 skill 目录中的 start-dashboard.cmd，然后重新打开本页。'+e.message,true);}
}
$('startBtn').addEventListener('click',start);$('cancelBtn').addEventListener('click',()=>{state.revision++;cancelJob();setBanner('已取消，联网结果未完成。');$('metricStatus').textContent='已取消';});
$('clearBtn').addEventListener('click',clearContent);$('exportBtn').addEventListener('click',exportReview);$('files').addEventListener('change',importFiles);$('fileFormat').addEventListener('change',filterFiles);
$('dealText').addEventListener('input',()=>{invalidate();$('charCount').textContent=$('dealText').value.length.toLocaleString()+' 字符';});
for(const id of ['regionSelect','currencySelect','documentType','reportingPeriod'])$(id).addEventListener('change',()=>{invalidate();if(id==='regionSelect')renderRegion();});
document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(v=>v.classList.toggle('active',v===b));renderFindings();}));
document.addEventListener('click',e=>{const b=e.target.closest('[data-quote]');if(b){state.selected=b.dataset.quote;renderSource();}});
window.addEventListener('pagehide',closeSession);window.addEventListener('pageshow',e=>{if(e.persisted){clearContent();init();}});
init();
