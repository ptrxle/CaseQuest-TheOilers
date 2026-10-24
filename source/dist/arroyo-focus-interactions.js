/* Drill-downs for historical parts evidence; no source or demo writes. */
(() => {
  const dataModal=(title,headers,rows,note)=>openModal(title,`<div class="af-data">${table(headers,rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`))}<p class="source-line">${esc(note)}</p></div>`);
  function showData(kind,site){
    if(!allowed('dashboard')||!DATA.sites.some(s=>s.site_id===site))return false;
    const a=ArroyoInsights,m=a.metrics(site),s=a.scenario(site);
    if(kind==='ranking')dataModal('Parts delays · all six sites',['Site','Parts wait h','Affected events','Share of site downtime','Source fill'],a.allSites().map(r=>[r.site_name,num(r.parts_wait_hours,2),r.parts_affected_events,num(r.parts_share_pct,2)+'%',num(r.source_spare_fill_pct,0)+'%']),'2025 unplanned events: sum Events.parts_wait_hours; share = parts wait ÷ stopped hours. Assets.spare_fill_pct is a case planning assumption, not current inventory. Each site input counted once.');
    else if(kind==='monthly')dataModal(m.site_name+' · monthly parts wait',['2025 month','Parts wait h','Affected events'],m.monthly.map(r=>[r.label,num(r.parts_wait_hours,2),r.affected_events]),'Events: unplanned rows assigned to their event-start month. Hours are equipment-hours; concurrent asset outages can overlap.');
    else if(kind==='assets')dataModal(m.site_name+' · equipment priorities',['Asset','Equipment','Parts wait h','Affected events'],m.assets.map(r=>[r.asset_id,r.asset_type,num(r.parts_wait_hours,2),r.affected_events]),'Events + Assets · 2025 unplanned events. Equipment groups guide inventory investigation; the workbook does not identify the missing SKU.');
    else if(kind==='scenario'){
      const o=DATA.options.find(x=>x.option_id==='O4');
      const rows=[['Historical parts wait',num(s.baseline_parts_wait_hours,2)+' h'],['Base parts-wait reduction',num(s.parts_wait_reduction*100,0)+'%'],['Modeled hours avoided',num(s.saved_parts_wait_hours,2)+' h'],['Remaining parts wait',num(s.remaining_parts_wait_hours,2)+' h'],['Historical unplanned downtime',num(s.baseline_unplanned_hours,2)+' h'],['Modeled remaining unplanned downtime',num(s.remaining_unplanned_hours,2)+' h'],['O4 implementation effort',o.install_person_hours+' person-hours per site'],['O4 lead time',o.lead_months+' month'],['O4 prerequisite',o.prerequisite]];
      if(PERMISSIONS[state.role].finance)rows.push(['O4 setup / selected site',money(o.setup_usd)],['O4 recurring / year / selected site',money(o.annual_usd)]);
      dataModal(m.site_name+' · O4 case scenario',['Measure','Value'],rows,'Solutions!S5: 60% × selected site’s 2025 unplanned parts-wait hours. Full comparable operating year after implementation, not first-year cash savings or guaranteed performance. Other stages, including protected safety work, are unchanged. O4 costs exclude additional site preparation and HSE corrective work; these are not a total rollout budget. Source: Solutions row 5; Events.');
    } else return false;
    return true;
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-af-site],[data-af-hse],[data-af-table],[data-af-dashboard]');if(!b)return;
    if(b.dataset.afSite){if(DATA.sites.some(s=>s.site_id===b.dataset.afSite))changeSite(b.dataset.afSite);return;}
    if(b.dataset.afHse){const h=DATA.hse.find(r=>r.hse_id===b.dataset.afHse);if(!h||!allowed('hse'))return;if(state.site!==h.site_id)changeSite(h.site_id);openRecord('hse',h.hse_id);return;}
    if(b.dataset.afTable)showData(b.dataset.afTable,b.dataset.afFocus);
    if(b.hasAttribute('data-af-dashboard'))AnalyticsUI.showOverview();
  });
  window.ArroyoEvidence=Object.freeze({showData});
})();
