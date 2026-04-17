import { VidstackPlayer, VidstackPlayerLayout } from 'https://cdn.vidstack.io/player.core';

/* polyfill for fragment links */
/*
// does not work well (hangs?) plus ff ESR will support it soon natively (others do already)
if (!('fragmentDirective' in document)) { import('https://cdn.jsdelivr.net/npm/text-fragments-polyfill@6.3.0/dist/text-fragments.min.js'); }
*/

class Timestamp{
	time = -1;
	element = undefined;
   spans = [];
	constructor(time,element,spans){ this.time=time; this.element=element; this.spans=spans; }
}

function nextNode(n){
   /* don't descend into
      - span: would return the plain text element inside;
      - headings (have spans inside, but we don't want to highlight those)
   */
   const noDescend=new Set(['SPAN','H1','H2','H3','H4','H5','H6']);
   if(n.firstChild && !(n.nodeType===Node.ELEMENT_NODE && noDescend.has(n.tagName))) { return n.firstChild; }
   while(n){
      if(n.nextSibling) return n.nextSibling;
      n=n.parentNode;
   };
   return null;
}

class SyncMedia {
	/* class for a single syncmedia (media URL) */
	div = undefined;
	player = undefined;
	mediaType = undefined;
	tag = undefined;
	timestamps = new Array();

	static instances=Array();

	constructor(){}

	static async make(div){
		let ret = new SyncMedia();
		ret.div = div;
		ret.mediaType = SyncMedia.getMediaType(div.getAttribute('data-uri'));
		ret.tag = SyncMedia.getSyncmediaTag(div);
		console.log('Making new player for ',ret.mediaType,ret.tag)
		ret.player = await ret.makePlayer(div);
		// console.warn(ret.player);
		ret.processTimestamps();
		return ret;
	}
	static getSyncmediaTag(e){
		let sp=Array.from(e.classList).filter(function(c){return c.startsWith('syncmedia-player-no-');});
		console.assert(sp.length==1);
		return sp[0];
	}

	static getMediaType(uri){
		//const url=new URL(uri); // this fails with "../dir/file.opus" (invalid URL)
		//const p=url.pathname;
		const p=uri.split('#')[0].split('?')[0];
		if(p.endsWith('.mp3') || p.endsWith('.m4a') || p.endsWith('.opus') || p.endsWith('.webm')) return 'audio';
		return 'vidstack';
		// console.log(`getMediaType(${uri})`);
		// if(uri.startsWith("https://youtube.com/") || uri.startsWith("https://www.youtube.com/") || uri.startsWith("https://youtu.be/")) return "vidstack";
		// if(uri.startsWith("https://player.vimeo.com/")) return "vimeo";
		// else return "audio";
	}

	processTimestamps(){
		/* arm timestamp hyperlinks */
		for(let a of Array.from(document.querySelectorAll(`a.reference.external.syncmedia.${this.tag}`))){
			const url=new URL(a.href);
			let match=url.hash.match('#t=([0-9]+)$')
			if(!match){
				console.debug('Non-audio tagged hyperlink?',a.href);
				continue;
			}
			console.assert(SyncMedia.getMediaType(a.href)==this.mediaType);
			/* arm the timestamp */
			a.addEventListener("click", async(ev) => this.timestampClicked(ev));
         let spans=[];
         const container=document.getElementsByTagName('article')[0]
         /* find all spans to be highlighted for this timestamp */
         if(true){
            let node=nextNode(a);
            while(node=nextNode(node)){
               // outside of the main article, don't go any further
               if(container && !container.contains(node)) break;
               if(node.nodeType===Node.TEXT_NODE){
                  // convert plain text to span
                  if(node.nodeValue.trim()=='') continue;
                  let span=document.createElement("span");
                  span.textContent=node.nodeValue;
                  node.replaceWith(span);
                  node=span;
               }
               if(node.nodeType==Node.ELEMENT_NODE){
                  // at the next sync point, or next syncmedia player
                  if(node.classList.contains('syncmedia-player') || node.classList.contains('syncmedia')) break;
                  // skip anything which is not <span>
                  if(node.tagName!='SPAN') continue;
               } else continue;
               console.assert(node.nodeType===Node.ELEMENT_NODE);
               // console.log(node);
               node.classList.add(`syncmedia-span-${this.timestamps.length%2}`);
               spans.push(node);
            }
         };
			this.timestamps.push(new Timestamp(parseInt(match[1]),a,spans));
		}
	}

	async makePlayer(div){
		/* TODO: hide player only when :show: was not given in the source (must be passed via an extra class) */
		// div.style.display="none";
		console.log(`Creating player of type ${this.mediaType}.`);
		switch(this.mediaType){
			case "audio": {
				let pl=document.createElement('audio');
				pl.controls=true;
				pl.autoplay=false;
				pl.style='width: 100%;';
				var source=document.createElement('source');
				source.type='audio/mp3'; // TODO: adjust by URI
				pl.appendChild(source);
				div.appendChild(pl);
				pl.children[0].src=div.getAttribute("data-uri");
				pl.load(); // if src changed, needs to be reloaded (otherwise previous href will be played)
				pl.currentTime=Number.parseInt(div.getAttribute("data-offset")??"0")??0;
				pl.onplay = function() {
					/* pause all other players */
					for(let sm of SyncMedia.instances){ if(sm.player!=this) sm.pause(); }
					if(div.getAttribute("data-show")===null) div.style.display="block";
					div.classList.add("sticky-top"); div.classList.add("sticky-bottom"); div.zIndex=2000;
				};
				pl.onpause = function() {
					if(div.getAttribute("data-show")===null) div.style.display="none";
					div.classList.remove("sticky-top"); div.classList.remove("sticky-bottom"); div.zIndex=0;
				};
				return pl;
			}
			case "vidstack": {
				this.div.setAttribute("id",this.tag);
				// let pl=await VidstackPlayer.create({target:this.div,src:div.getAttribute('data-uri'),layout: new VidstackPlayerLayout({})});
				let pl=await VidstackPlayer.create({target:this.div,src:div.getAttribute('data-uri'),layout: new VidstackPlayerLayout({})});
				// avoid automatic fullscreen on mobile: https://github.com/vidstack/player/issues/1504
				// does not work with Fennec (android) anyway...
				pl.setAttribute('playsinline','');
				pl.setAttribute('webkit-playsinline','');
				div.style.display="block"; div.style.position="sticky"; div.classList.add("sticky-top"); div.zIndex=2000;
				return pl;
			}
			default:
				console.error('Undefined mediaType (should be one of: audio, vidstack)',this.mediaType);
				return undefined;
		};
	}
	async timestampClicked(ev){
		ev.preventDefault();
		// setting the href with #t=... does not set time in itself, do it explicitly here:
		let tt=ev.srcElement.href.split('#')[1].split('=')[1].split(',');
		let tNew=Number(tt[0]);

		let pl = this.player;
		switch(this.mediaType){
			case "audio":
				// console.warn(ev.srcElement.href,tt);
				pl.pause();
				// pause all other player as well
				for(let sm of SyncMedia.instances) sm.pause();
				pl.currentTime=tNew;
				console.debug('Seeking to:',tNew,pl.currentTime);
				pl.play();
				break;
			case "vidstack":
				pl.currentTime=tNew;
				pl.paused=false;
				break;
			default:
				console.error("mediaType not one of 'audio','vidstack'?",this.mediaType);
		};
		Emphasis.instance.emphasize();
		return false; // don't follow the HREF
	};
	getCurrentTime(){
		switch(this.mediaType){
			case "audio": return (this.player.paused ? -1 : this.player.currentTime);
			case "vidstack": return (this.player.paused ? -1 : this.player.currentTime);
		}
	}
	pause(){
		switch(this.mediaType){
			case "audio": if(!this.player.paused) this.player.pause(); return;
			case "vidstack": this.player.pause(); return;
		}
	}
};



class Emphasis{
	static instance = undefined;
	dt = 1000; // ms
	interval = undefined;
   spansPlaying = [];
	constructor(){
		this.interval = setInterval(()=>this.emphasize(), this.dt);
	};
	getActiveTimestamp(){
		// console.warn(SyncMedia.instances);
		let ssm = SyncMedia.instances.filter(function(sm){ return sm.getCurrentTime()>=0; });
		console.assert(ssm.length <= 1);
		// console.log('Active players:',ssm)
		if(ssm.length==0) return undefined;
		let sm = ssm[0];
		let time = sm.getCurrentTime();
		// console.log('Current time:',time);
      // FIXME: sm.timestamps are sorted, use better search
		for(var i=0; i < sm.timestamps.length-1; i++){
			// console.log(`${sm.timestamps[i].time} <= ${time} < ${sm.timestamps[i+1].time}`);
			if(sm.timestamps[i].time<=time && sm.timestamps[i+1].time>time){
				// console.log('HERE!')
				return sm.timestamps[i];
			}
		}
		return undefined;
	}
	removeEmphasis(){
      for(const span of this.spansPlaying) span.classList.remove('syncmedia-currently-playing');
   }
	emphasize(){
		const ts=this.getActiveTimestamp();
		if(ts === undefined){ this.removeEmphasis(); return; }
		// console.log(ts);
      if(ts.spans.length>0 && ts.spans[0]==this.spansPlaying[0]) return;
      this.removeEmphasis();
      for(const span of ts.spans) span.classList.add('syncmedia-currently-playing');
      this.spansPlaying=ts.spans;
	}
};



class ToggleTimestamps {
	constructor(){
		let buttons=document.getElementsByClassName('article-header-buttons')[0];
		if(buttons===undefined){ console.warn('Not adding timestamp toggle; no element with article-header-buttons class'); return; }
		let button=document.createElement('button');
		button.classList.add('btn','btn-sm','navbar-btn','syncmedia-hide-button');
		button.innerHTML='<i class="fa-solid fa-lg fa-stopwatch"/>';
		console.info(button.innerHTML);
		buttons.insertBefore(button,buttons.firstChild);
		button.addEventListener("click",this.toggleTimestamps);
	}
	toggleTimestamps(){
		let hide='syncmedia-hide-timestamps';
		if(document.body.classList.contains(hide)){ console.warn("showing timestamps",document.body.classList); document.body.classList.remove(hide); }
		else{ console.warn("hiding timestamps",document.body.classList); document.body.classList.add(hide); }
	}
};




document.addEventListener("DOMContentLoaded", async() => {

	// toggle timestamps icon
	new ToggleTimestamps();
	/* construct player instances in <div class="syncmedia-player"> */
	console.log('Iterating over all syncmedia-player divs');
	for(let div of Array.from(document.querySelectorAll("div.syncmedia-player"))){
		console.log(div)
		SyncMedia.instances.push(await SyncMedia.make(div));
	}
	/* construct a single emphasizer instance */
	Emphasis.instance = new Emphasis();
	/*
		// for each section, find time range and add play icon next to the title
		let sections = document.querySelectorAll("section");
		for (let sect of sections){
			console.warn(sect);
			let hhx=sect.querySelectorAll(":scope > h1,h2,h3,h4,h5,h6");
			if(hhx.len==0) continue; // ??
			let hx=hhx[0];
			// if(hx.tagName=='H1') continue;
			let m0=syncmediaInside(sect)
			if(!m0) continue;
			// console.info("m0",m0);
			let s=sect;
			let sNext=null;
			while(s && !sNext){
				sNext=s.nextElementSibling;
				if(!sNext) s=s.parentElement;
			}
			console.info('→',sNext);
			let [id0,t0]=syncmediaIdTime(m0.href);
			var id1,t1;
			let m1=syncmediaInside(sNext);
			if(m1==null) t1=null;
			else{
				[id1,t1]=syncmediaIdTime(m1.href);
			if(id0!=id1) t1=null; // play till the end of audio id0
			id1=null;
			}
			console.info(id0,t0,t1);
			var a=document.createElement('a');
			a.appendChild(document.createTextNode('[PLAY]'));
			a.href='https://'+id0+'#t='+t0.toString()+(t1?','+t1.toString():'');
			a.addEventListener("click", myOpenAudioInPlayer)
			hx.appendChild(a);
		}
*/
});

