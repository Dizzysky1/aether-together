'use strict';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.hash.slice(1));
const room=params.get('room'), token=params.get('key');
const guest=Boolean(room);
let peer,stream,hostLink,remoteCall,secret,ready=false,joining=false;
// Join lifecycle v2: keep deadlines active until the host acknowledges.
let joinDeadline, helloInterval, mediaDeadline, attempt=0;
function clearJoinTimers(){clearTimeout(joinDeadline);clearInterval(helloInterval);clearTimeout(mediaDeadline);}
function failJoin(message){
 attempt++;clearJoinTimers();joining=false;
 const old=peer;peer=null;remoteCall=null;hostLink=null;old?.destroy();
 $('video').srcObject=null;$('empty').hidden=false;
 $('join').disabled=false;$('join').textContent='Retry joining';status(message);
}
function expectMedia(){
 clearTimeout(mediaDeadline);
 mediaDeadline=setTimeout(()=>failJoin('Connected to the host, but video could not connect. Retry joining; if it repeats, try another network.'),25000);
}
const viewers=new Map();
const status=text=>{$('status').textContent=text;};
const showVideo=()=>{$('empty').hidden=true;};
const count=()=>{$('count').textContent=viewers.size ? `${viewers.size} watching` : '';};
function notice(){return stream ? (stream.getAudioTracks().length?'Sharing your tab. Control playback in Aether.':'Sharing without audio. Stop and share again with tab audio enabled.') : 'Room ready. Share your Aether tab.';}
function sendState(conn){if(conn.open)conn.send({type:'state',sharing:!!stream});}
function broadcast(){for(const {conn} of viewers.values())sendState(conn);}
function attachCall(entry){if(!stream||!entry.conn.open)return;entry.call?.close();entry.call=peer.call(entry.conn.peer,stream,{metadata:{key:secret}});entry.call?.on('error',()=>status('A viewer’s video connection failed. They can leave and rejoin.'));}
function stopShare(){const old=stream;stream=null;old?.getTracks().forEach(t=>t.stop());for(const e of viewers.values()){e.call?.close();e.call=null;}$('video').srcObject=null;$('empty').hidden=false;$('stop').hidden=true;$('share').disabled=!ready;broadcast();status('Sharing stopped. The room is still open.');}
function inspectConnection(conn){
 const pc=conn.peerConnection;
 if(!pc)return;
 const report=()=>console.info('Watch connection',JSON.stringify({role:guest?'guest':'host',signaling:pc.signalingState,ice:pc.iceConnectionState,gathering:pc.iceGatheringState,connection:pc.connectionState}));
 report();
 pc.addEventListener('iceconnectionstatechange',report);
 pc.addEventListener('icegatheringstatechange',report);
 pc.addEventListener('signalingstatechange',report);
 pc.addEventListener('icecandidate',e=>{if(e.candidate)console.info('Watch candidate',e.candidate.type,e.candidate.protocol);});
 pc.addEventListener('icecandidateerror',e=>console.warn('Watch ICE server error',e.errorCode));
}
function setupPeer(){
 if(typeof Peer==='undefined'){status('Connection library could not load. Reload to retry.');return false;}
 peer=new Peer();
 peer.on('error',err=>{(guest?failJoin:status)(err.type==='peer-unavailable'?'Host not found. Ask for a fresh invite.':`Connection failed (${err.type||'network'}). Leave and retry; some networks block direct video connections.`);});
 peer.on('disconnected',()=>{
  if(guest){failJoin('Room service disconnected. Retry joining.');return;}
  ready=false;$('share').disabled=true;status('Reconnecting the room service…');
  if(peer&&!peer.destroyed)peer.reconnect();
 });
 peer.on('connection',conn=>{
  if(guest){conn.close();return;}
  inspectConnection(conn);
  let authenticated=false;
  const timer=setTimeout(()=>{if(!authenticated)conn.close();},30000);
  conn.on('data',data=>{
   if(authenticated){if(data?.type==='join')sendState(conn);return;}
   if(!data||data.type!=='join')return;
   if(data.key!==secret||viewers.size>=4){
    if(conn.open)conn.send({type:'rejected',reason:data.key!==secret?'This invite has expired. Ask for a new link.':'This room is full (four viewers).'});
    setTimeout(()=>conn.close(),500);return;
   }
   authenticated=true;clearTimeout(timer);const entry={conn,call:null};viewers.set(conn.peer,entry);sendState(conn);attachCall(entry);count();
  });
  const cleanup=()=>{clearTimeout(timer);const entry=viewers.get(conn.peer);if(entry?.conn===conn){entry.call?.close();viewers.delete(conn.peer);count();}};
  conn.on('close',cleanup);conn.on('error',cleanup);
  conn.on('open',()=>{if(authenticated){sendState(conn);attachCall(viewers.get(conn.peer));}});
 });
 peer.on('call',call=>{
  if(!guest||call.peer!==room||call.metadata?.key!==token){call.close();return;}
  const previous=remoteCall;remoteCall=call;previous?.close();
  call.on('stream',s=>{clearTimeout(mediaDeadline);$('video').muted=true;$('sound').hidden=false;$('video').srcObject=s;showVideo();$('video').play().catch(()=>{$('sound').hidden=false;});status('Watching the host’s tab.');});
  call.on('close',()=>{if(remoteCall===call){$('video').srcObject=null;$('empty').hidden=false;status('Waiting for the host to share.');}});
  call.on('error',()=>failJoin('Video connection failed. Retry joining.'));
  call.answer();
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
 if(joining)return;
 clearJoinTimers();const current=++attempt;
 joining=true;$('join').disabled=true;$('join').textContent='Joining…';$('leave').hidden=false;
 status('Connecting to room service…');
 if(!setupPeer()){joining=false;$('join').disabled=false;$('join').textContent='Retry joining';return;}
 joinDeadline=setTimeout(()=>{if(current===attempt)failJoin('Host did not confirm entry. Retry joining, or ask the host to refresh and send a new invite.');},30000);
 peer.on('open',()=>{
  if(current!==attempt||hostLink)return;
  status('Connecting to host…');
  const conn=hostLink=peer.connect(room,{reliable:true,serialization:'json'});
  inspectConnection(conn);
  const hello=()=>{if(current===attempt&&conn.open)conn.send({type:'join',key:token});};
  conn.on('open',()=>{if(current!==attempt)return;status('Waiting for host confirmation…');hello();helloInterval=setInterval(hello,1000);});
  conn.on('data',data=>{
   if(current!==attempt)return;
   if(data?.type==='rejected'){failJoin(data.reason);return;}
   if(data?.type!=='state')return;
   clearTimeout(joinDeadline);clearInterval(helloInterval);
   $('join').textContent='Joined';
   if(data.sharing){
    if(!$('video').srcObject){status('Connected. Receiving the host’s tab…');expectMedia();}
   }else{
    clearTimeout(mediaDeadline);$('video').srcObject=null;$('empty').hidden=false;
    $('empty').querySelector('h1').textContent='You’re in.';
    $('empty').querySelector('p').textContent='Waiting for the host to share their Aether tab.';
    status('Connected. Waiting for the host to share.');
   }
  });
  conn.on('close',()=>{if(current===attempt)failJoin('Connection to host lost. Retry joining or ask for a new invite.');});
  conn.on('error',()=>{if(current===attempt)failJoin('Could not connect to host. Retry joining.');});
 });
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
