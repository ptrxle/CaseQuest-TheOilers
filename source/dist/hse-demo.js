/* HSE-only, browser-local demonstration. Workbook records are never modified. */
'use strict';
window.HSEActionDetails = (() => {
  const KEY = 'lme-hse-action-demo-v1';
  const statuses = ['Open', 'In progress', 'Awaiting verification', 'Verified closed'];
  let selectedId = null, demoRole = 'Technician', message = '', drafts = {}, saved = {}, persistent = true;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (stored.version === 1 && stored.actions && typeof stored.actions === 'object') {
      for (const [id, item] of Object.entries(stored.actions)) {
        if (!DATA.hse.some(r => r.hse_id === id) || !item || !statuses.includes(item.status)) continue;
        const history = Array.isArray(item.history) ? item.history.filter(x => x && typeof x.actor === 'string' && typeof x.time === 'string' && typeof x.note === 'string' && typeof x.action === 'string').slice(-100) : [];
        if (item.status === 'Verified closed' && !history.some(x => x.action === 'Verified closure' && ['Supervisor','HSE Supervisor'].includes(x.actor) && x.note.trim())) continue;
        saved[id] = {status:item.status, note:String(item.note || '').slice(0,2000), evidence:String(item.evidence || '').slice(0,300), history};
      }
    }
  } catch (_) { persistent = false; }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({version:1, actions:saved})); }
    catch (_) { persistent = false; }
  }
  function record(id) { return DATA.hse.find(r => r.hse_id === id); }
  function isSourceClosed(r) { return String(r.action_status).toLowerCase() === 'closed'; }
  function progress(r) { return isSourceClosed(r) ? {status:'Source closed', history:[]} : saved[r.hse_id] || {status:'Open', note:'', evidence:'', history:[]}; }
  function gate(siteId) {
    const critical = DATA.hse.filter(r => r.site_id === siteId && Number(r.potential_severity) === 5 && !isSourceClosed(r));
    const unresolved = critical.filter(r => progress(r).status !== 'Verified closed');
    return {critical, unresolved};
  }
  function holdMarkup(r) {
    const g = gate(r.site_id), held = g.unresolved.length > 0;
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
  function render() {
    const r = record(selectedId); if(!r || !allowed('hse') || !withinScope(r)) return false;
    const p = progress(r), sourceClosed = isSourceClosed(r), pending = p.status === 'Awaiting verification', verified = p.status === 'Verified closed';
    const supervisor = demoRole !== 'Technician', d = drafts[r.hse_id] || {note:p.note || '', evidence:p.evidence || '', verification:''};
    const records = DATA.hse.filter(x => state.site === 'all' || x.site_id === state.site);
    const history = [...p.history].reverse();
    const steps = statuses.map((s,i)=>`<li class="${!sourceClosed&&i<=statuses.indexOf(p.status)?'is-reached':''} ${s===p.status?'is-current':''}" ${s===p.status?'aria-current="step"':''}><span>${!sourceClosed&&i<statuses.indexOf(p.status)?'✓':i+1}</span>${esc(s)}</li>`).join('');
    openModal('HSE action details', `<div class="hse-detail"><div class="hse-detail-eyebrow">Field operations <span>·</span> Simulated demo</div><label class="hse-detail-select-label" for="hse-detail-action">Action</label><select id="hse-detail-action">${records.map(x=>`<option value="${esc(x.hse_id)}" ${x.hse_id===selectedId?'selected':''}>${esc(x.hse_id+' · '+x.hazard+(state.site==='all'?' · '+siteName(x.site_id):''))}</option>`).join('')}</select>${holdMarkup(r)}${sourceMarkup(r)}<section class="hse-detail-workflow"><div class="hse-detail-section-head"><h3>Demo workflow</h3>${badge(p.status,verified?'success':pending?'warning':'neutral')}</div>${sourceClosed?'<div class="hse-detail-readonly">This action is closed in the workbook. Its source record stays read-only.</div>':`<ol class="hse-detail-steps" aria-label="Demo workflow progress">${steps}</ol><label class="hse-detail-label" for="hse-detail-notes">Completion notes <span>Simulated</span></label><textarea id="hse-detail-notes" maxlength="2000" placeholder="Describe the simulated work completed…" ${pending||verified?'readonly':''}>${esc(d.note)}</textarea><div class="hse-detail-inputs"><div><label class="hse-detail-label" for="hse-detail-evidence">Evidence reference <span>Optional</span></label><input id="hse-detail-evidence" maxlength="300" value="${esc(d.evidence)}" placeholder="e.g. DEMO inspection record" ${pending||verified?'readonly':''}></div><div><label class="hse-detail-label" for="hse-detail-role">Demo role</label><select id="hse-detail-role">${ROLES.map(role=>`<option ${demoRole===role?'selected':''}>${esc(role)}</option>`).join('')}</select></div></div>${pending?`<div class="hse-detail-review"><label class="hse-detail-label" for="hse-detail-verification">Verification note <span>Supervisor required</span></label><textarea id="hse-detail-verification" maxlength="2000" ${supervisor?'':'disabled'} placeholder="${supervisor?'Record the simulated review and verification…':'Switch to a supervisor demo role to verify.'}">${esc(d.verification)}</textarea></div>`:''}<div class="hse-detail-buttons">${p.status==='Open'?'<button type="button" class="hse-detail-secondary" data-hse-command="start">Start work</button>':''}<button type="button" class="hse-detail-primary" data-hse-command="submit" ${pending||verified?'disabled':''}>Submit for review</button><button type="button" class="hse-detail-primary" data-hse-command="verify" ${pending&&supervisor?'':'disabled'}>Verify closure</button>${pending&&supervisor?'<button type="button" class="hse-detail-secondary" data-hse-command="return">Return for rework</button>':''}<button type="button" class="hse-detail-reset" data-hse-command="reset">Reset demo</button></div>`}<div id="hse-detail-message" class="hse-detail-message" role="status" aria-live="polite">${esc(message)}</div><details class="hse-detail-history"><summary>Demo activity <span>${history.length}</span></summary>${history.length?`<ol>${history.map(x=>`<li><div><strong>${esc(x.action)}</strong><time datetime="${esc(x.time)}">${esc(new Date(x.time).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</time></div><span>Demo ${esc(x.actor)}</span><p>${esc(x.note)}</p>${x.evidence?`<small>Reference: ${esc(x.evidence)}</small>`:''}</li>`).join('')}</ol>`:'<div class="hse-detail-empty">No simulated updates yet.</div>'}</details></section><div class="hse-detail-footer">Original records stay unchanged. Updates are simulated${persistent?' and saved in this browser':' for this session only'}.<br>Demo roles are not authentication. This hold is not an equipment control.</div></div>`);
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
      saved = {}; drafts = {}; message = 'Demo reset. All simulated notes, statuses and activity are cleared.'; persist(); render(); return;
    }
    if(isSourceClosed(r)) return;
    let status, label, note;
    if(action === 'start' && p.status === 'Open') { status='In progress';label='Started work';note='Simulated work started.'; }
    if(action === 'submit' && ['Open','In progress'].includes(p.status)) {
      if(!d.note?.trim())return announce('Add a simulated completion note before submitting.','hse-detail-notes');
      status='Awaiting verification';label='Submitted for review';note=d.note.trim();
    }
    if((action === 'verify' || action === 'return') && p.status === 'Awaiting verification') {
      if(demoRole === 'Technician')return announce('Only a supervisor demo role can review this action.');
      if(!d.verification?.trim())return announce('A supervisor verification note is required.','hse-detail-verification');
      status=action==='verify'?'Verified closed':'In progress';label=action==='verify'?'Verified closure':'Returned for rework';note=d.verification.trim();
    }
    if(!status)return;
    saved[r.hse_id]={status,note:d.note || '',evidence:d.evidence || '',history:[...p.history,{actor:demoRole,time:new Date().toISOString(),action:label,note,evidence:action==='submit'?(d.evidence || ''):''}].slice(-100)};
    drafts[r.hse_id].verification='';persist();
    message=status==='Awaiting verification'?(gate(r.site_id).unresolved.length?'Submitted for review. The critical hold remains until all critical actions are verified.':'Submitted for review. Supervisor verification is still required.'):status==='Verified closed'?'Supervisor verification recorded.':status==='In progress'&&action==='return'?'Returned for rework. The action remains unresolved.':'Demo work is in progress.';
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
  return Object.freeze({open(id) {if(!allowed('hse')||!withinScope(record(id)))return false;selectedId=id;message='';return render();}});
})();
