/*
TODO:
	* use vidstack for audio as well (unification), once compat has been checked
	* use modules instead of CDN paths? https://stackoverflow.com/questions/79376957/importing-vidstack-as-module-from-cdn
*/


import { VidstackPlayer, VidstackPlayerLayout } from 'https://cdn.vidstack.io/player.core';

if (!('fragmentDirective' in document)) { import('https://unpkg.com/text-fragments-polyfill'); }

class Timestamp{
	time = -1;
	element = undefined;
	constructor(time,element){ this.time=time; this.element=element; }
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
		ret.player = await ret.makePlayer(div);
		console.warn(ret.player);
		ret.processTimestamps();
		return ret;
	}
	static getSyncmediaTag(e){
		let sp=Array.from(e.classList).filter(function(c){return c.startsWith('syncmedia-player-no-');});
		console.assert(sp.length==1);
		return sp[0];
	}

	static getMediaType(uri){
		// console.log(`getMediaType(${uri})`);
		if(uri.startsWith("https://youtube.com/") || uri.startsWith("https://www.youtube.com/") || uri.startsWith("https://youtu.be/")) return "youtube";
		else return "audio";
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
			this.timestamps.push(new Timestamp(parseInt(match[1]),a));
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
				pl.onplay = function() {
					/* TODO: pause all other players */
					div.style.display="block"; div.style.position="sticky"; div.classList.add("sticky-top"); div.zIndex=1000;
				};
				pl.onpause = function() { div.style.display="none"; div.style.position="relative";  div.classList.remove("sticky-top"); div.zIndex=0; };
				return pl;
			}
			case "youtube": {
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
			case "youtube":
				pl.currentTime=tNew;
				pl.paused=false;
				break;
			default:
				console.error("mediaType not one of 'audio','youtube'?",this.mediaType);
		};
		Emphasis.instance.emphasize();
		return false; // don't follow the HREF
	};
	getCurrentTime(){
		switch(this.mediaType){
			case "audio": return (this.player.paused ? -1 : this.player.currentTime);
			case "youtube": return (this.player.paused ? -1 : this.player.currentTime);
		}
	}
	pause(){
		switch(this.mediaType){
			case "audio": if(!this.player.paused) this.player.pause(); return;
			case "youtube": this.player.pause(); return;
		}
	}
};



class Emphasis{
	static instance = undefined;
	emph = undefined;
	dt = 1000; // ms
	interval = undefined;
	constructor(){
		this.emph = this.makeEmphElement();
		this.interval = setInterval(()=>this.emphasize(), this.dt);
	};
	getActiveTimestampsRange(){
		// console.warn(SyncMedia.instances);
		let ssm = SyncMedia.instances.filter(function(sm){ return sm.getCurrentTime()>=0; });
		console.assert(ssm.length <= 1);
		// console.log('Active players:',ssm)
		if(ssm.length==0) return [undefined,undefined];
		let sm = ssm[0];
		let time = sm.getCurrentTime();
		// console.log('Current time:',time);
		for(var i=0; i < sm.timestamps.length-1; i++){
			// console.log(`${sm.timestamps[i].time} <= ${time} < ${sm.timestamps[i+1].time}`);
			if(sm.timestamps[i].time<=time && sm.timestamps[i+1].time>time){
				// console.log('HERE!')
				return [sm.timestamps[i].element,sm.timestamps[i+1].element];
			}
		}
		return [undefined,undefined];
	}
	emphasize(){
		const [e0,e1]=this.getActiveTimestampsRange();
		if(e0 === undefined) return;
		// console.log(e0,e1);
		let parent = e0.closest("p,div"); // <p> or <div> element to get widths
		let art = this.emph.parentElement;
		let {x:xa} = art.getBoundingClientRect(); // article as "main" element
		let {width:w, x} = parent.getBoundingClientRect(); // x,w from <p>
		let {height:h0, x:x0} = e0.getBoundingClientRect(); // x0,w0,h0 from 1st time stamp
		let {height:h1, x:x1} = e1.getBoundingClientRect(); // x1,w1,h1 from 2nd time stamp
		let t0 = e0.offsetTop; // top of 1st time stamp
		let t1 = e1.offsetTop; // top of 2nd time stamp
		let h = t1 + h1 - t0; // total emph height
		let l = x - xa; // emph left
		let hm = h - h0 - h1; // middle height
		let l0 = x0 - x; // left of 1st time stamp
		let wb = x1 /* + w1 */ - x; // width of bottom emph
		//// use the values to style the emphasis
		const [emphTop,emphMid,emphBot]=this.emph.children;
		// let {emph,emphTop,emphMid,emphBot} = this;
		this.emph.style.width = `${w}px`;
		this.emph.style.height = `${h}px`;
		this.emph.style.top = `${t0}px`;
		this.emph.style.left = `${l}px`;
		emphTop.style.height = `${h0}px`;
		emphTop.style.left = `${l0}px`;
		emphMid.style.height = `${hm}px`;
		emphMid.style.top = `${h0}px`;
		emphBot.style.height = `${h1}px`;
		emphBot.style.bottom = 0;
		emphBot.style.width = `${wb}px`;
	}
	makeEmphElement(){
		// find main <article> element for dimensions
		let arts = document.getElementsByTagName("article");
		console.assert(arts.length==1);
		let art = arts[0];
		art.style.position = "relative"
		// parent element for emphasis
		let emph = this.emph = document.createElement("div");
		emph.style.position = "absolute";
		emph.style.zIndex = -9999;
		emph.style.overflow = "hidden";
		// top, middle, bottom
		for (let i of [0,1,2]){
			let e = document.createElement("div");
			e.style.position = "absolute";
			e.style.backgroundColor = "rgba(0,127,0,0.4)";
			e.style.width = "100%";
			emph.appendChild(e);
		}
		art.appendChild(emph);
		return emph;
	}
};



class ToggleTimestamps {
	constructor(){
		let button=document.createElement('button');
		button.classList.add('btn','btn-sm','navbar-btn','syncmedia-hide-button');
		button.innerHTML='<i class="fa-solid fa-lg fa-stopwatch"/>';
		console.info(button.innerHTML);
		let buttons=document.getElementsByClassName('article-header-buttons')[0];
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
	for(let div of Array.from(document.querySelectorAll("div.syncmedia-player"))){
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

