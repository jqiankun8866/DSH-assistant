const check=(v,m)=>{if(!v)throw Error(m)};
export const taskStates=['todo','in_progress','waiting_user','waiting_external','failed','completed'];
export function taskDetails(input={},prior={}){
 check(input&&typeof input==='object'&&!Array.isArray(input),'事务详情须为对象');
 check(Object.keys(input).every(k=>['state','nextAction','source','deadline','steps','materials','outcome'].includes(k)),'未知事务字段');
 const d={state:'todo',nextAction:'',source:'',deadline:null,steps:[],materials:[],outcome:'',...prior,...input};
 check(taskStates.includes(d.state),'事务状态无效');
 for(const k of ['nextAction','source','outcome'])check(typeof d[k]==='string'&&d[k].length<=1000,k+'过长');
 check(d.deadline===null||typeof d.deadline==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(d.deadline)&&Number.isFinite(Date.parse(d.deadline)),'截止时间须带时区');
 check(Array.isArray(d.steps)&&d.steps.length<=30,'最多30个步骤');
 for(const s of d.steps)check(s&&typeof s.text==='string'&&s.text.trim()&&s.text.length<=500&&['todo','done'].includes(s.state)&&Object.keys(s).every(k=>['text','state'].includes(k)),'步骤须为{text,state:todo/done}');
 check(Array.isArray(d.materials)&&d.materials.length<=20&&d.materials.every(s=>typeof s==='string'&&s.length<=500),'材料清单无效');
 return d;
}
