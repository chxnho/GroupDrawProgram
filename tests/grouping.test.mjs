import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Run the actual inline application logic, with only browser/React side effects
// replaced. No copied grouping implementation, external packages or live roster.
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const logic=/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
assert.ok(logic);
const localeSource=await readFile(new URL('../group-language.js',import.meta.url),'utf8');
const localeCodes=['ko','en','zh-CN','ja','es','fr','vi','de','pt-BR','id'];
test('all ten locales render the template keys and leave saved classroom values untouched',()=>{
 const environment={URLSearchParams,Event,dispatchEvent(){},document:{documentElement:{}},location:{search:'?lang=fr'}};
 vm.runInNewContext(localeSource,environment);
 const language=environment.GroupLanguage;
 assert.equal(language.language,'fr');
 const {app}=application({mode:'any',GroupLanguage:language});
 app.state.input='학생 명단 M\n모둠 F';app.applyRoster();
 app.state.rosterName='학생 명단';app.saveSlot();app.draw();
 const data=JSON.stringify([app.state.input,app.state.groups,app.state.slots]);
 const templateKeys=[...html.matchAll(/{{\s*labels\.(\w+)\s*}}/g)].map(match=>match[1]);
 for(const locale of localeCodes){
  language.setLanguage(locale);
  const view=app.renderVals();
  assert.equal(environment.document.documentElement.lang,locale);
  for(const key of templateKeys)assert.ok(view.labels[key],locale+' '+key);
  assert.equal(view.slots.find(slot=>slot.label==='학생 명단').label,'학생 명단');
  assert.equal(view.groupCards.flatMap(group=>group.members).some(member=>member.name==='모둠'),true);
  assert.equal(JSON.stringify([app.state.input,app.state.groups,app.state.slots]),data);
 }
 language.setLanguage('unsupported');assert.equal(language.language,'id');
});
function application({male=4,female=4,mode='mix',count=2,min2=false,constraints=[],seed=1,repeat=[],GroupLanguage}={}){
 let random=seed>>>0;const math=Object.create(Math);math.random=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
 const stored=new Map([['jaripick.slots.v1','{"existing":{"students":[{"name":"saved","gender":"여"}],"constraints":[]}}']]);let cheers=0;
 class DCLogic{constructor(){this.props={cheerOnSuccess:true,targetGroupSize:5};}setState(change){Object.assign(this.state,typeof change==='function'?change(this.state):change);}forceUpdate(){}}
 const Component=vm.runInNewContext(logic+'\nComponent',{DCLogic,GroupLanguage,Math:math,React:{createRef:()=>({current:null})},localStorage:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value))},setInterval:()=>1,clearInterval(){},Audio:class{play(){cheers++;return Promise.resolve();}}},{timeout:1000});
 const app=new Component();app.state.students=[...Array.from({length:male},(_,i)=>({name:'M'+(i+1),gender:'남'})),...Array.from({length:female},(_,i)=>({name:'F'+(i+1),gender:'여'}))];Object.assign(app.state,{mode,groupCount:count,ruleMin2:min2,constraints,ruleAvoidRepeat:repeat.length>0,prevPairs:repeat});
 return {app,stored,cheers:()=>cheers};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const maleCounts=groups=>Array.from(groups,g=>g.filter(s=>s.gender==='남').length);
function rosterIntact(app,groups){assert.deepEqual(Array.from(groups.flat(),s=>s.name).sort(),Array.from(app.state.students,s=>s.name).sort());assert.equal(new Set(groups.flat().map(s=>s.name)).size,app.state.students.length);assert.deepEqual(Array.from(groups,g=>g.length),Array.from(app.computePlan(app.state.mode,app.state.groupCount).sizes));}
function optimalCost(sizes,male){const n=sizes.reduce((a,b)=>a+b,0);let best=Infinity;function visit(i,left,cost){if(i===sizes.length){if(left===0)best=Math.min(best,cost);return;}for(let m=0;m<=Math.min(left,sizes[i]);m++)visit(i+1,left-m,cost+Math.abs(m*n-sizes[i]*male));}visit(0,male,0);return best;}

test('reported alternating 8-person roster always produces two groups with 2M/2F',()=>{
 for(let seed=1;seed<=40;seed++){const {app}=application({seed});app.state.students=app.parseRoster('시험1 남\n시험2 여\n시험3 남\n시험4 여\n시험5 남\n시험6 여\n시험7 남\n시험8 여');app.state.groupCount=0;const groups=app.attempt('mix',0);assert.deepEqual(maleCounts(groups),[2,2]);rosterIntact(app,groups);app.draw();assert.equal(app.state.lastViolations,0);assert.equal(app.state.lastGenderViolations,0);assert.equal(app.state.noteKind,'ok');assert.match(app.renderVals().resultMeta,/조건 완전 충족/);}
});
test('unequal and odd rosters achieve independently enumerated best proportional gender allocation',()=>{
 for(const [male,female,count]of [[5,4,2],[2,7,2],[7,2,3],[5,5,3],[1,7,2],[7,0,2],[0,7,3],[6,5,4],[4,9,3]])for(let seed=1;seed<=12;seed++){
  const {app}=application({male,female,count,seed}),groups=app.attempt('mix',count),n=male+female,cost=groups.reduce((sum,g)=>sum+Math.abs(g.filter(s=>s.gender==='남').length*n-g.length*male),0);assert.equal(cost,optimalCost(Array.from(groups,g=>g.length),male),`${male}/${female}/${count}/${seed}`);assert.equal(app.score(groups,'mix').genderViolations,0);rosterIntact(app,groups);
 }
});
test('same gender stays homogeneous; any mode does not add a gender rule',()=>{
 const same=application({mode:'same'}).app,groups=same.attempt('same',2);assert.ok(groups.every(g=>new Set(g.map(s=>s.gender)).size===1));assert.equal(same.score(groups,'same').genderViolations,0);rosterIntact(same,groups);
 const any=application({mode:'any'}).app;const segregated=[any.state.students.slice(0,4),any.state.students.slice(4)];assert.equal(any.score(segregated,'any').genderViolations,0);assert.ok(any.score(segregated,'mix').genderViolations>0);
});
test('one minority per group when feasible; requested impossible group count is retained and honestly reported',()=>{
 for(const [male,female]of [[6,2],[2,6]]){const {app}=application({male,female,mode:'solo'}),groups=app.attempt('solo',2),minority=male<female?'남':'여';assert.ok(groups.every(g=>g.filter(s=>s.gender===minority).length===1));assert.equal(app.score(groups,'solo').genderViolations,0);rosterIntact(app,groups);}
 for(const options of [{male:6,female:2,count:4},{male:4,female:4,count:2},{male:8,female:0,count:2}]){const {app,cheers}=application({...options,mode:'solo'});app.draw();assert.equal(app.state.groups.length,options.count);rosterIntact(app,app.state.groups);assert.ok(app.state.lastGenderViolations>0);assert.equal(app.state.noteKind,'error');assert.doesNotMatch(app.renderVals().resultMeta,/조건 완전 충족/);assert.equal(cheers(),0);}
});
test('minimum two of each gender is guaranteed when feasible, including otherwise random mode',()=>{
 for(const mode of ['mix','any'])for(let seed=1;seed<=20;seed++){const {app}=application({male:6,female:6,count:3,mode,min2:true,seed}),groups=app.attempt(mode,3);assert.ok(groups.every(g=>g.filter(s=>s.gender==='남').length>=2&&g.filter(s=>s.gender==='여').length>=2));assert.equal(app.score(groups,mode).genderViolations,0);rosterIntact(app,groups);}
});
test('insufficient minority, undersized groups and conflicting gender options never claim full success',()=>{
 for(const options of [{male:6,female:2,count:2,mode:'mix'},{male:3,female:3,count:2,mode:'any'},{male:4,female:4,count:2,mode:'same'},{male:6,female:2,count:2,mode:'solo'}]){
  const {app,cheers}=application({...options,min2:true});app.draw();rosterIntact(app,app.state.groups);assert.ok(app.state.lastGenderViolations>0);assert.equal(app.state.noteKind,'error');assert.doesNotMatch(app.state.note,/모든 제한 조건을 만족/);assert.doesNotMatch(app.renderVals().resultMeta,/조건 완전 충족/);assert.equal(cheers(),0);
 }
});
test('compatible hard together/apart rules remain satisfied with balanced genders',()=>{
 const constraints=[['M1','F1','같이'],['M1','M2'],['F1','F2']];for(let seed=1;seed<=6;seed++){const {app}=application({constraints,seed});app.draw();const score=app.score(app.state.groups,'mix');assert.equal(score.violations,0);assert.equal(score.genderViolations,0);rosterIntact(app,app.state.groups);}
});
test('hard-pair conflict with balance preserves hard rules and reports remaining gender condition',()=>{
 const {app,cheers}=application({constraints:[['M1','M2','같이'],['M2','M3','같이'],['M3','M4','같이']]});app.draw();const score=app.score(app.state.groups,'mix');assert.equal(score.violations,0);assert.ok(score.genderViolations>0);assert.equal(app.state.noteKind,'error');assert.doesNotMatch(app.renderVals().resultMeta,/조건 완전 충족/);assert.equal(cheers(),0);rosterIntact(app,app.state.groups);
});
test('contradictory hard rules report remaining violations without claiming mathematical impossibility',()=>{
 const {app}=application({mode:'any',constraints:[['M1','F1','같이'],['M1','F1']]});app.draw();assert.ok(app.state.lastViolations>0);assert.equal(app.state.noteKind,'error');assert.doesNotMatch(app.state.note,/모두 만족시킬 수 없어|최선의 배치/);assert.doesNotMatch(app.renderVals().resultMeta,/조건 완전 충족/);rosterIntact(app,app.state.groups);
});
test('repeat-pair preference cannot override hard rules and remaining repeats are disclosed',()=>{
 const {app}=application({constraints:[['M1','F1','같이']],repeat:['F1|M1']});app.draw();assert.equal(app.state.lastViolations,0);assert.equal(app.state.lastGenderViolations,0);assert.ok(app.state.lastRepeatViolations>0);assert.match(app.renderVals().resultMeta,/지난 짝 겹침/);assert.doesNotMatch(app.renderVals().resultMeta,/조건 완전 충족/);
});
test('manual roster/constraint storage format and required controls survive redesign',()=>{
 const {app,stored}=application();app.componentDidMount();const previous=stored.get('jaripick.slots.v1');app.draw();assert.equal(stored.get('jaripick.slots.v1'),previous);assert.ok(stored.has('jaripick.prevpairs.v1'));app.state.rosterName='fixture';app.state.constraints=[['M1','F1','같이']];app.saveSlot();const slot=JSON.parse(stored.get('jaripick.slots.v1')).fixture;assert.deepEqual(Object.keys(slot).sort(),['constraints','students']);assert.deepEqual(slot.constraints,[['M1','F1','같이']]);assert.deepEqual(plain(app.parseRoster(app.rosterToText(app.state.students))),plain(app.state.students));
 for(const action of ['applyRoster','clearRoster','saveSlot','pickRosterFile','exportRoster','pickConstraintFile','exportConstraints','clearConstraints','draw','saveImage','saveText'])assert.ok(html.includes('onClick="{{ '+action+' }}"'),action);
 assert.match(html,/<title>모둠 자리 랜덤 시스템 · 배움길<\/title>/);assert.match(html,/aria-label="{{ labels.roster }}"/);
});
