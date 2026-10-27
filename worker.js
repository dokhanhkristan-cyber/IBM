const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(message,status=400)=>json({ok:false,error:message},status);
const random=(n=16)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
const pin=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%900000+100000);
const norm=s=>String(s||'').trim().slice(0,80);
const cents=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000000;
export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(u.pathname.startsWith('/api/')){
      const id=env.GAME.idFromName('shared-global-game');
      return env.GAME.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
export class GlobalGame {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, title TEXT NOT NULL, host_token TEXT NOT NULL, created_at TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, name TEXT NOT NULL, access_code TEXT NOT NULL, balance INTEGER NOT NULL, created_at TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, reveal INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS investments (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, room_id TEXT NOT NULL, team_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(room_id,team_id))');
  }
  rows(q,...a){return [...this.sql.exec(q,...a)];}
  one(q,...a){return this.rows(q,...a)[0];}
  host(game,token){return !!game&&game.host_token===token;}
  team(gameId,teamId,accessCode){const t=this.one('SELECT * FROM teams WHERE id=? AND game_id=?',teamId,gameId);return t&&t.access_code===accessCode?t:null;}
  snapshot(gameId,hostToken,teamId,accessCode){
    const game=this.one('SELECT * FROM games WHERE id=?',gameId);if(!game)return null;
    const isHost=this.host(game,hostToken);
    const me=this.team(gameId,teamId,accessCode);
    if(!isHost&&!me)return null;
    const rooms=this.rows('SELECT id,name,code,reveal FROM rooms WHERE game_id=? ORDER BY created_at,id',gameId);
    const teams=this.rows('SELECT id,name,balance FROM teams WHERE game_id=? ORDER BY created_at,id',gameId);
    const all=this.rows('SELECT room_id,team_id,amount,created_at FROM investments WHERE game_id=?',gameId);
    return {ok:true,game:{id:game.id,title:game.title},isHost,me:me?{id:me.id,name:me.name,balance:me.balance}:null,
      rooms:rooms.map(r=>({id:r.id,name:r.name,code:r.code,reveal:!!r.reveal,
        total:r.reveal?all.filter(i=>i.room_id===r.id).reduce((s,i)=>s+i.amount,0):null,
        investments:r.reveal?all.filter(i=>i.room_id===r.id).map(i=>({teamId:i.team_id,teamName:teams.find(t=>t.id===i.team_id)?.name||'Team',amount:i.amount})):[],
        submitted:me?all.some(i=>i.room_id===r.id&&i.team_id===me.id):false,
        myInvestment:me?all.find(i=>i.room_id===r.id&&i.team_id===me.id)?.amount??null:null})),
      teams:isHost?teams:[],teamCount:teams.length};
  }
  async fetch(req){
    const url=new URL(req.url),route=url.pathname.replace(/^\/api\//,'');
    if(req.method==='OPTIONS')return new Response(null,{status:204});
    let b={};try{if(req.method==='POST')b=await req.json();}catch{return fail('Invalid JSON');}
    try{
      if(route==='create-game'&&req.method==='POST'){
        const title=norm(b.title)||'PITCH PULSE';const id=random(10),hostToken=random(24),now=new Date().toISOString();
        this.sql.exec('INSERT INTO games (id,title,host_token,created_at) VALUES (?,?,?,?)',id,title,hostToken,now);
        return json({ok:true,gameId:id,hostToken});
      }
      if(route==='join'&&req.method==='POST'){
        const code=norm(b.code).toUpperCase(),accessCode=norm(b.accessCode).toUpperCase();
        const r=this.one('SELECT * FROM rooms WHERE code=?',code);if(!r)return fail('Room code not found.',404);
        const t=this.one('SELECT * FROM teams WHERE game_id=? AND access_code=?',r.game_id,accessCode);
        if(!t)return fail('Invalid team access code.',403);
        return json({ok:true,gameId:r.game_id,teamId:t.id,accessCode:t.access_code,roomId:r.id});
      }
      if(route==='state'&&req.method==='GET'){
        const s=this.snapshot(url.searchParams.get('gameId'),url.searchParams.get('hostToken'),url.searchParams.get('teamId'),url.searchParams.get('accessCode'));
        return s?json(s):fail('Invalid session or credentials.',403);
      }
      const game=this.one('SELECT * FROM games WHERE id=?',norm(b.gameId));
      if(!game)return fail('Game not found.',404);
      if(route==='add-team'&&req.method==='POST'){
        if(!this.host(game,b.hostToken))return fail('Host access required.',403);
        const name=norm(b.name);if(!name)return fail('Team name is required.');
        if(this.one('SELECT id FROM teams WHERE game_id=? AND lower(name)=lower(?)',game.id,name))return fail('Team name already exists.');
        const id=random(10),accessCode=random(5).toUpperCase();
        this.sql.exec('INSERT INTO teams VALUES (?,?,?,?,?,?)',id,game.id,name,accessCode,1000000000,new Date().toISOString());
        return json({ok:true,team:{id,name,accessCode}});
      }
      if(route==='add-room'&&req.method==='POST'){
        if(!this.host(game,b.hostToken))return fail('Host access required.',403);
        const name=norm(b.name);if(!name)return fail('Project name is required.');
        if(this.rows('SELECT id FROM rooms WHERE game_id=?',game.id).length>=20)return fail('Maximum 20 projects per game.');
        let code;do{code=pin();}while(this.one('SELECT id FROM rooms WHERE code=?',code));
        const id=random(10);this.sql.exec('INSERT INTO rooms (id,game_id,name,code,reveal,created_at) VALUES (?,?,?,?,0,?)',id,game.id,name,code,new Date().toISOString());
        return json({ok:true,room:{id,name,code}});
      }
      if(route==='invest'&&req.method==='POST'){
        const t=this.team(game.id,b.teamId,b.accessCode);if(!t)return fail('Invalid team credentials.',403);
        const room=this.one('SELECT * FROM rooms WHERE id=? AND game_id=?',norm(b.roomId),game.id);
        if(!room)return fail('Room not found.',404);
        if(room.reveal)return fail('Investments are closed for this project.');
        if(this.one('SELECT id FROM investments WHERE room_id=? AND team_id=?',room.id,t.id))return fail('Investment already locked for this project.');
        const amount=b.amount;
        if(!cents(amount)||amount>t.balance)return fail('Invalid amount or insufficient balance.');
        this.ctx.storage.transactionSync(()=>{
          const current=this.one('SELECT balance FROM teams WHERE id=?',t.id);
          if(!current||current.balance<amount)throw Error('Insufficient balance.');
          if(this.one('SELECT id FROM investments WHERE room_id=? AND team_id=?',room.id,t.id))throw Error('Investment already locked.');
          this.sql.exec('UPDATE teams SET balance=balance-? WHERE id=?',amount,t.id);
          this.sql.exec('INSERT INTO investments VALUES (?,?,?,?,?,?)',random(10),game.id,room.id,t.id,amount,new Date().toISOString());
        });
        return json({ok:true,balance:t.balance-amount});
      }
      if(route==='reveal'&&req.method==='POST'){
        if(!this.host(game,b.hostToken))return fail('Host access required.',403);
        const r=this.one('SELECT * FROM rooms WHERE id=? AND game_id=?',norm(b.roomId),game.id);if(!r)return fail('Room not found.',404);
        this.sql.exec('UPDATE rooms SET reveal=1 WHERE id=?',r.id);return json({ok:true});
      }
      return fail('Unknown API route.',404);
    }catch(e){return fail('Request failed: '+String(e.message||e),500);}
  }
}
