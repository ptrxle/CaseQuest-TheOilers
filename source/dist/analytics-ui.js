/* Workbook-derived chart gallery. Projections are explicitly separated from records. */
(function () {
  'use strict';
  const C = ['#24558f','#49a3a0','#d89845','#a878a0','#94a8c2','#7485b3'];
  const catalog = [
    {id:'oil-loss',title:'Lost oil',sub:'Deferred, recovered & net lost',types:['Line','Stacked bar'],future:true},
    {id:'production',title:'Potential & produced',sub:'Oil output against potential',types:['Line','Grouped bar'],future:true},
    {id:'financial',title:'Contribution loss',sub:'Value of unrecovered production',types:['Bar','Line'],future:true},
    {id:'downtime',title:'Downtime stages',sub:'Where unplanned hours are spent',types:['Donut','Bar']},
    {id:'site-comparison',title:'Site comparison',sub:'Net lost oil by site',types:['Bar','Donut'],future:true},
    {id:'hse',title:'HSE actions',sub:'Open actions & potential severity',types:['Donut','Bar']},
    {id:'data-quality',title:'Reading quality',sub:'Valid, suspect & missing records',types:['Stacked bar','Donut']},
    {id:'parts',title:'Parts readiness',sub:'Spare fill & parts-wait exposure',types:['Bar','Donut']}
  ];
  let active=null,period='current',type=null;
  const cache=new Map();
  const model=()=>{if(!cache.has(state.site))cache.set(state.site,{current:LMEAnalytics.aggregate(state.site),future:LMEAnalytics.projection(state.site)});return cache.get(state.site);};
  const canChart=id=>allowed('dashboard')&&catalog.some(c=>c.id===id)&&(id!=='financial'||canFinance());
  const available=()=>catalog.filter(c=>canChart(c.id));
  const compact=(v,currency=false)=>{const a=Math.abs(v);return (currency?'$':'')+(a>=1e6?(v/1e6).toFixed(1)+'m':a>=1e3?(v/1e3).toFixed(a>=1e5?0:1)+'k':num(v,0));};
  const legend=series=>`<div class="chart-legend">${series.map((s,i)=>`<span><i style="background:${s.color||C[i%C.length]}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  const svg=(body,w,h,label)=>`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${body}</svg>`;
  function cartesian(labels,series,kind='Line',small=false,forecastAt=null,unit='bbl') {
    const w=small?260:1060,h=small?105:290,L=small?6:66,R=small?6:28,T=small?8:28,B=small?10:42;
    const pw=w-L-R,ph=h-T-B,n=labels.length;
    const max=Math.max(1,...labels.map((_,i)=>kind==='Stacked bar'?series.reduce((a,s)=>a+s.values[i],0):Math.max(...series.map(s=>s.values[i]))))*1.12;
    const x=i=>L+(i+.5)*pw/n,y=v=>T+ph-v/max*ph;
    let out='';
    if(forecastAt!==null){const fx=L+forecastAt*pw/n;out+=`<rect x="${fx}" y="${T}" width="${w-R-fx}" height="${ph}" fill="#edf4fb"/>`;if(!small)out+=`<text x="${fx+8}" y="17" fill="#52749b" font-size="11">Baseline projection · 2026</text>`;}
    for(let j=0;j<=4;j++){const v=max*j/4,yy=y(v);out+=`<line x1="${L}" y1="${yy}" x2="${w-R}" y2="${yy}" stroke="#e9edf3"/>`;if(!small)out+=`<text x="${L-12}" y="${yy+4}" text-anchor="end" fill="#6f8198" font-size="11">${compact(v,unit==='USD')}</text>`;}
    if(!small)out+=`<text x="${L}" y="15" fill="#75849a" font-size="11">${unit==='USD'?'USD · contribution':esc(unit)}</text>`;
    if(kind==='Line')series.forEach((s,j)=>{
      const points=s.values.map((v,i)=>`${x(i)},${y(v)}`),cut=forecastAt??n;
      out+=`<polyline points="${points.slice(0,cut).join(' ')}" fill="none" stroke="${s.color||C[j]}" stroke-width="${small?2:2.5}" stroke-linejoin="round"/>`;
      if(forecastAt!==null)out+=`<polyline points="${points.slice(Math.max(0,cut-1)).join(' ')}" fill="none" stroke="${s.color||C[j]}" stroke-width="2.5" stroke-dasharray="6 5"/>`;
      if(!small)s.values.forEach((v,i)=>out+=`<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.color||C[j]}"><title>${esc(labels[i])} · ${esc(s.name)}: ${num(v,2)} ${unit}${i>=cut?' (projection)':''}</title></circle>`);
    });
    else labels.forEach((label,i)=>{let base=0;const bw=pw/n*.65,step=bw/series.length;series.forEach((s,j)=>{
      const v=s.values[i],xx=kind==='Stacked bar'?x(i)-bw/2:x(i)-bw/2+j*step,ww=kind==='Stacked bar'?bw:step*.9,yy=kind==='Stacked bar'?y(base+v):y(v);base+=v;
      out+=`<rect x="${xx}" y="${yy}" width="${Math.max(1,ww)}" height="${v/max*ph}" rx="${small?1:2}" fill="${s.color||C[j]}" ${forecastAt!==null&&i>=forecastAt?'opacity=".6"':''}><title>${esc(label)} · ${esc(s.name)}: ${num(v,2)} ${unit}</title></rect>`;
    });});
    if(!small)labels.forEach((l,i)=>out+=`<text x="${x(i)}" y="${h-17}" text-anchor="middle" fill="#6f8198" font-size="11">${esc(l)}</text>`);
    return svg(out,w,h,series.map(s=>s.name).join(', ')+` (${unit})`);
  }
  function horizontal(rows,small=false,unit='bbl'){
    const w=small?260:1060,h=small?105:290,L=small?5:115,R=small?6:90,T=small?5:16,B=small?5:14,ph=h-T-B;
    const max=unit==='%'?100:Math.max(1,...rows.map(r=>r.value))*1.08;
    const gap=ph/Math.max(1,rows.length),bh=gap*.55;
    let out='';rows.forEach((r,i)=>{const yy=T+i*gap+gap*.23;
      out+=`<rect x="${L}" y="${yy}" width="${w-L-R}" height="${bh}" rx="3" fill="#f0f3f7"/><rect x="${L}" y="${yy}" width="${Math.max(0,r.value/max*(w-L-R))}" height="${bh}" rx="3" fill="${r.color||C[i%C.length]}"><title>${esc(r.name)}: ${num(r.value,2)} ${unit}</title></rect>`;
      if(!small)out+=`<text x="${L-14}" y="${yy+bh/2+4}" text-anchor="end" fill="#52677f" font-size="12">${esc(r.name)}</text><text x="${w-R+12}" y="${yy+bh/2+4}" fill="#243d59" font-size="12">${num(r.value,unit==='%'?0:1)}${unit==='%'?'%':''}</text>`;
    });return svg(out,w,h,rows.map(r=>`${r.name}: ${num(r.value)} ${unit}`).join('; '));
  }
  function donut(rows,small=false,unit=''){
    const total=rows.reduce((a,r)=>a+r.value,0),w=small?260:1060,h=small?105:290,cx=small?130:360,cy=h/2,r=small?35:99,sw=small?14:34,circ=2*Math.PI*r;
    let angle=0,out=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#edf1f6" stroke-width="${sw}"/>`;
    rows.forEach((s,i)=>{const len=total?s.value/total*circ:0;out+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color||C[i%C.length]}" stroke-width="${sw}" stroke-dasharray="${Math.max(0,len-(total&&s.value?2:0))} ${circ}" stroke-dashoffset="${-angle}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(s.name)}: ${num(s.value)} ${unit}</title></circle>`;angle+=len;});
    out+=`<text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="${small?16:28}" font-weight="600" fill="#203c5a">${compact(total)}</text>`;
    if(!small){out+=`<text x="${cx}" y="${cy+25}" text-anchor="middle" font-size="11" fill="#6f8198">${esc(unit||'records')}</text>`;rows.forEach((s,i)=>{const yy=cy-(rows.length-1)*18+i*36;out+=`<rect x="555" y="${yy-7}" width="9" height="9" rx="2" fill="${s.color||C[i%C.length]}"/><text x="578" y="${yy+1}" fill="#52677f" font-size="13">${esc(s.name)}</text><text x="800" y="${yy+1}" fill="#203c5a" font-size="13" text-anchor="end">${num(s.value,unit==='h'?1:0)}${unit==='bbl'?' bbl':''}</text><text x="870" y="${yy+1}" fill="#7a8ca1" font-size="12">${num(total?s.value/total*100:0)}%</text>`;});}
    return svg(out,w,h,rows.map(s=>`${s.name}: ${num(s.value)} ${unit}`).join('; '));
  }
  function chartData(id,when='current'){
    const m=model(),f=when==='future',months=f?[...m.current.monthly,...m.future.monthly]:m.current.monthly;
    const labels=months.map(r=>r.label.split(' ')[0]),totals=f?m.future.totals:m.current.totals;
    const base={totals,labels,forecastAt:f?12:null,unit:'bbl',source:'Production · 2025 · planned + unplanned events',rows:months};
    const line=(name,key,color)=>({name,key,color,values:months.map(r=>r[key])});
    if(id==='oil-loss')return {...base,series:[line('Gross deferred','gross_deferred_bbl',C[2]),line('Recovered','recovered_bbl',C[1]),line('Net lost','net_lost_bbl',C[0])],tableKeys:['gross_deferred_bbl','recovered_bbl','net_lost_bbl']};
    if(id==='production')return {...base,series:[line('Potential oil','potential_bbl','#94a8c2'),line('Produced oil','produced_bbl',C[0])],tableKeys:['potential_bbl','produced_bbl','net_lost_bbl']};
    if(id==='financial')return {...base,unit:'USD',source:'Production · net lost bbl × (oil price − variable cost)',series:[line('Contribution loss','net_contribution_loss_usd',C[0])],tableKeys:['net_contribution_loss_usd','produced_contribution_usd','potential_contribution_usd']};
    if(id==='downtime')return {...base,unit:'h',source:'Events · unplanned equipment-hours only',series:m.current.stages.map((s,i)=>({name:s.label,value:s.unplanned_hours,color:C[i]}))};
    if(id==='site-comparison')return {...base,series:m.current.sites.map((s,i)=>({name:s.site_name,value:f?LMEAnalytics.projection(s.site_id).totals.net_lost_bbl:s.net_lost_bbl,color:C[i]}))};
    if(id==='hse'){const hs=hazards();return {...base,unit:'actions',source:'HSE · status as of Oct 1, 2026',series:[{name:'Open',value:hs.filter(h=>h.action_status==='Open').length,color:C[2]},{name:'Closed',value:hs.filter(h=>h.action_status==='Closed').length,color:C[1]}],severity:[5,4,3,2,1].map((n,i)=>({name:'Severity '+n,value:hs.filter(h=>h.action_status==='Open'&&h.potential_severity===n).length,color:C[i]}))};}
    if(id==='data-quality'){const sites=selectedSites();return {...base,unit:'readings',source:'Readings · 2025 · duplicates removed; missing values retained',labels:sites.map(s=>s.site_name),forecastAt:null,series:['Valid','Suspect','Missing'].map((k,i)=>({name:k,value:sum(sites.map(s=>s.readings.quality_counts),k),values:sites.map(s=>s.readings.quality_counts[k]||0),color:[C[0],C[2],'#b38c9f'][i]}))};}
    if(id==='parts')return {...base,unit:'%',source:'Assets · local spare fill; Events · unplanned parts waits',series:selectedSites().map((s,i)=>({name:s.site_name,value:s.spare_fill_pct,color:C[i]})),waits:selectedSites().map((s,i)=>({name:s.site_name,value:sum(scoped(DATA.events).filter(e=>e.site_id===s.site_id&&e.event_type==='Unplanned'),'parts_wait_hours'),color:C[i]}))};
  }
  function draw(id,when,kind,small=false){const d=chartData(id,when);
    if(['oil-loss','production','financial'].includes(id)){const s=id==='oil-loss'&&kind==='Stacked bar'?[d.series[1],d.series[2]]:d.series;return cartesian(d.labels,s,kind,small,d.forecastAt,d.unit);}
    if(id==='data-quality')return kind==='Donut'?donut(d.series,small,'readings'):cartesian(d.labels,d.series,'Stacked bar',small,null,'readings');
    const rows=id==='hse'&&kind==='Bar'?d.severity:id==='parts'&&kind==='Donut'?d.waits:d.series;
    return kind==='Donut'?donut(rows,small,id==='parts'?'h':d.unit):horizontal(rows,small,d.unit);
  }
  function cards(id,when){const d=chartData(id,when),t=d.totals,sub=when==='future'?'Jan–Mar 2026 · baseline projection':'Jan–Dec 2025';
    if(id==='oil-loss')return [stat('Gross deferred',num(t.gross_deferred_bbl,0)+' bbl',sub),stat('Recovered oil',num(t.recovered_bbl,0)+' bbl',sub),stat('Net lost oil',num(t.net_lost_bbl,0)+' bbl',sub)];
    if(id==='production')return [stat('Potential oil',num(t.potential_bbl,0)+' bbl',sub),stat('Produced oil',num(t.produced_bbl,0)+' bbl',sub),stat('Production realization',num(t.produced_bbl/t.potential_bbl*100)+'%',sub)];
    if(id==='financial')return [stat('Contribution loss',money(t.net_contribution_loss_usd),sub),stat('Produced contribution',money(t.produced_contribution_usd),sub),stat('Potential contribution',money(t.potential_contribution_usd),sub)];
    if(id==='downtime')return [stat('Unplanned downtime',num(t.unplanned_downtime_hours)+' h','Equipment-hours · 2025'),stat('Unplanned events',t.unplanned_event_count),stat('Parts wait',num(d.series.find(s=>s.name==='Parts wait').value)+' h')];
    if(id==='site-comparison'){const top=[...d.series].sort((a,b)=>b.value-a.value)[0];return [stat('Sites',d.series.length,sub),stat('Net lost oil',num(t.net_lost_bbl,0)+' bbl',sub),stat('Highest loss',esc(top.name),num(top.value,0)+' bbl')];}
    if(id==='hse')return [stat('Critical open actions',criticalHazards().length,'Severity 5','critical'),stat('Open actions',openHazards().length,'Oct 1, 2026 source status'),stat('Remediation effort',num(sum(openHazards(),'action_person_hours'),0)+' h','Open source actions')];
    if(id==='data-quality')return [stat('Daily readings',num(d.series.reduce((a,s)=>a+s.value,0),0),'2025 · deduplicated'),stat('Missing readings',d.series[2].value),stat('Delayed > 1 hour',sum(selectedSites().map(s=>s.readings),'delayed_over_1h_count'))];
    if(id==='parts'){const es=scoped(DATA.events).filter(e=>e.event_type==='Unplanned');return [stat('Parts-wait hours',num(sum(es,'parts_wait_hours'))+' h','Unplanned events · 2025'),stat('Affected events',es.filter(e=>e.parts_wait_hours>0).length),stat('Share of downtime',num(sum(es,'parts_wait_hours')/sum(es,'stopped_hours')*100)+'%')];}
  }
  function overview(){const list=available(),t=model().current.totals;
    const top=canFinance()?[stat('Produced oil',num(t.produced_bbl,0)+' bbl','2025 · all selected assets'),stat('Net lost oil',num(t.net_lost_bbl,0)+' bbl','Gross deferred less recovered'),stat('Contribution loss',money(t.net_contribution_loss_usd),'Modeled · 2025 source prices'),stat('Critical HSE actions',criticalHazards().length,'Open · severity 5','critical')]:[...cards('hse','current'),stat('Missing readings',sum(selectedSites().map(s=>s.readings.quality_counts),'Missing'),'2025 daily records')];
    return meta('2025 operations · HSE snapshot: Oct 1, 2026')+`<div class="analytics-kpis four">${top.join('')}</div><div class="analytics-section-head"><h2>Analytics</h2><span>Choose a chart to explore</span></div><div class="analytics-overview">${list.map(c=>`<button class="chart-tile" data-chart="${c.id}"><span class="chart-tile-head"><span><strong>${esc(c.title)}</strong><span class="chart-subtitle">${esc(c.sub)}</span></span>${icon(c.id==='hse'?'shield':'chart')}</span><span class="chart-preview">${draw(c.id,'current',c.types[0],true)}</span><span class="chart-tile-footer"><span>${c.types.join(' / ')}</span><span class="help-link">View chart →</span></span></button>`).join('')}</div><div class="analytics-bottom"><span>${selectedSites().length} ${selectedSites().length===1?'site':'sites'} · ${selectedAssets().length} assets · Workbook data</span><span>4 views include baseline projections</span></div>`;
  }
  function detail(){const c=catalog.find(c=>c.id===active),when=c.future?period:'current',kind=type&&c.types.includes(type)?type:c.types[0],d=chartData(c.id,when),future=when==='future';
    const chartSeries=c.id==='oil-loss'&&kind==='Stacked bar'?[d.series[1],d.series[2]]:c.id==='hse'&&kind==='Bar'?d.severity:c.id==='parts'&&kind==='Donut'?d.waits:d.series;
    const note=future?`Baseline from Dec 31, 2025 · 2025 asset-hour loss rates; fixed historical margins. No intervention or growth assumed. ${num(model().future.backtest.metrics.find(m=>m.metric==='net_lost_bbl').wape_pct,1)}% net-loss error on a 3-month holdout. Not a live forecast.`:c.id==='financial'?'Contribution = oil volume × (price − variable cost). This is modeled contribution, not booked revenue or realized savings.':c.id==='production'?'Produced = potential − gross deferred + recovered. Recovery is already included in produced oil.':c.id==='oil-loss'?'Net lost = gross deferred − recovered. Includes planned and unplanned events.':c.id==='parts'&&kind==='Donut'?'Parts-wait hours by site. Spare fill is a site input; it is not an inventory balance.':!c.future?'Historical records only. This dataset does not support a reliable forward estimate for this view.':'';
    return meta(future?'Baseline projection · Jan–Mar 2026':'2025 operations · HSE snapshot: Oct 1, 2026')+`<div class="analytics-toolbar"><button class="analytics-back" data-analytics-overview>← Spare-parts dashboard</button><div class="period-toggle" aria-label="Trend period"><button data-period="current" aria-pressed="${!future}" class="${!future?'active':''}">Current trends · ${c.id==='hse'?'Oct 2026':'2025'}</button><button data-period="future" aria-pressed="${future}" class="${future?'active':''}" ${c.future?'':'disabled title="Insufficient time-series evidence for projections"'}>Future trends · projection</button></div></div><nav class="analytics-tabs" aria-label="Chart views">${available().map(k=>`<button class="chart-tab ${k.id===active?'active':''}" data-chart="${k.id}" ${k.id===active?'aria-current="true"':''}><strong>${esc(k.title)}</strong><span class="chart-preview">${draw(k.id,'current',k.types[0],true)}</span></button>`).join('')}</nav><div class="analytics-kpis">${cards(c.id,when).join('')}</div><section class="panel chart-detail"><div class="panel-head"><h2>${esc(c.id==='hse'&&kind==='Bar'?'Open actions by potential severity':c.id==='parts'&&kind==='Donut'?'Parts-wait hours by site':c.title)}${future?' · baseline projection':''}</h2><div class="chart-tools"><label class="sr-only" for="chart-type">Chart type</label><select id="chart-type">${c.types.map(t=>`<option ${t===kind?'selected':''}>${t}</option>`).join('')}</select><button class="help-link" data-chart-table>View data</button>${future?'<button class="help-link" data-chart-method>Method</button>':''}</div></div><div class="panel-body">${draw(c.id,when,kind)}${kind!=='Donut'?legend(chartSeries):''}${note?`<div class="forecast-note">${icon('info')}<span>${note}</span></div>`:''}<div class="source-line">${esc(DATA.meta.file)} · ${esc(d.source)}${future?' · derived projection for Jan–Mar 2026':''}</div></div></section>`;
  }
  function openChart(id,when='current'){if(!canChart(id))return false;const c=catalog.find(c=>c.id===id);active=id;type=c.types[0];period=when==='future'&&c.future?'future':'current';if(location.hash!=='#dashboard')location.hash='dashboard';render();window.dispatchEvent(new CustomEvent('chartchange'));return true;}
  function showOverview(){active=null;period='current';type=null;if(location.hash!=='#dashboard')location.hash='dashboard';render();return true;}
  function showData(){if(!active||!canChart(active))return;const d=chartData(active,period),c=catalog.find(c=>c.id===active);let headers,rows;
    if(d.tableKeys){headers=['Month','Basis',...d.tableKeys.map(k=>k.replaceAll('_',' '))];rows=d.rows.map(r=>[r.label,r.kind==='historical_case'?'Recorded':'Projection',...d.tableKeys.map(k=>num(r[k],2))]);}
    else if(active==='data-quality'){headers=['Site','Valid','Suspect','Missing'];rows=selectedSites().map(s=>[s.site_name,...['Valid','Suspect','Missing'].map(k=>s.readings.quality_counts[k])]);}
    else {const rs=active==='hse'&&type==='Bar'?d.severity:active==='parts'&&type==='Donut'?d.waits:d.series;headers=['Category',active==='parts'&&type==='Donut'?'hours':d.unit];rows=rs.map(r=>[r.name,num(r.value,2)]);}
    openModal(c.title+' · source values',table(headers.map(esc),rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`))+`<p class="source-line">${esc(d.source)}. ${period==='future'?'Projection values are calculations, not workbook records.':''}</p>`);
  }
  function method(){if(!allowed('dashboard'))return;const f=model().future,b=f.backtest;openModal('Projection method',`<p><strong>As of Dec 31, 2025 · Jan–Mar 2026 baseline</strong></p><p>For each asset, the 2025 gross-deferred and recovered barrels per calendar hour are multiplied by the hours in each projected month. Potential oil uses workbook capacity. Produced oil is potential minus net lost oil.</p><p>Contribution uses the calendar-hour-weighted 2025 oil price less variable cost. No price growth, seasonality, operational improvements or new events are assumed.</p>${table(['Holdout · Oct–Dec 2025','Weighted absolute error'],b.metrics.map(m=>`<tr><td>${esc(m.metric.replaceAll('_',' '))}</td><td>${num(m.wape_pct,2)}%</td></tr>`))}<p>Holdout predictions were fitted on Jan–Sep 2025. Three months are insufficient to establish dependable forecast accuracy. Site errors may be greater than the combined total.</p><p class="source-line">Projection ≠ actual 2026 results. Source: Production, Events and Assets sheets.</p>`);}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-chart],[data-period],[data-analytics-overview],[data-dashboard-home],[data-chart-table],[data-chart-method]');if(!b||b.disabled)return;
    if(b.hasAttribute('data-chart'))openChart(b.dataset.chart,period);
    if(b.hasAttribute('data-period')&&active&&canChart(active)){const c=catalog.find(c=>c.id===active);period=b.dataset.period==='future'&&c.future?'future':'current';render();}
    if(b.hasAttribute('data-analytics-overview')||b.hasAttribute('data-dashboard-home'))showOverview();
    if(b.hasAttribute('data-chart-table'))showData();if(b.hasAttribute('data-chart-method'))method();
  });
  document.getElementById('nav').addEventListener('click',e=>{if(e.target.closest('a[href="#dashboard"]'))showOverview();});
  document.addEventListener('change',e=>{if(e.target.id==='chart-type'&&active&&canChart(active)){const c=catalog.find(c=>c.id===active);type=c.types.includes(e.target.value)?e.target.value:c.types[0];render();}});
  window.AnalyticsUI={render:()=>{if(active&&!canChart(active)){active=null;period='current';type=null;}return active?detail():overview();},renderGallery:overview,openChart,showOverview,canChart,resetForRole:()=>{active=null;period='current';type=null;},context:()=>({chart:active,period}),catalog:()=>available().map(c=>({...c}))};
})();
