import test from 'node:test';
import assert from 'node:assert/strict';
import {stockReportPrompt,validateStockReport} from '../src/assistant/stock-report.mjs';
const nine=Date.parse('2026-11-03T09:00:00+08:00');
test('report validation accepts intraday and closing reports but rejects instructions',()=>{
 const job={payload:JSON.stringify({text:'股票播报'})};
 for(const title of ['盘中播报','收盘简报'])assert.doesNotThrow(()=>validateStockReport(title+'已核实的行情。'.repeat(30)+' https://example.com/source',job));
 assert.throws(()=>validateStockReport('股票播报',job));
});

test('prompt requires sector fallback and publication cutoff',()=>{const p=stockReportPrompt({due:nine,payload:JSON.stringify({text:'股票晨报'})},{timeZone:'Asia/Shanghai'},nine);assert.match(p,/行业热点/);assert.match(p,/发布时间/);assert.match(p,/7 天/);});

test('watch scope comes from this task rather than an embedded owner watchlist',()=>{
 const p=stockReportPrompt({due:nine,payload:JSON.stringify({text:'仅关注测试证券甲'})},{timeZone:'Asia/Shanghai'},nine);
 assert.match(p,/仅关注测试证券甲/);assert.match(p,/不内置作者或其他用户的关注名单/);
 const other=stockReportPrompt({due:nine,payload:JSON.stringify({text:'仅关注测试证券乙'})},{timeZone:'Asia/Shanghai'},nine);
 assert.doesNotMatch(other,/测试证券甲/);assert.match(other,/仅关注测试证券乙/);
});
