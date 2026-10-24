/* HSE-only, browser-local demonstration. Workbook records are never modified. */
'use strict';
window.HSEActionDetails = (() => {
  const KEY = 'lme-hse-action-demo-v1';
  const statuses = ['Open', 'In progress', 'Awaiting verification', 'Verified closed'];
  let selectedId = null, demoRole = 'Technician', message = '', drafts = {}, saved = {}, added = [], nextSequence = 1, persistent = true;
  const clone = value => JSON.parse(JSON.stringify(value));
  function records() { return [...DATA.hse, ...added]; }
  function record(id) { return records().find(r => r.hse_id === id); }
  function isDemo(id) { return added.some(r => r.hse_id === id); }
  function editor() { if (!ROLES.includes(state.role)) throw new Error('Choose a recognized demo role to manage actions.'); }
  function textField(input, key, label, max) {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    if (!value) throw new Error(label + ' is required.');
    if (value.length > max) throw new Error(label + ' must be ' + max + ' characters or fewer.');
    return value;
  }
  function optionalNumber(input, key, label) {
    const raw = input[key];
    if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) return null;
    if (!['string','number'].includes(typeof raw) || !Number.isFinite(Number(raw)) || Number(raw) < 0) throw new Error(label + ' must be a nonnegative number.');
    return Number(raw);
  }
  function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Action details are required.');
    const site_id = textField(input,'site_id','Site',30), asset_id = textField(input,'asset_id','Asset',30);
    if (!DATA.sites.some(s => s.site_id === site_id)) throw new Error('Choose a valid site.');
    if (!DATA.assets.some(a => a.asset_id === asset_id && a.site_id === site_id)) throw new Error('Choose an asset at the selected site.');
    const potential_severity = Number(input.potential_severity);
    if (!['number','string'].includes(typeof input.potential_severity) || !Number.isInteger(potential_severity) || potential_severity < 1 || potential_severity > 5) throw new Error('Potential severity must be a whole number from 1 to 5.');
    const due_date = textField(input,'due_date','Due date',10), parsed = new Date(due_date + 'T00:00:00Z');
    if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(due_date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== due_date) throw new Error('Enter a valid due date.');
    return {site_id,asset_id,potential_severity,due_date,hazard:textField(input,'hazard','Hazard',200),likelihood_band:textField(input,'likelihood_band','Likelihood band',60),control_gap:textField(input,'control_gap','Control gap',2000),action_owner:textField(input,'action_owner','Action owner',120),action_setup_usd:optionalNumber(input,'action_setup_usd','Setup estimate'),action_annual_usd:optionalNumber(input,'action_annual_usd','Annual estimate'),action_person_hours:optionalNumber(input,'action_person_hours','Required effort')};
  }
  function isSourceClosed(r) { return String(r.action_status).trim().toLowerCase() === 'closed'; }
  function isCritical(r) { return Number(r.potential_severity) === 5; }
  function reviewRole(r, role) { return isCritical(r) ? role === 'HSE Supervisor' : ROLES.includes(role); }
  function validClosure(r, item) {
    const last = item.history.at(-1);
    return item.status === 'Verified closed' && last?.action === 'Verified closure' && reviewRole(r, last.actor) && !!last.note.trim() && Number.isFinite(Date.parse(last.time));
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({version:1, actions:saved, demo_records:added, next_demo_sequence:nextSequence})); }
    catch (_) { persistent = false; }
  }
  function load() {
    let migrated = false;
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || '{}'), next = {};
      added = [];
      nextSequence = Number.isSafeInteger(stored?.next_demo_sequence) && stored.next_demo_sequence > 0 ? stored.next_demo_sequence : 1;
      if (stored?.version === 1 && Array.isArray(stored.demo_records)) {
        const counts = new Map();
        for (const item of stored.demo_records) {
          if (!item || typeof item.hse_id !== 'string') continue;
          const match = /^DEMO-HSE-(\d+)$/.exec(item.hse_id), sequence = match ? Number(match[1]) : 0;
          if (Number.isSafeInteger(sequence) && sequence > 0 && sequence < Number.MAX_SAFE_INTEGER) nextSequence = Math.max(nextSequence, sequence + 1);
          counts.set(item.hse_id,(counts.get(item.hse_id) || 0) + 1);
        }
        for (const item of stored.demo_records) {
          try {
            const sequence = Number(String(item?.hse_id || '').replace(/^DEMO-HSE-/,''));
            if (!item || item.record_type !== 'demo' || !Number.isSafeInteger(sequence) || sequence < 1 || item.hse_id !== 'DEMO-HSE-' + String(sequence).padStart(3,'0') || counts.get(item.hse_id) !== 1 || DATA.hse.some(r=>r.hse_id===item.hse_id) || typeof item.created_at !== 'string' || !Number.isFinite(Date.parse(item.created_at))) { migrated = true; continue; }
            added.push({...validate(item),hse_id:item.hse_id,record_type:'demo',action_status:'Open',closed_date:null,outcome:null,created_at:new Date(item.created_at).toISOString()});
          } catch (_) { migrated = true; }
        }
      }
      if (stored?.version === 1 && stored.actions && typeof stored.actions === 'object' && !Array.isArray(stored.actions)) {
        for (const [id, item] of Object.entries(stored.actions)) {
          const r = record(id);
          if (!r || isSourceClosed(r) || !item || !statuses.includes(item.status)) continue;
          const history = Array.isArray(item.history) ? item.history.filter(x => x && typeof x.actor === 'string' && typeof x.time === 'string' && typeof x.note === 'string' && typeof x.action === 'string').slice(-100).map(x=>({actor:x.actor.slice(0,100),time:x.time.slice(0,100),action:x.action.slice(0,100),note:x.note.slice(0,2000),evidence:String(x.evidence || '').slice(0,300)})) : [];
          const clean = {status:item.status, note:String(item.note || '').slice(0,2000), evidence:String(item.evidence || '').slice(0,300), history};
          if (clean.status === 'Verified closed' && !validClosure(r, clean)) {
            clean.status = 'Awaiting verification';
            clean.history = [...history,{actor:'System',time:new Date().toISOString(),action:'Verification required',note:isCritical(r)?'Critical closure requires a recorded HSE Supervisor verification. Previous demo notes and history are preserved.':'A valid supervisor verification note is required. Previous demo notes and history are preserved.',evidence:''}].slice(-100);
            migrated = true;
          }
          next[id] = clean;
        }
      }
      saved = next;
      if (migrated) persist();
    } catch (_) { saved = {}; added = []; nextSequence = 1; persistent = false; }
  }
  function create(input) {
    editor();
    const details = validate(input);
    if (!Number.isSafeInteger(nextSequence) || nextSequence >= Number.MAX_SAFE_INTEGER) throw new Error('The demo action ID range is exhausted.');
    let id;
    do { id = 'DEMO-HSE-' + String(nextSequence++).padStart(3,'0'); } while (record(id));
    const time = new Date().toISOString(), created = {...details,hse_id:id,record_type:'demo',action_status:'Open',closed_date:null,outcome:null,created_at:time};
    added.push(created);
    saved[id] = {status:'Open',note:'',evidence:'',history:[{actor:state.role,time,action:'Created demo action',note:'Simulated action created. Workbook history remains unchanged.',evidence:''}]};
    persist(); notify(created.site_id,'create');
    return clone(created);
  }
  function closeMissingDetail() {
    if (!document.querySelector('.hse-detail') || record(selectedId)) return;
    selectedId = null;
    document.getElementById('modal')?.close();
    if (typeof window.render === 'function') window.render();
  }
  function remove(id) {
    editor();
    const r = added.find(item=>item.hse_id===id);
    if (!r) throw new Error(DATA.hse.some(item=>item.hse_id===id) ? 'Workbook actions cannot be deleted. Only added demo actions can be removed.' : 'Demo action not found.');
    added = added.filter(item=>item.hse_id!==id);
    delete saved[id]; delete drafts[id];
    persist(); notify(r.site_id,'remove'); closeMissingDetail();
    return clone(r);
  }
  function notify(siteId, action) { window.dispatchEvent(new CustomEvent('hse-demo-change',{detail:{siteId:siteId || null,action}})); }
  function progress(r) { return isSourceClosed(r) ? {status:'Source closed', history:[]} : saved[r.hse_id] || {status:'Open', note:'', evidence:'', history:[]}; }
  function gate(siteId) {
    const validSite = DATA.sites.some(s => s.site_id === siteId);
    if (!validSite) return {validSite:false,critical:[],unresolved:[],held:true,clear:false};
    // Inspect every critical workbook and added demo action, regardless of UI filters.
    const critical = records().filter(r => r.site_id === siteId && isCritical(r) && !isSourceClosed(r));
    const unresolved = critical.filter(r => !validClosure(r, progress(r)));
    return {validSite:true,critical:clone(critical),unresolved:clone(unresolved),held:unresolved.length > 0,clear:unresolved.length === 0};
  }
  load();
  function holdMarkup(r) {
    const g = gate(r.site_id), held = g.held;
    const title = held ? `${siteName(r.site_id)} · Critical HSE hold` : g.critical.length ? 'Critical HSE hold cleared.' : `${siteName(r.site_id)} · No unresolved critical actions`;
    const sub = held ? `${g.unresolved.length} ${g.unresolved.length === 1 ? 'action still needs' : 'actions still need'} verified closure.` : 'Other implementation requirements and approvals still apply.';
    return `<div class="hse-detail-hold ${held?'is-held':'is-clear'}" role="status"><span class="hse-detail-hold-icon">${icon(held?'alert':'check')}</span><div><strong>${esc(title)}</strong><span>${esc(sub)}</span>${g.critical.length?`<div class="hse-detail-critical">${g.critical.map(x=>`<button type="button" data-hse-select="${esc(x.hse_id)}" aria-label="Open ${esc(x.hse_id)}">${esc(x.hse_id)} <span>${progress(x).status==='Verified closed'?'✓ Verified':'· '+esc(progress(x).status)}</span></button>`).join('')}</div>`:''}</div></div>`;
  }
  function sourceMarkup(r) {
    const finance = PERMISSIONS[state.role].finance;
    const fields = [['Site',siteName(r.site_id)],['Asset',r.asset_id],['Hazard',r.hazard],['Potential severity',r.potential_severity+' / 5'],['Likelihood band',r.likelihood_band],['Control gap',r.control_gap],['Action owner',r.action_owner],['Due date',date(r.due_date)],['Source status',r.action_status],['Closed date',date(r.closed_date)],['Outcome',r.outcome],['Required effort',r.action_person_hours==null?'Not supplied':r.action_person_hours+' h']];
    if(finance) fields.push(['Action setup',r.action_setup_usd==null?'Not supplied':money(r.action_setup_usd)],['Annual action cost',r.action_annual_usd==null?'Not supplied':money(r.action_annual_usd)]);
    return `<section class="hse-detail-source"><div class="hse-detail-source-top"><strong>${esc(siteName(r.site_id))} / ${esc(r.asset_id)}</strong>${badge('Severity '+r.potential_severity,Number(r.potential_severity)===5?'critical':'warning')}</div><div class="hse-detail-source-meta">Source status: <strong>${esc(r.action_status)}</strong> · ${date(r.status_as_of || DATA.meta.hseAsOf)}</div><dl class="hse-detail-facts"><div><dt>Owner</dt><dd>${esc(r.action_owner || 'Not supplied')}</dd></div><div><dt>Deadline ${r.is_overdue&&!isSourceClosed(r)?'<span class="hse-detail-overdue">Overdue at snapshot</span>':''}</dt><dd>${date(r.due_date)}</dd></div><div class="hse-detail-gap"><dt>Control gap</dt><dd>${esc(r.control_gap || 'Not supplied')}</dd></div>${finance?`<div class="hse-detail-cost"><dt>${isSourceClosed(r)?'Recorded setup estimate':'Remaining corrective estimate'}</dt><dd>${r.action_setup_usd==null?'Not supplied':money(r.action_setup_usd)} <span>setup</span></dd></div>`:''}</dl><details class="hse-detail-source-more"><summary>All source details</summary>${detailsList(fields)}${sourceLine(r)}</details></section>`;
  }
  function demoMarkup(r) {
    const finance = PERMISSIONS[state.role].finance;
    const fields = [['Record type','Simulated demo action'],['Created',date(r.created_at)],['Site',siteName(r.site_id)],['Asset',r.asset_id],['Hazard',r.hazard],['Potential severity',r.potential_severity+' / 5'],['Likelihood band',r.likelihood_band],['Control gap',r.control_gap],['Action owner',r.action_owner],['Due date',date(r.due_date)],['Required effort',r.action_person_hours==null?'Not supplied':r.action_person_hours+' h']];
    if(finance) fields.push(['Demo setup estimate',r.action_setup_usd==null?'Not supplied':money(r.action_setup_usd)],['Demo annual estimate',r.action_annual_usd==null?'Not supplied':money(r.action_annual_usd)]);
    return `<section class="hse-detail-source"><div class="hse-detail-source-top"><strong>${esc(siteName(r.site_id))} / ${esc(r.asset_id)}</strong>${badge('Severity '+r.potential_severity,Number(r.potential_severity)===5?'critical':'warning')}</div><div class="hse-detail-source-meta"><strong>Demo record</strong> · Created ${date(r.created_at)}</div><dl class="hse-detail-facts"><div><dt>Owner</dt><dd>${esc(r.action_owner)}</dd></div><div><dt>Deadline</dt><dd>${date(r.due_date)}</dd></div><div class="hse-detail-gap"><dt>Control gap</dt><dd>${esc(r.control_gap)}</dd></div>${finance?`<div class="hse-detail-cost"><dt>Demo corrective estimate</dt><dd>${r.action_setup_usd==null?'Not supplied':money(r.action_setup_usd)} <span>setup</span></dd></div>`:''}</dl><details class="hse-detail-source-more"><summary>All demo details</summary>${detailsList(fields)}<p class="subtle">Entered in this browser. Not a workbook record.</p></details></section>`;
  }
  function render() {
    const r = record(selectedId); if(!r || !allowed('hse') || !withinScope(r)) return false;
    const p = progress(r), sourceClosed = isSourceClosed(r), pending = p.status === 'Awaiting verification', verified = p.status === 'Verified closed';
    const supervisor = reviewRole(r, demoRole), reviewerLabel = isCritical(r) ? 'HSE Supervisor' : 'Demo reviewer', d = drafts[r.hse_id] || {note:p.note || '', evidence:p.evidence || '', verification:''};
    const choices = records().filter(x => state.site === 'all' || x.site_id === state.site);
    const history = [...p.history].reverse();
    const steps = statuses.map((s,i)=>`<li class="${!sourceClosed&&i<=statuses.indexOf(p.status)?'is-reached':''} ${s===p.status?'is-current':''}" ${s===p.status?'aria-current="step"':''}><span>${!sourceClosed&&i<statuses.indexOf(p.status)?'✓':i+1}</span>${esc(s)}</li>`).join('');
    openModal('HSE action details', `<div class="hse-detail"><div class="hse-detail-eyebrow">Field operations <span>·</span> Simulated demo</div><label class="hse-detail-select-label" for="hse-detail-action">Action</label><select id="hse-detail-action">${choices.map(x=>`<option value="${esc(x.hse_id)}" ${x.hse_id===selectedId?'selected':''}>${esc(x.hse_id+' · '+x.hazard+(state.site==='all'?' · '+siteName(x.site_id):''))}</option>`).join('')}</select>${holdMarkup(r)}${isDemo(r.hse_id)?demoMarkup(r):sourceMarkup(r)}<section class="hse-detail-workflow"><div class="hse-detail-section-head"><h3>Demo workflow</h3>${badge(p.status,verified?'success':pending?'warning':'neutral')}</div>${sourceClosed?'<div class="hse-detail-readonly">This action is closed in the workbook. Its source record stays read-only.</div>':`<ol class="hse-detail-steps" aria-label="Demo workflow progress">${steps}</ol><label class="hse-detail-label" for="hse-detail-notes">Completion notes <span>Simulated</span></label><textarea id="hse-detail-notes" maxlength="2000" placeholder="Describe the simulated work completed…" ${pending||verified?'readonly':''}>${esc(d.note)}</textarea><div class="hse-detail-inputs"><div><label class="hse-detail-label" for="hse-detail-evidence">Evidence reference <span>Optional</span></label><input id="hse-detail-evidence" maxlength="300" value="${esc(d.evidence)}" placeholder="e.g. DEMO inspection record" ${pending||verified?'readonly':''}></div><div><label class="hse-detail-label" for="hse-detail-role">Demo role</label><select id="hse-detail-role">${ROLES.map(role=>`<option ${demoRole===role?'selected':''}>${esc(role)}</option>`).join('')}</select></div></div>${pending?`<div class="hse-detail-review"><label class="hse-detail-label" for="hse-detail-verification">Verification note <span>${reviewerLabel} required</span></label><textarea id="hse-detail-verification" maxlength="2000" ${supervisor?'':'disabled'} placeholder="${supervisor?'Record the simulated review and verification…':'Switch to the '+reviewerLabel+' demo role to verify.'}">${esc(d.verification)}</textarea></div>`:''}<div class="hse-detail-buttons">${p.status==='Open'?'<button type="button" class="hse-detail-secondary" data-hse-command="start">Start work</button>':''}<button type="button" class="hse-detail-primary" data-hse-command="submit" ${pending||verified?'disabled':''}>Submit for review</button><button type="button" class="hse-detail-primary" data-hse-command="verify" ${pending&&supervisor?'':'disabled'}>Verify closure</button>${pending&&supervisor?'<button type="button" class="hse-detail-secondary" data-hse-command="return">Return for rework</button>':''}<button type="button" class="hse-detail-reset" data-hse-command="reset">Reset demo</button></div>`}<div id="hse-detail-message" class="hse-detail-message" role="status" aria-live="polite">${esc(message)}</div><details class="hse-detail-history"><summary>Demo activity <span>${history.length}</span></summary>${history.length?`<ol>${history.map(x=>`<li><div><strong>${esc(x.action)}</strong><time datetime="${esc(x.time)}">${esc(new Date(x.time).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</time></div><span>Demo ${esc(x.actor)}</span><p>${esc(x.note)}</p>${x.evidence?`<small>Reference: ${esc(x.evidence)}</small>`:''}</li>`).join('')}</ol>`:'<div class="hse-detail-empty">No simulated updates yet.</div>'}</details></section><div class="hse-detail-footer">Original records stay unchanged. Updates are simulated${persistent?' and saved in this browser':' for this session only'}.<br>Demo roles are not authentication. This hold is not an equipment control.</div></div>`);
    return true;
  }
  function capture() {
    if(!selectedId) return;
    const prior = drafts[selectedId] || {};
    drafts[selectedId] = {note:document.getElementById('hse-detail-notes')?.value ?? prior.note ?? '', evidence:document.getElementById('hse-detail-evidence')?.value ?? prior.evidence ?? '', verification:document.getElementById('hse-detail-verification')?.value ?? prior.verification ?? ''};
  }
  function announce(text, field) { message = text; const el = document.getElementById('hse-detail-message');if(el)el.textContent=text; if(field)document.getElementById(field)?.focus(); }
  function command(action) {
    const r = record(selectedId); if(!r || !allowed('hse') || !withinScope(r)) return;
    capture(); const p = progress(r), d = drafts[selectedId] || {};
    if(action === 'reset') {
      saved = {}; added = []; drafts = {}; message = 'Demo reset. Added actions, simulated notes, statuses and activity are cleared.'; persist(); notify(null,'reset'); if(record(selectedId)) render(); else closeMissingDetail(); return;
    }
    if(isSourceClosed(r)) return;
    let status, label, note;
    if(action === 'start' && p.status === 'Open') { status='In progress';label='Started work';note='Simulated work started.'; }
    if(action === 'submit' && ['Open','In progress'].includes(p.status)) {
      if(!d.note?.trim())return announce('Add a simulated completion note before submitting.','hse-detail-notes');
      status='Awaiting verification';label='Submitted for review';note=d.note.trim();
    }
    if((action === 'verify' || action === 'return') && p.status === 'Awaiting verification') {
      if(!reviewRole(r,demoRole))return announce(isCritical(r)?'Only the HSE Supervisor demo role can verify or return critical safety actions.':'Choose a recognized demo role to review this action.');
      if(!d.verification?.trim())return announce(isCritical(r)?'An HSE Supervisor verification note is required.':'A verification note is required.','hse-detail-verification');
      status=action==='verify'?'Verified closed':'In progress';label=action==='verify'?'Verified closure':'Returned for rework';note=d.verification.trim();
    }
    if(!status)return;
    saved[r.hse_id]={status,note:d.note || '',evidence:d.evidence || '',history:[...p.history,{actor:demoRole,time:new Date().toISOString(),action:label,note,evidence:action==='submit'?(d.evidence || ''):''}].slice(-100)};
    drafts[r.hse_id].verification='';persist();notify(r.site_id,action);
    message=status==='Awaiting verification'?(gate(r.site_id).unresolved.length?'Submitted for review. The critical hold remains until all critical actions are verified.':'Submitted for review. Supervisor verification is still required.'):status==='Verified closed'?(gate(r.site_id).held?'Verification recorded. Other critical actions still keep this site on HOLD.':'Critical HSE hold cleared. Other implementation requirements and approvals still apply.'):status==='In progress'&&action==='return'?'Returned for rework. The action remains unresolved.':'Demo work is in progress.';
    render();
  }
  document.addEventListener('input', e => {if(e.target.closest('.hse-detail')){capture();announce('');}});
  document.addEventListener('change', e => {
    if(e.target.id==='hse-detail-role'){capture();demoRole=ROLES.includes(e.target.value)?e.target.value:'Technician';message='';render();}
    if(e.target.id==='hse-detail-action'){capture();selectedId=e.target.value;message='';render();}
  });
  document.addEventListener('click', e => {
    const b=e.target.closest('[data-hse-command],[data-hse-select]');if(!b||b.disabled)return;
    if(b.dataset.hseSelect){capture();selectedId=b.dataset.hseSelect;message='';render();}
    else command(b.dataset.hseCommand);
  });
  window.addEventListener('storage', e => {
    if (e.key !== KEY && e.key !== null) return;
    if (e.storageArea && e.storageArea !== localStorage) return;
    load(); drafts = {}; message = 'Demo progress refreshed from another browser tab.';
    notify(null,'storage');
    if(document.querySelector('.hse-detail')) { if(record(selectedId)) render(); else closeMissingDetail(); }
  });
  // The microtask runs after the public API is assigned, allowing dependent UI to refresh.
  queueMicrotask(() => notify(null,'initialized'));
  return Object.freeze({
    open(id) {if(!allowed('hse')||!withinScope(record(id)))return false;selectedId=id;demoRole=ROLES.includes(state.role)?state.role:'Technician';message='';return render();},
    gate, create, remove, isDemo,
    records() {return clone(records());},
    demoRecords() {return clone(added);},
    progress(id) {const r=record(id);return r?clone(progress(r)):null;},
    status(id) {const r=record(id);return r?progress(r).status:null;}
  });
})();
