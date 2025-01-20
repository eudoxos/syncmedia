/*
TODO:
	* use other JS player for media since MP3 seeking is otherwise often off (e.g. wavesurfer.xyz)
		- (with wavesurfer.xyz, it would be cool to show sections as points in the player)
	* support youtube videos
*/

// polyfill for text fragment links (for browsers which need it)
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

	constructor(div){
		this.div = div;
		this.mediaType = SyncMedia.getMediaType(div.getAttribute('data-uri'));
		this.tag = SyncMedia.getSyncmediaTag(div);
		this.player = this.makePlayer(div);
		this.processTimestamps();
	}
	static getSyncmediaTag(e){
		let sp=Array.from(e.classList).filter(function(c){return c.startsWith('syncmedia-player-no-');});
		console.assert(sp.length==1);
		return sp[0];
	}

	static getMediaType(uri){
		if(uri.startsWith("https://youtube.com/") || uri.startsWith("https://youtu.be/")) return "youtube";
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
			a.addEventListener("click", (ev) => this.timestampClicked(ev));
			this.timestamps.push(new Timestamp(parseInt(match[1]),a));
		}
	}

	makePlayer(div){
		/* TODO: hide player only when :show: was not given in the source (must be passed via an extra class) */
		div.style.display="none";
		switch(this.mediaType){
			case "audio":
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
			case "youtube":
				console.error("youtube player not yet implemented");
				return undefined;
			default:
				return undefined;
		};
	}
	timestampClicked(ev){
		// console.log('timestampClicked',ev.srcElement);
		// console.log(this.mediaType);
		// console.log(this.player);
		// console.log(this.tag);
		ev.preventDefault();
		let pl = this.player;
		switch(this.mediaType){
			case "audio":
				// setting the href with #t=... does not set time in itself, do it explicitly here:
				let tt=ev.srcElement.href.split('#')[1].split('=')[1].split(',');
				// console.warn(ev.srcElement.href,tt);
				pl.pause();
				pl.currentTime=Number(tt[0]);
				// pl.duration=10;
				console.debug('Seeking to:',tt[0],pl.currentTime);
				pl.play();
				// Emphasis.instance.emphasize();
				break;
			case "youtube":
				console.error("youtube not yet implemented.");
				break;
			default:
				console.error("mediaType not one of 'audio','youtube'?",this.mediaType);
		};
		return false; // don't follow the HREF
	};
	currentTime(){
		switch(this.mediaType){
			case "audio": return (this.player.paused ? -1 : this.player.currentTime);
			case "youtube": console.error("youtube not yet implemented."); return -1;
		}
	}
};



class Emphasis{
	static instance = undefined;
	emph = undefined;
	dt = 2000; // ms
	constructor(){
		this.emph = this.makeEmphElement();
		this.interval = setInterval(()=>this.emphasize(), this.timeout);
	};
	getActiveTimestampsRange(){
		let ssm = SyncMedia.instances.filter(function(sm){ return sm.currentTime()>=0; });
		console.assert(ssm.length <= 1);
		// console.log('Active players:',ssm)
		if(ssm.length==0) return [undefined,undefined];
		let sm = ssm[0];
		let time = sm.currentTime();
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


document.addEventListener("DOMContentLoaded", function(){
	// toggle timestamps icon
	new ToggleTimestamps();
	/* construct player instances in <div class="syncmedia-player"> */
	for(let div of Array.from(document.querySelectorAll("div.syncmedia-player"))){
		SyncMedia.instances.push(new SyncMedia(div));
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
