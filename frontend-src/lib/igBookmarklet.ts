// Instagram Sync bookmarklet — two modes:
//   PROFILE MODE  instagram.com/<handle>/           → last 90 days posts + up to 300 comments/post
//   POST MODE     instagram.com/p/<shortcode>/       → ALL comments on that specific post (unlimited)
//
// makeBookmarkletSrc(ormOrigin) injects the correct ORM URL at render time so the
// receiver URL and origin-check always point to whoever is running the dashboard.
export function makeBookmarkletSrc(ormOrigin: string): string {
  const receiver = ormOrigin + "/bookmarklet";
  return `(async function(){
"use strict";
var RECEIVER="${receiver}";
var ORM_ORIGIN="${ormOrigin}";
var APP_ID="936619743392459";
var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
var jitter=function(a,b){return a+Math.random()*(b-a)};
var box=document.getElementById("__orm_box");
if(!box){box=document.createElement("div");box.id="__orm_box";box.style.cssText="position:fixed;z-index:2147483647;right:16px;bottom:16px;width:360px;max-height:70vh;overflow:auto;background:#0b1020;color:#cde;font:12.5px ui-monospace,monospace;line-height:1.6;padding:12px 14px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.4)";document.body.appendChild(box)}
var log=function(t,c){var d=document.createElement("div");if(c)d.style.color=c;d.textContent=t;box.appendChild(d);box.scrollTop=box.scrollHeight};
log("ORM Instagram Sync starting…","#8ecbff");
if(location.hostname.indexOf("instagram.com")<0){log("✗ You're not on Instagram. Open instagram.com/<handle>/ (profile) or instagram.com/p/<code>/ (post) and click this bookmark THERE.","#ff8b8b");return}
var seg=location.pathname.split("/").filter(Boolean);
var headers={"X-IG-App-ID":APP_ID,"X-Requested-With":"XMLHttpRequest"};
async function igGet(url){var ctl=new AbortController(),to=setTimeout(function(){ctl.abort()},18000);try{var r=await fetch(url,{headers:headers,credentials:"include",signal:ctl.signal});if(r.status===429)throw new Error("429");if(!r.ok)throw new Error("Instagram "+r.status);return await r.json()}finally{clearTimeout(to)}}
function openReceiver(){var win=window.open(RECEIVER,"orm_receiver_"+(""+Math.floor(performance.now())));if(!win)log("Popup blocked — allow pop-ups for instagram.com and click again.","#ff8b8b");return win}
async function sendAndWait(win,payload){if(!win)return;var done=false;function onMsg(ev){if(ev.origin!==ORM_ORIGIN)return;var d=ev.data||{};if(d.source!=="orm-receiver")return;if(d.type==="ORM_READY"){try{win.postMessage(payload,ORM_ORIGIN)}catch(e){}}else if(d.type==="ORM_DONE"){done=true;window.removeEventListener("message",onMsg);if(d.ok){if(payload.type==="ORM_IG_POST_COMMENTS")log("✓ "+d.added+" new comments saved ("+d.total_stored+" total in dashboard).","#7CFC9B");else log("✓ Saved "+d.posts+" posts ("+out.reduce(function(a,pp){return a+pp.comment_count},0).toLocaleString()+" real comments, "+out.reduce(function(a,pp){return a+pp.comments.length},0)+" sampled) to dashboard.","#7CFC9B")}else log("✗ Save failed: "+(d.error||"unknown"),"#ff8b8b")}}
window.addEventListener("message",onMsg);
for(var k=0;k<15&&!done;k++){await sleep(1200);try{win.postMessage(payload,ORM_ORIGIN)}catch(e){}}}
/* ─────────────────────────────────────────────────────────────────────────────
   POST MODE — instagram.com/p/SHORTCODE/ or /reel/SHORTCODE/
   Fetches EVERY comment page for one specific post (no upper limit).
   Sends ORM_IG_POST_COMMENTS to the receiver.
───────────────────────────────────────────────────────────────────────────── */
if((seg[0]==="p"||seg[0]==="reel")&&seg[1]){
var shortcode=seg[1];
log("Post mode — fetching ALL comments for /"+seg[0]+"/"+shortcode+"/","#8ecbff");
try{
var minfo=await igGet("/api/v1/media/shortcode/"+shortcode+"/info/");
var item=minfo&&minfo.items&&minfo.items[0];
if(!item)throw new Error("Could not load post info (try logging in to instagram.com first).");
var pk=String(item.pk||(item.id||"").split("_")[0]);
var realTotal=item.comment_count||0;
log("Post has "+realTotal.toLocaleString()+" real comments. Fetching all pages (may take several minutes)…","#8ecbff");
var allComments=[],minId="",pageNum=0,retries=0,totalPages=Math.ceil(realTotal/20)||"?";
while(true){
try{
var cj=await igGet("/api/v1/media/"+pk+"/comments/?can_support_threading=true&permalink_enabled=false"+(minId?"&min_id="+encodeURIComponent(minId):""));
var cs=(cj&&cj.comments)||[];
if(!cs.length)break;
for(var ci=0;ci<cs.length;ci++){var c=cs[ci];if(c.text)allComments.push({author:(c.user&&c.user.username)||"instagram_user",text:(c.text||"").slice(0,500),published_at:c.created_at?new Date(c.created_at*1000).toISOString():null})}
retries=0;pageNum++;
minId=cj.next_min_id||"";
if(pageNum%20===0||!minId)log("Page "+pageNum+" / ~"+totalPages+" — "+allComments.length.toLocaleString()+" / "+realTotal.toLocaleString()+" comments fetched…");
if(!minId)break;
await sleep(jitter(700,1300));
}catch(pageErr){
var emsg=String(pageErr&&pageErr.message?pageErr.message:pageErr);
if(emsg.indexOf("429")>=0){
retries++;
if(retries>=4){log("Rate limited 4× — saved "+allComments.length.toLocaleString()+" / "+realTotal.toLocaleString()+" comments. Run the bookmark again on the same page to fetch more.","#ffcf6b");break}
log("Rate limited (429) — waiting 90 seconds (retry "+retries+"/4)…","#ffcf6b");
await sleep(90000);
}else{throw pageErr}
}
}
log("Done: "+allComments.length.toLocaleString()+" of "+realTotal.toLocaleString()+" comments fetched. Saving to dashboard…","#8ecbff");
var win=openReceiver();
if(win){await sendAndWait(win,{source:"orm-bookmarklet",type:"ORM_IG_POST_COMMENTS",shortcode:shortcode,platform:"instagram",total_count:realTotal,comments:allComments})}
}catch(e){log("✗ "+(e&&e.message?e.message:String(e)),"#ff8b8b");log("If 401/429, log in to instagram.com first, browse for a minute, then retry.","#ffcf6b")}
return;
}
/* ─────────────────────────────────────────────────────────────────────────────
   PROFILE MODE — instagram.com/<handle>/
   Reads the last 90 days of posts + up to 300 comments/post (sampled).
   Sends ORM_IG_DATA to the receiver.
───────────────────────────────────────────────────────────────────────────── */
var handle=seg[0]||"";
if(!handle||["explore","stories","direct","accounts","reels"].indexOf(handle)>=0){log("Open a PROFILE page (instagram.com/handle/) or a POST page (instagram.com/p/code/) then click the bookmark.","#ff8b8b");return}
log("Profile mode: @"+handle);
var DAYS=90,MAX_POSTS=300,MAX_COMMENTS=300;
var cutoff=Date.now()/1000-DAYS*86400;
try{
var info=await igGet("/api/v1/users/web_profile_info/?username="+encodeURIComponent(handle));
var user=info&&info.data&&info.data.user;
if(!user)throw new Error("Could not read profile (are you logged in?).");
var userId=user.id;
log("Followers: "+(user.edge_followed_by?user.edge_followed_by.count.toLocaleString():"?"));
var posts=[],maxId="",more=true,oldStreak=0;
while(more&&posts.length<MAX_POSTS&&oldStreak<6){
var feed=await igGet("/api/v1/feed/user/"+userId+"/?count=12"+(maxId?"&max_id="+maxId:""));
var items=feed.items||[];
if(!items.length)break;
for(var j=0;j<items.length;j++){var it=items[j];var taken=it.taken_at||0;if(taken&&taken<cutoff){oldStreak++;continue}oldStreak=0;var pp2={pk:String(it.pk||(it.id||"").split("_")[0]),code:it.code,taken:taken,caption:(it.caption&&it.caption.text)||"",likes:it.like_count||0,comment_count:it.comment_count||0};posts.push(pp2);if(posts.length>=MAX_POSTS)break}
maxId=feed.next_max_id||"";more=!!feed.more_available&&!!maxId;
log("Collected "+posts.length+" posts…");
await sleep(jitter(500,1100))}
if(!posts.length){log("No posts found in the last "+DAYS+" days.","#ffcf6b");return}
log("Found "+posts.length+" posts. Sampling up to "+MAX_COMMENTS+" comments each…","#8ecbff");
var out=[];
for(var i=0;i<posts.length;i++){var pp=posts[i];var comments=[],minId2="",cp=0;
try{while(comments.length<MAX_COMMENTS&&cp<15){var cj2=await igGet("/api/v1/media/"+pp.pk+"/comments/?can_support_threading=true&permalink_enabled=false"+(minId2?"&min_id="+encodeURIComponent(minId2):""));var cs2=(cj2&&cj2.comments)||[];if(!cs2.length)break;for(var ci2=0;ci2<cs2.length;ci2++){var c2=cs2[ci2];if(c2.text)comments.push({author:(c2.user&&c2.user.username)||"instagram_user",text:(c2.text||"").slice(0,300),published_at:c2.created_at?new Date(c2.created_at*1000).toISOString():null})}minId2=cj2.next_min_id||"";if(!minId2)break;cp++;await sleep(jitter(400,900))}}catch(e2){}
out.push({external_id:pp.code,url:"https://www.instagram.com/p/"+pp.code+"/",caption:pp.caption,published_at:pp.taken?new Date(pp.taken*1000).toISOString():null,comment_count:pp.comment_count,likes:pp.likes,comments:comments.slice(0,MAX_COMMENTS)});
if((i+1)%5===0||i===posts.length-1)log("  "+(i+1)+"/"+posts.length+" posts ("+comments.length+" comments last post)…");
await sleep(jitter(350,900))}
log("Opening dashboard to save "+out.length+" posts…","#8ecbff");
var win2=openReceiver();
if(win2){await sendAndWait(win2,{source:"orm-bookmarklet",type:"ORM_IG_DATA",handle:handle,platform:"instagram",posts:out})}
}catch(e){log("✗ "+(e&&e.message?e.message:String(e)),"#ff8b8b");log("If 401/429, browse Instagram normally for a minute and retry.","#ffcf6b")}
})();`;
}

export const BOOKMARKLET_SRC = "";
