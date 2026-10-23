from pathlib import Path
import json
import sys
d=json.loads(Path(sys.argv[1] if len(sys.argv)>1 else 'workbook-data.json').read_text())
def take(x,keys): return {k:x.get(k) for k in keys.split()}
def source(x):
    s=x.get('source',{})
    return {k:s[k] for k in ['sheet','row','cells'] if k in s}
sites=[]
for s in d['sites']:
    r=take(s,'site_id site_name asset_ids network_uptime_pct spare_fill_pct technicians training_hours_per_person training_required_hours available_project_hours cleanup_setup_usd edge_setup_usd edge_annual_usd')
    r['readings']=take(s['readings'],'reading_count quality_counts delayed_over_1h_count')
    r['source']=source(s)
    sites.append(r)
assets=[]
for a in d['assets']:
    r=take(a,'asset_id site_id asset_type age_years modeled_capacity_bbl_hr criticality vibration_normal_mm_s temperature_normal_c')
    latest=max((x for x in d['readings'] if x['asset_id']==a['asset_id']),key=lambda x:x['observed_utc'])
    r['latest']=take(latest,'reading_id observed_utc received_utc vibration_mm_s temperature_c operating_state quality inspection_note')
    r['latest']['source']=source(latest)
    r['source']=source(a)
    assets.append(r)
events=[]
for e in d['events']:
    r=take(e,'event_id asset_id site_id start_utc end_utc event_type cause detect_hours dispatch_hours parts_wait_hours repair_hours restart_hours stopped_hours work_order_id work_type technician_note parts_usd cost_status')
    r['source']=source(e)
    events.append(r)
hse=[]
for h in d['hse']:
    r=take(h,'hse_id event_id asset_id site_id observed_utc hazard outcome potential_severity likelihood_band control_gap action_owner due_date closed_date action_status action_setup_usd action_annual_usd action_person_hours spilled_oil_bbl recovered_spill_bbl status_as_of is_overdue')
    r['source']=source(h)
    hse.append(r)
production=[{**take(p,'asset_id site_id month potential_oil_bbl produced_oil_bbl gross_deferred_bbl recovered_oil_bbl'), 'source':source(p)} for p in d['production']]
options=[{**take(o,'option_id option_name billing_unit setup_usd annual_usd lead_months install_person_hours applicable_types prerequisite benefit_rule'),'source':source(o)} for o in d['options']]
web={'meta':{'file':d['meta']['source'],'sha256':d['meta']['source_sha256'],'period':d['meta']['period'],'hseAsOf':d['meta']['hse_status_as_of'][0],'cleaning':d['meta']['cleaning']},'sites':sites,'assets':assets,'events':events,'hse':hse,'production':production,'options':options}
Path(sys.argv[2] if len(sys.argv)>2 else 'dist/data.js').write_text('window.WORKBOOK_DATA = '+json.dumps(web,separators=(',',':'),ensure_ascii=False)+';\n')
print('Workbook-only web data:',len(sites),'sites,',len(assets),'assets,',len(events),'events,',len(hse),'HSE records.')
