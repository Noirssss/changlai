const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const day=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
const short=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
function validState(s){return s&&Array.isArray(s.members)&&s.members.length>0&&s.members.length<=30&&s.members.some(m=>m.id==='me')&&s.members.every(m=>short(m.id,100)&&short(m.name,40)&&short(m.emoji,20))&&new Set(s.members.map(m=>m.id)).size===s.members.length&&Array.isArray(s.tasks)&&s.tasks.length<=500&&s.tasks.every(t=>short(t.id,100)&&short(t.name,100)&&short(t.type,20)&&/^\d{2}:\d{2}$/.test(t.time)&&s.members.some(m=>m.id===t.member))&&Array.isArray(s.logs)&&s.logs.length<=100000&&s.logs.every(l=>short(l.task,100)&&short(l.name,100)&&short(l.member,40)&&/^\d{4}-\d{2}-\d{2}$/.test(l.day)&&/^\d{2}:\d{2}$/.test(l.time))}

function identity(req,db){const raw=req.headers.get('x-family-key');if(raw&&raw===db.keys.admin)return {admin:true};const member=Object.keys(db.keys.members).find(id=>db.keys.members[id]===raw);return member?{admin:false,member}:null;}
const headers={'Access-Control-Allow-Origin':'https://noirssss.github.io','Access-Control-Allow-Headers':'content-type, x-family-key, apikey, authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Max-Age':'86400','Vary':'Origin','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
async function handler(req){try{
 const url=new URL(req.url);url.pathname='/api/'+url.pathname.split('/').pop();
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method==='POST'&&req.headers.get('origin')!=='https://noirssss.github.io')return json(403,{error:'请求来源不正确'});
 const base=Deno.env.get('SUPABASE_URL')+'/rest/v1/family_state';
 const auth={apikey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json'};
 const read=await fetch(base+'?id=eq.1&select=data,revision',{headers:auth});if(!read.ok)throw Error('storage');
 const rows=await read.json();if(!rows[0])throw Error('storage');let db=rows[0].data;const revision=rows[0].revision;
 async function persist(){const result=await fetch(base+'?id=eq.1&revision=eq.'+revision,{method:'PATCH',headers:{...auth,Prefer:'return=representation'},body:JSON.stringify({data:db,revision:revision+1})});if(!result.ok)throw Error('storage');if(!(await result.json()).length)throw Error('conflict');}
  if(!url.pathname.startsWith('/api/')){return json(404,{error:'页面不存在'});return}
  const who=identity(req,db);if(!who){return json(401,{error:'密码不正确，请重新输入'});return}
  if(req.method==='GET'&&url.pathname==='/api/state'){
   const tasks=who.admin?db.tasks:db.tasks.filter(t=>t.member===who.member);
   return json(200,{role:who.admin?'admin':'member',member:who.member||'me',members:who.admin?db.members:db.members.filter(m=>m.id===who.member),tasks,logs:who.admin?db.logs:db.logs.filter(l=>l.day===day()&&tasks.some(t=>t.id===l.task)),imported:db.imported});return
  }
  if(req.method==='GET'&&url.pathname==='/api/passwords'){if(!who.admin)return json(403,{error:'只有管理员可以管理密码'});return json(200,{members:db.members.map(m=>({id:m.id,password:db.keys.members[m.id]}))});}
  if(req.method==='GET'&&url.pathname==='/api/links'){
   if(!who.admin){return json(403,{error:'只有管理员可以查看家庭入口'});return}
   const origin='https://noirssss.github.io/changlai/';return json(200,{admin:`${origin}#key=${db.keys.admin}`,members:db.members.map(m=>({id:m.id,url:`${origin}#key=${db.keys.members[m.id]}`}))});return
  }
  if(req.method!=='POST'){return json(404,{error:'接口不存在'});return}
  const raw=await req.text();if(raw.length>2000000)return json(413,{error:'数据过大'});let body;try{body=JSON.parse(raw||'{}')}catch{return json(400,{error:'数据格式不正确'})}
  if(url.pathname==='/api/import'){
   if(!who.admin){return json(403,{error:'只有管理员可以迁移记录'});return}
   if(!db.imported&&validState(body)){db.members=body.members;if(!db.members.some(m=>m.id==='grandma'))db.members.push({id:'grandma',name:'奶奶',emoji:'👵'});db.tasks=body.tasks;db.logs=body.logs;for(const m of db.members)db.keys.members[m.id] ||= token();db.imported=true;await persist()}return json(200,{ok:true});return
  }
  if(url.pathname==='/api/check'){
   const task=db.tasks.find(t=>t.id===body.task);if(!task||(!who.admin&&task.member!==who.member)){return json(403,{error:'只能操作自己的打卡项目'});return}
   const existing=db.logs.find(l=>l.task===task.id&&l.day===day());if(body.done===false){db.logs=db.logs.filter(l=>l!==existing)}else if(!existing){db.logs.unshift({id:crypto.randomUUID(),task:task.id,day:day(),time:new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}),name:task.name,member:db.members.find(m=>m.id===task.member).name,recorder:who.admin&&task.member!=='me'?'管理员代记':'本人记录'})}await persist();return json(200,{ok:true,logs:who.admin?db.logs:db.logs.filter(l=>l.day===day()&&db.tasks.some(t=>t.id===l.task&&t.member===who.member))});return
  }
  if(!who.admin){return json(403,{error:'只有管理员可以管理家庭和查看记录'});return}
  if(url.pathname==='/api/member-password'){
 const password=body.password;if(!db.members.some(m=>m.id===body.member)||typeof password!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(password))return json(400,{error:'密码需为1到64位字母、数字、下划线或短横线'});
 if(password===db.keys.admin||Object.entries(db.keys.members).some(([id,key])=>id!==body.member&&key===password))return json(400,{error:'此密码已被使用，请换一个'});
 db.keys.members[body.member]=password;await persist();return json(200,{ok:true});}
  if(url.pathname==='/api/task'){
   if(!short(body.name,40)||!db.members.some(m=>m.id===body.member)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)||!['吃药','起床','运动','喝水','阅读','其他'].includes(body.type)){return json(400,{error:'请完整填写打卡项目'});return}db.tasks.push({id:crypto.randomUUID(),name:body.name.trim(),member:body.member,type:body.type,time:body.time});await persist();return json(200,{ok:true});return
  }
  if(url.pathname==='/api/member'){
   if(!short(body.name,12)||!['🙂','👨','👩','👴','👵','👦','👧'].includes(body.emoji)){return json(400,{error:'请填写成员称呼并选择头像'});return}const id=crypto.randomUUID();db.members.push({id,name:body.name.trim(),emoji:body.emoji});db.keys.members[id]=token();await persist();return json(200,{ok:true});return
  }return json(404,{error:'接口不存在'});

}catch(e){return json(e.message==='conflict'?409:500,{error:e.message==='conflict'?'家人刚刚更新了记录，请重试':'暂时无法保存，请稍后重试'});}}
Deno.serve(handler);
