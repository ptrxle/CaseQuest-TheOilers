'use strict';
function toast(message){const t=document.getElementById('toast');t.textContent=message;t.hidden=false;clearTimeout(timer);timer=setTimeout(()=>t.hidden=true,4000);}
function openModal(title,body){document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=body;if(!modal.open)modal.showModal();}
function detailsList(values){return `<dl class="detail-grid">${values.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value??'Not supplied')}</dd></div>`).join('')}</dl>`;}
function sourceLine(record){const s=record.source;return s?.sheet?`<div class="source-line">${esc(DATA.meta.file)} · ${esc(s.sheet)} · row ${s.row??'see linked records'}</div>`:'';}
function details(){const removed=DATA.meta.cleaning.filter(s=>s.verifiedDuplicateRowsRemoved);openModal('Data source',`<p><strong>${esc(DATA.meta.file)}</strong></p><p>2025 operating records. HSE status: ${date(DATA.meta.hseAsOf)}. All six sites are included. These are historical case records; no live feed is connected.</p><p>Business values come only from the workbook. Totals, shares and training hours are calculated from those records. Source details are available on each record.</p>${table(['Sheet','Duplicate rows removed'],removed.map(s=>`<tr><td>${esc(s.sheet)}</td><td>${num(s.verifiedDuplicateRowsRemoved,0)}</td></tr>`))}<p class="source-line">Missing sensor values and pending invoice amounts remain unavailable. Inventory balances and training completion were not supplied.</p><p><strong>Role views:</strong> this presentation interface restricts pages and actions. The selector is not user authentication. Production use requires identity-based server authorization and a connected source.</p><p class="source-line">Workbook SHA-256: ${DATA.meta.sha256}</p>`);}
function withinScope(r){return r&&(state.site==='all'||r.site_id===state.site);}
function openRecord(kind,id){
  let r,fields=[];
  if(kind==='hse'&&allowed('hse')){
    r=byId(DATA.hse,id,'hse_id');if(!withinScope(r))return false;
    fields=[['Site',siteName(r.site_id)],['Asset',r.asset_id],['Hazard',r.hazard],['Potential severity',r.potential_severity+' / 5'],['Likelihood band',r.likelihood_band],['Control gap',r.control_gap],['Action owner',r.action_owner],['Due date',date(r.due_date)],['Source status',r.action_status],['Closed date',date(r.closed_date)],['Outcome',r.outcome],['Required effort',r.action_person_hours+' h']];
    if(PERMISSIONS[state.role].finance)fields.push(['Action setup',money(r.action_setup_usd)],['Annual action cost',money(r.action_annual_usd)]);
    openModal(r.hse_id+' · '+r.hazard,detailsList(fields)+sourceLine(r));return true;
  }
  if(kind==='event'&&(allowed('downtime')||allowed('parts'))){
    r=byId(DATA.events,id,'event_id');if(!withinScope(r))return false;
    // Field views can inspect only events relevant to parts readiness.
    if(state.role==='Technician'&&!(r.parts_wait_hours>0))return false;
    fields=[['Site',siteName(r.site_id)],['Asset',r.asset_id],['Event type',r.event_type],['Cause',r.cause],['Started (UTC)',r.start_utc],['Ended (UTC)',r.end_utc],['Downtime',num(r.stopped_hours)+' h'],['Parts wait',num(r.parts_wait_hours)+' h'],['Work order',r.work_order_id],['Technician note',r.technician_note]];
    if(PERMISSIONS[state.role].finance)fields.push(['Parts invoice',r.parts_usd==null?'Not available':money(r.parts_usd)],['Cost status',r.cost_status]);
    openModal(r.event_id+' · '+r.asset_id,detailsList(fields)+sourceLine(r));return true;
  }
  if(kind==='asset'){
    r=byId(DATA.assets,id,'asset_id');if(!withinScope(r))return false;
    fields=[['Site',siteName(r.site_id)],['Equipment',r.asset_type],['Criticality',r.criticality],['Age',r.age_years+' years'],['Latest observation (UTC)',r.latest.observed_utc],['Recorded state',r.latest.operating_state],['Reading quality',r.latest.quality],['Vibration',r.latest.vibration_mm_s==null?'Not available':num(r.latest.vibration_mm_s,2)+' mm/s'],['Temperature',r.latest.temperature_c==null?'Not available':num(r.latest.temperature_c)+' °C'],['Inspection note',r.latest.inspection_note]];
    openModal(r.asset_id+' · '+r.asset_type,detailsList(fields)+sourceLine(r)+sourceLine(r.latest));return true;
  }
  if(kind==='site'){
    r=byId(DATA.sites,id,'site_id');if(!withinScope(r))return false;
    fields=[['Site',r.site_name],['Network uptime',num(r.network_uptime_pct)+'%'],['Local spare fill',num(r.spare_fill_pct,0)+'%'],['Technicians',r.technicians],['Training per technician',r.training_hours_per_person+' h'],['Total training requirement',r.training_required_hours+' h'],['Project hours available',r.available_project_hours+' h']];
    if(PERMISSIONS[state.role].finance)fields.push(['Cleanup setup',money(r.cleanup_setup_usd)],['Edge setup',money(r.edge_setup_usd)],['Annual edge cost',money(r.edge_annual_usd)]);
    openModal(r.site_name,detailsList(fields)+`<div class="source-line">Assets sheet · ${r.asset_ids.join(', ')}. Site-level values counted once.</div>`);return true;
  }
  if(kind==='option'&&allowed('setup')){
    r=byId(DATA.options,id,'option_id');if(!r||id!=='O6')return false;
    fields=[['Option',r.option_name],['Applies to',r.billing_unit],['Lead time',r.lead_months+' month'],['Requirement',r.prerequisite],['Workbook rule',r.benefit_rule]];
    if(PERMISSIONS[state.role].finance)fields.push(['Setup per site',money(r.setup_usd)],['Annual per site',money(r.annual_usd)]);
    openModal(r.option_id+' · '+r.option_name,detailsList(fields)+sourceLine(r));return true;
  }
  return false;
}
function csvCell(value){let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function exportReport(type){
  if(!canExport(type))return false;
  let headers=[],rows=[];
  if(type==='hse'){
    headers=['hse_id','site','asset_id','hazard','severity','owner','due_date','closed_date','status','source_sheet','source_row'];
    rows=hazards().map(h=>[h.hse_id,siteName(h.site_id),h.asset_id,h.hazard,h.potential_severity,h.action_owner,h.due_date,h.closed_date,h.action_status,h.source.sheet,h.source.row]);
  }else if(type==='operations'||type==='parts'){
    headers=['site','network_uptime_pct','local_spare_fill_pct','unplanned_hours','parts_wait_hours','parts_wait_events','open_hse_actions','source'];
    rows=selectedSites().map(s=>{const ev=events().filter(e=>e.site_id===s.site_id);return [s.site_name,s.network_uptime_pct,s.spare_fill_pct,sum(ev,'stopped_hours').toFixed(2),sum(ev,'parts_wait_hours').toFixed(2),ev.filter(e=>e.parts_wait_hours>0).length,openHazards().filter(h=>h.site_id===s.site_id).length,DATA.meta.file];});
  }else if(type==='downtime'){
    headers=['event_id','site','asset_id','cause','start_utc','stopped_hours',...STAGES.map(x=>x[0]),'source_sheet','source_row'];
    rows=events().map(e=>[e.event_id,siteName(e.site_id),e.asset_id,e.cause,e.start_utc,e.stopped_hours,...STAGES.map(([k])=>e[k]),e.source.sheet,e.source.row]);
  }else if(type==='setup'){
    headers=['site','technicians','training_hours_per_person','required_training_hours','available_project_hours','cleanup_setup_usd','edge_setup_usd','source'];
    rows=selectedSites().map(s=>[s.site_name,s.technicians,s.training_hours_per_person,s.training_required_hours,s.available_project_hours,s.cleanup_setup_usd,s.edge_setup_usd,DATA.meta.file]);
  }else return false;
  const csv=[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`field-operations-${type}-${state.site}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Workbook report exported.');return true;
}
function clearSearch(){document.getElementById('search').value='';document.getElementById('search-results').hidden=true;document.getElementById('search-results').innerHTML='';}
function changeSite(id){if(id!=='all'&&!byId(DATA.sites,id,'site_id'))return;state.site=id;state.asset='all';state.page=0;modal.close();clearSearch();saveView();render();}
function changeRole(role){state.role=ROLES.includes(role)?role:'Technician';state.asset='all';state.page=0;modal.close();document.getElementById('modal-body').innerHTML='';clearSearch();saveView();render();}
function search(query){const results=document.getElementById('search-results');const q=query.trim().toLowerCase().slice(0,100);if(!q){results.hidden=true;results.innerHTML='';return;}const records=[];
  for(const [id,,label] of PAGES.filter(p=>allowed(p[0]))){const name=id==='setup'&&state.role==='Technician'?'Training':label;if(name.toLowerCase().includes(q))records.push({kind:'page',id,label:name});}
  for(const s of DATA.sites)if((s.site_name+' '+s.site_id).toLowerCase().includes(q))records.push({kind:'site-filter',id:s.site_id,label:s.site_name});
  for(const a of selectedAssets())if((a.asset_id+' '+a.asset_type).toLowerCase().includes(q))records.push({kind:'asset',id:a.asset_id,label:a.asset_id+' · '+a.asset_type});
  for(const h of hazards())if((h.hse_id+' '+h.hazard).toLowerCase().includes(q))records.push({kind:'hse',id:h.hse_id,label:h.hse_id+' · '+h.hazard});
  if(allowed('parts')||allowed('downtime'))for(const e of events().filter(e=>state.role!=='Technician'||e.parts_wait_hours>0))if((e.event_id+' '+e.work_order_id).toLowerCase().includes(q))records.push({kind:'event',id:e.event_id,label:e.event_id+' · '+siteName(e.site_id)});
  results.innerHTML=records.length?records.slice(0,8).map(r=>`<button data-action="search-result" data-kind="${r.kind}" data-id="${r.id}">${esc(r.label)}</button>`).join(''):'<div class="empty">No matching records</div>';results.hidden=false;
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const {action,kind,id}=b.dataset;
  if(action==='record')openRecord(kind,id);
  if(action==='site')changeSite(id);
  if(action==='previous'){state.page=Math.max(0,state.page-1);render();}
  if(action==='next'){state.page++;render();}
  if(action==='search-result'){clearSearch();if(kind==='page'&&allowed(id))location.hash=id;else if(kind==='site-filter')changeSite(id);else openRecord(kind,id);}
});
document.addEventListener('change',e=>{
  if(e.target.id==='hse-status'&&allowed('hse')){state.hseStatus=['Open','Closed','all'].includes(e.target.value)?e.target.value:'Open';state.page=0;render();}
  if(e.target.id==='hse-severity'&&allowed('hse')){state.hseSeverity=e.target.value;state.page=0;render();}
  if(e.target.id==='asset-scope'&&allowed('downtime')){state.asset=e.target.value==='all'||selectedAssets().some(a=>a.asset_id===e.target.value)?e.target.value:'all';state.page=0;render();}
});
document.getElementById('role').addEventListener('change',e=>changeRole(e.target.value));
document.getElementById('site-scope').addEventListener('change',e=>changeSite(e.target.value));
document.getElementById('primary-action').addEventListener('click',e=>exportReport(e.currentTarget.dataset.export));
document.getElementById('search').addEventListener('input',e=>search(e.target.value));
document.getElementById('search').addEventListener('keydown',e=>{if(e.key==='Escape')clearSearch();});
document.getElementById('details').innerHTML=icon('info');document.getElementById('search-icon').innerHTML=icon('search');
document.getElementById('details').addEventListener('click',details);document.getElementById('source-details').addEventListener('click',details);
document.getElementById('close-modal').addEventListener('click',()=>modal.close());
document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();main.focus();});
modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
window.addEventListener('hashchange',()=>{state.page=0;state.asset='all';modal.close();clearSearch();render();});
document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))document.getElementById('search-results').hidden=true;});
render();
