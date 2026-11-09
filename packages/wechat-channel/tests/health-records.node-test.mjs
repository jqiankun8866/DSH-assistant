import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {healthRecords} from '../src/assistant/health-records.mjs';
function fixture(t){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE memories(peer TEXT,key TEXT,category TEXT,value TEXT,source TEXT,confirmed INTEGER,updated INTEGER,PRIMARY KEY(peer,key))');t.after(()=>db.close());return {engine:{db},now:()=>1000}}
test('health chart records ABO/Rh without guessing; isolates peers, checks stale edits and consent',t=>{
 const s=fixture(t);const save={record:{bloodType:'A',rh:'positive',bloodSource:'检验单',name:'测试'},source:'本人明确保存',confirmed:true};
 assert.throws(()=>healthRecords(s,'a','save_demographics',{...save,confirmed:false}));
 const first=healthRecords(s,'a','save_demographics',save).entry;
 assert.equal(healthRecords(s,'a','chart').profile.record.bloodType,'A');assert.equal(healthRecords(s,'b','chart').profile,null);
 assert.throws(()=>healthRecords(s,'b','save_demographics',{...save,expected:first}));
 const second=healthRecords(s,'a','save_demographics',{...save,expected:first,record:{bloodType:'unknown'}}).entry;
 assert.equal(second.record.rh,'unknown');assert.ok(second.updated>first.updated);
 assert.throws(()=>healthRecords(s,'a','save_demographics',{...save,expected:first}));
 assert.throws(()=>healthRecords(s,'a','save_demographics',{...save,expected:second,record:{birthDate:'2025-02-31'}}));
});
test('longitudinal exams retain original units, ranges, sources and original report references',t=>{
 const s=fixture(t),data={record:{type:'exam',title:'年度体检',date:'2026-11-01',evidence:'report',reportRef:'media/report.pdf',metrics:[{name:'某指标',value:'5.1',unit:'mmol/L',range:'报告原文',flag:'unknown'}]},source:'体检报告第2页',confirmed:true};
 const old=healthRecords(s,'a','save_record',data).entry;
 healthRecords(s,'a','save_record',{...data,record:{...data.record,date:'2025-11-01'}});
 const chart=healthRecords(s,'a','chart');assert.equal(chart.total,2);assert.equal(chart.records[0].record.date,'2026-11-01');assert.equal(chart.records[0].record.metrics[0].range,'报告原文');assert.equal(chart.records[0].record.reportRef,'media/report.pdf');
 assert.throws(()=>healthRecords(s,'b','delete_record',{key:old.key,expected:old,confirmed:true}));
 assert.throws(()=>healthRecords(s,'a','save_record',{...data,record:{...data.record,evidence:'AI诊断'}}));
 assert.equal(healthRecords(s,'a','delete_record',{key:old.key,expected:old,confirmed:true}).deleted,true);
 assert.equal(healthRecords(s,'a','chart').total,1);
});
