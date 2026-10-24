/* User-created HSE demonstration records; workbook evidence stays read-only. */
'use strict';
window.HSEActionForm = (() => {
  let deletingId = null;
  const api = () => window.HSEActionDetails;
  const field = (label, control, full = false) => `<label class="sp-field${full?' full':''}">${label}${control}</label>`;
  const input = (name, attributes = '') => `<input id="hse-new-${name}" ${attributes}>`;
  const value = name => document.getElementById('hse-new-'+name)?.value || '';
  const amount = name => value(name).trim() === '' ? null : Number(value(name));
  const button = (label, action, primary = false) => `<button type="button" class="btn ${primary?'':'secondary'} small" data-hse-form="${action}">${label}</button>`;
  function assets(site, selected) {
    return DATA.assets.filter(a=>a.site_id===site).map(a=>`<option value="${esc(a.asset_id)}" ${selected===a.asset_id?'selected':''}>${esc(a.asset_id+' · '+a.asset_type)}</option>`).join('');
  }
  function open() {
    if(!allowed('hse')) return false;
    deletingId=null;
    const sid=DATA.sites.some(s=>s.site_id===state.site)?state.site:'S04';
    openModal('Add HSE Action',`<div class="sp-dialog hse-create"><div class="sp-note">User-entered demo action · separate from workbook records</div><div class="sp-demo-fill"><span>Quick setup for your presentation</span>${button('Fill demo values','fill')}</div><div id="hse-create-fill-status" class="sp-demo-fill-status" role="status" aria-live="polite"></div><form id="hse-create-form"><div class="sp-form">${field('Site',`<select id="hse-new-site" required>${DATA.sites.map(s=>`<option value="${esc(s.site_id)}" ${sid===s.site_id?'selected':''}>${esc(s.site_name)}</option>`).join('')}</select>`)}${field('Asset',`<select id="hse-new-asset" required>${assets(sid)}</select>`)}${field('Hazard',input('hazard','maxlength="160" required placeholder="Describe the hazard"'))}${field('Potential severity',`<select id="hse-new-severity" required><option value="">Select severity</option>${[1,2,3,4,5].map(n=>`<option value="${n}">${n} / 5${n===5?' · Critical':''}</option>`).join('')}</select>`)}${field('Action owner',input('owner','maxlength="100" required placeholder="Name or team"'))}${field('Deadline',input('due','type="date" required'))}${field('Likelihood band',`<select id="hse-new-likelihood" required><option value="">Select likelihood</option><option>Low</option><option>Medium</option><option>High</option></select>`)}${field('Required effort · hours (optional)',input('hours','type="number" min="0" step="0.1" placeholder="Not supplied"'))}${field('Control gap / corrective work',`<textarea id="hse-new-gap" maxlength="2000" required placeholder="Describe the missing control or work required"></textarea>`,true)}${field('Remaining setup estimate · USD (optional)',input('setup','type="number" min="0" step="0.01" placeholder="Not supplied"'))}${field('Annual recurring estimate · USD (optional)',input('annual','type="number" min="0" step="0.01" placeholder="Not supplied"'))}</div><div class="sp-cost-note">New actions start Open. Estimates and completion are simulated.</div><div id="hse-create-error" class="sp-error" role="alert"></div><div class="sp-dialog-footer">${button('Cancel','cancel')}<button type="submit" class="btn" data-hse-form="save">Add HSE Action</button></div></form></div>`);
    return true;
  }
  function fill() {
    if(!document.getElementById('hse-create-form'))return;
    const sid=value('site'), asset=value('asset');
    document.getElementById('hse-new-asset').innerHTML=assets(sid,asset);
    const due=new Date();due.setUTCDate(due.getUTCDate()+14);
    const vals={hazard:'DEMO · Walkway trip hazard',severity:'3',owner:'DEMO site technician',due:due.toISOString().slice(0,10),likelihood:'Medium',hours:'2',gap:'DEMO: A loose hose crosses the access walkway. Secure the hose and verify the walkway is clear.',setup:'150',annual:'0'};
    for(const [key,val] of Object.entries(vals))document.getElementById('hse-new-'+key).value=val;
    document.getElementById('hse-create-error').textContent='';
    document.getElementById('hse-create-fill-status').textContent='Simulated values filled. Review them, then select Add HSE Action to save.';
  }
  function save() {
    const form=document.getElementById('hse-create-form');
    if(!form || !form.reportValidity())return;
    try {
      const created=api().create({site_id:value('site'),asset_id:value('asset'),hazard:value('hazard'),potential_severity:Number(value('severity')),likelihood_band:value('likelihood'),action_owner:value('owner'),due_date:value('due'),control_gap:value('gap'),action_setup_usd:amount('setup'),action_annual_usd:amount('annual'),action_person_hours:amount('hours')});
      state.site=created.site_id;state.hseStatus='Open';state.hseSeverity='all';state.page=0;saveView();
      modal.close();render();toast('Demo HSE action added.');
      document.querySelector(`[data-hse-demo-id="${created.hse_id}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});
    } catch(error) {document.getElementById('hse-create-error').textContent=error.message;}
  }
  function askDelete(id) {
    const r=api().demoRecords().find(x=>x.hse_id===id);
    if(!r||!withinScope(r))return;
    deletingId=id;
    openModal('Delete demo HSE action?',`<div class="sp-dialog hse-delete"><div class="sp-note">Demo record only</div><p><strong>${esc(r.hse_id)} · ${esc(r.hazard)}</strong></p><p>This removes the demo action and its simulated activity from this browser. Workbook records stay unchanged.</p><div id="hse-delete-error" class="sp-error" role="alert"></div><div class="sp-dialog-footer">${button('Cancel','cancel')}<button class="btn hse-delete-confirm" type="button" data-hse-form="confirm-delete">Delete action</button></div></div>`);
  }
  function remove() {
    try {api().remove(deletingId);deletingId=null;modal.close();render();toast('Demo HSE action deleted.');}
    catch(error){document.getElementById('hse-delete-error').textContent=error.message;}
  }
  function renderList() {
    const all=api()?.demoRecords()||[];
    if(!all.length)return '';
    const rows=scoped(all).filter(r=>(state.hseSeverity==='all'||r.potential_severity===Number(state.hseSeverity))&&(state.hseStatus==='all'||(api().status(r.hse_id)==='Verified closed'?'Closed':'Open')===state.hseStatus)).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.hse_id.localeCompare(a.hse_id));
    return `<div class="hse-demo-list">${panel('Demo actions',table(['ID / asset','Site','Hazard','Severity','Owner / deadline','Demo status',''],rows.map(r=>{const s=api().status(r.hse_id);return `<tr data-hse-demo-id="${esc(r.hse_id)}"><td><strong>${esc(r.hse_id)}</strong><div class="subtle">${esc(r.asset_id)}</div></td><td>${esc(siteName(r.site_id))}</td><td class="wrap-cell">${esc(r.hazard)}</td><td>${badge(r.potential_severity+' / 5',r.potential_severity===5?'critical':'neutral')}</td><td>${esc(r.action_owner)}<div class="subtle">${date(r.due_date)}</div></td><td>${badge(s,s==='Verified closed'?'success':s==='Awaiting verification'?'warning':'neutral')}</td><td><div class="hse-row-actions">${viewButton('hse',r.hse_id,'View action')}<button type="button" class="btn secondary small hse-delete-link" data-hse-form="delete" data-id="${esc(r.hse_id)}" aria-label="Delete ${esc(r.hse_id)}">Delete</button></div></td></tr>`;})),badge(`${rows.length} shown · browser-local`))}</div>`;
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-hse-form]');if(!b||b.disabled)return;
    const a=b.dataset.hseForm;
    if(a==='add')open();
    if(a==='fill')fill();
    if(a==='cancel'){deletingId=null;modal.close();}
    if(a==='delete')askDelete(b.dataset.id);
    if(a==='confirm-delete')remove();
  });
  document.addEventListener('submit',e=>{if(e.target.id==='hse-create-form'){e.preventDefault();save();}});
  document.addEventListener('change',e=>{if(e.target.id==='hse-new-site')document.getElementById('hse-new-asset').innerHTML=assets(value('site'));});
  window.addEventListener('hse-demo-change',()=>{if(current==='hse')render();});
  return Object.freeze({open,renderList});
})();
