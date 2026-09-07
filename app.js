'use strict';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.hash.slice(1));
const room=params.get('room'), token=params.get('key');
const guest=Boolean(room);
let peer,stream,hostLink,remoteCall,secret,ready=false,joining=false;
const viewers=new Map();
const status=text=>{$('status').textContent=text;};
const showVideo=()=>{$('empty').hidden=true;};
const count=()=>{$('count').textContent=viewers.size ? `${viewers.size} watching` : '';};
function notice(){return stream ? (stream.getAudioTracks().length?'Sharing your tab. Control playback in Aether.':'Sharing without audio. Stop and share again with tab audio enabled.') : 'Room ready. Share your Aether tab.';}
function sendState(conn){if(conn.open)conn.send({type:'state',sharing:!!stream});}
function broadcast(){for(const {conn} of viewers.values())sendState(conn);}
function attachCall(entry){if(!stream||!entry.conn.open)return;entry.call?.close();entry.call=peer.call(entry.conn.peer,stream,{metadata:{key:secret}});entry.call?.on('error',()=>status('A viewer’s video connection failed. They can leave and rejoin.'));}
function stopShare(){const old=stream;stream=null;old?.getTracks().forEach(t=>t.stop());for(const e of viewers.values()){e.call?.close();e.call=null;}$('video').srcObject=null;$('empty').hidden=false;$('stop').hidden=true;$('share').disabled=!ready;broadcast();status('Sharing stopped. The room is still open.');}
function setupPeer(){
 if(typeof Peer==='undefined'){status('Connection library could not load. Reload to retry.');return false;}
 peer=new Peer();
 peer.on('error',err=>{status(err.type==='peer-unavailable'?'Host not found. Ask for a fresh invite.':`Connection failed (${err.type||'network'}). Leave and retry; some networks block direct video connections.`);});
 peer.on('disconnected',()=>{ready=false;$('share').disabled=true;status('Room service disconnected. Leave and create or join a new room.');});
 peer.on('connection',conn=>{
  if(guest){conn.close();return;}
  let authenticated=false;
  const timer=setTimeout(()=>{if(!authenticated)conn.close();},10000);
  conn.on('data',data=>{
   if(authenticated)return;
   if(!data||data.type!=='join'||data.key!==secret||viewers.size>=4){conn.close();return;}
   authenticated=true;clearTimeout(timer);const entry={conn,call:null};viewers.set(conn.peer,entry);sendState(conn);attachCall(entry);count();
  });
  const cleanup=()=>{clearTimeout(timer);const entry=viewers.get(conn.peer);if(entry?.conn===conn){entry.call?.close();viewers.delete(conn.peer);count();}};
  conn.on('close',cleanup);conn.on('error',cleanup);
 });
 peer.on('call',call=>{
  if(!guest||call.peer!==room||call.metadata?.key!==token){call.close();return;}
  remoteCall?.close();remoteCall=call;call.answer();
  call.on('stream',s=>{$('video').srcObject=s;showVideo();$('video').play().catch(()=>{$('sound').hidden=false;});status('Watching the host’s tab.');});
  call.on('close',()=>{if(remoteCall===call){$('video').srcObject=null;$('empty').hidden=false;status('Waiting for the host to share.');}});
  call.on('error',()=>status('Video connection failed. Leave and rejoin.'));
 });return true;
}
$('hostControls').hidden=guest;$('guestControls').hidden=!guest;$('role').textContent=guest?'GUEST':'WATCH ROOM';
if(guest){$('empty').querySelector('h1').textContent='Your seat is ready.';$('empty').querySelector('p').textContent='Join to watch the host’s shared tab.';if(!token){$('join').disabled=true;status('Incomplete invite. Ask the host to copy a new link.');}}
$('host').onclick=()=>{
 if(peer)return;if(!setupPeer())return;
 $('host').disabled=true;$('leave').hidden=false;status('Creating room…');
 secret=crypto.randomUUID()+crypto.randomUUID();
 peer.on('open',id=>{ready=true;$('role').textContent='HOST';const url=new URL(location.href);url.hash=new URLSearchParams({room:id,key:secret}).toString();$('invite').value=url.href;$('inviteBox').hidden=false;$('share').disabled=false;status(notice());});
};
$('join').onclick=()=>{
 if(joining)return;if(!setupPeer())return;joining=true;$('join').disabled=true;$('leave').hidden=false;status('Connecting to host…');
 const timeout=setTimeout(()=>status('Still connecting. Check the host is online; your network may block peer connections.'),15000);
 peer.on('open',()=>{hostLink=peer.connect(room,{reliable:true});hostLink.on('open',()=>{clearTimeout(timeout);hostLink.send({type:'join',key:token});});hostLink.on('data',data=>{if(data?.type==='state'){status(data.sharing?'Receiving the host’s tab…':'Connected. Waiting for the host to share.');if(!data.sharing){$('video').srcObject=null;$('empty').hidden=false;}}});hostLink.on('close',()=>{clearTimeout(timeout);remoteCall?.close();$('video').srcObject=null;$('empty').hidden=false;status('Host ended the room or the connection was lost. Leave and rejoin to retry.');});hostLink.on('error',()=>status('Could not join. Leave and retry.'));});
};
$('share').onclick=async()=>{
 if(!ready||guest)return;
 if(!navigator.mediaDevices?.getDisplayMedia){status('Tab sharing needs a supported desktop browser on HTTPS.');return;}
 $('share').disabled=true;
 try{stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:30},width:{ideal:1920},height:{ideal:1080}},audio:true,preferCurrentTab:false,selfBrowserSurface:'exclude',surfaceSwitching:'include'});stream.getVideoTracks()[0].addEventListener('ended',stopShare,{once:true});$('video').muted=true;$('video').srcObject=stream;showVideo();await $('video').play().catch(()=>{});$('stop').hidden=false;broadcast();for(const e of viewers.values())attachCall(e);status(notice());}
 catch(e){$('share').disabled=!ready;status(e.name==='NotAllowedError'?'Sharing cancelled. Try again when ready.':'Could not share this tab. Try desktop Chrome or Edge.');}
};
$('stop').onclick=stopShare;
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('invite').value);status('Invite copied. Anyone with this link can join (up to four viewers).');}catch{$('invite').focus();$('invite').select();status('Copy the selected invite link.');}};
$('sound').hidden=!guest;
$('sound').onclick=async()=>{if(!$('video').srcObject){status('Wait for the host to start sharing.');return;}$('video').muted=false;try{await $('video').play();$('sound').hidden=true;}catch{status('Playback blocked by your browser. Check site permissions.');}};
$('full').onclick=()=>{$('video').requestFullscreen?.().catch(()=>status('Fullscreen is unavailable in this browser.'));};
$('leave').onclick=()=>{stream?.getTracks().forEach(t=>t.stop());peer?.destroy();location.reload();};
addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());peer?.destroy();});
