// اختبار: نفس اللاعب مفتوح في زوز onglets => الزوز ياخذو الحالة
const { io } = require('socket.io-client');
const U='http://localhost:3000';
const ask=(s,e,p)=>new Promise(r=>s.emit(e,p,r));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let f=0; const ok=(c,m)=>{console.log((c?'✅':'❌')+' '+m); if(!c)f++;};
(async()=>{
  const A=io(U),B=io(U);
  await new Promise(r=>A.on('connect',r)); await new Promise(r=>B.on('connect',r));
  const c=await ask(A,'room:create',{name:'غفران'});
  const j=await ask(B,'room:join',{code:c.code,name:'حوسام'});
  // B يفتح onglet ثاني بنفس الهوية
  const B2=io(U); await new Promise(r=>B2.on('connect',r));
  let s1=null,s2=null,invited=false;
  B.on('state',s=>s1=s); B2.on('state',s=>s2=s);
  B.on('fx',x=>{if(x.type==='invite')invited=true;});
  await ask(B2,'room:rejoin',{code:c.code,playerId:j.playerId});
  await ask(A,'hub:open'); await wait(60);
  ok(s1&&s1.status==='hub','onglet 1 متاع حوسام يوصلو state');
  ok(s2&&s2.status==='hub','onglet 2 متاع حوسام يوصلو state زادة');
  await ask(A,'hub:propose',{gameId:'wyr'}); await wait(80);
  ok(s1&&s1.proposal&&s1.proposal.byId===c.playerId,'الاقتراح وصل للonglet 1');
  ok(s2&&s2.proposal,'الاقتراح وصل للonglet 2');
  ok(invited,'تنبيه الدعوة وصل');
  ok((await ask(B,'hub:answer',{accept:true})).ok,'الموافقة خدمت');
  await wait(60);
  ok(s2.proposal.accepted,'الموافقة تشافت في الonglet الآخر');
  // نقطعو onglet وحد: اللاعب يبقى connecté
  B2.close(); await wait(150);
  ok(s1.players.find(p=>p.id===j.playerId).connected===true,'قطع onglet واحد ما يخرجش اللاعب');
  A.close();B.close();
  console.log(f?`\n❌ ${f} طاحو`:'\n🎉 الكل نجح'); process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
