/*
TODO:
	* use the custom 'syncmedia' class on sync points instead of regexp #t=...
	* optionally attach player to something else than header-article-items__start (is book-theme specific and internal)
	* support other players (like oembed for soundcloud or mixcloud)
	* use other JS player for media since MP3 seeking is otherwise often off (e.g. wavesurfer.xyz)
		- (with wavesurfer.xyz, it would be cool to show sections as points in the player)
*/


// polyfill for text fragment links (for browsers which need it)
if (!('fragmentDirective' in document)) { import('https://unpkg.com/text-fragments-polyfill'); }

document.addEventListener("DOMContentLoaded", function(){
	let anchors = document.querySelectorAll("a.reference.external")
	anchors = Array.from(anchors)
	const audioPat = new RegExp('#t=[0-9:]+$');
	let n=0;
	// anchors = anchors.filter(anchor => pat.test(anchor)); // !anchor.href?.includes("mailto:"))
	for (let anchor of anchors) {
		if(!anchor.href?.match(/#t=[0-9:]+$/)){
			console.debug('Non-audio hyperlink:',anchor.href);
			continue;
		}
		anchor.addEventListener("click", myOpenAudioInPlayer);
		n++;
	}
	// no timestamps on this page, nothing to do
	if(n==0) return;
	// toggle timestamps icon
	addToggleTimestampsIcon();
	// do the emphasis
	try {
		new Emphasizer()
	} catch(error) {
		console.warn(error);
	}
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

function addToggleTimestampsIcon(){
	let button=document.createElement('button');
	button.classList.add('btn','btn-sm','navbar-btn','syncmedia-hide-button');
	button.innerHTML='<i class="fa-solid fa-lg fa-stopwatch"/>';
	console.warn(button.innerHTML);
	let buttons=document.getElementsByClassName('article-header-buttons')[0];
	buttons.insertBefore(button,buttons.firstChild);
	button.addEventListener("click",toggleTimestamps);
}

function toggleTimestamps(){
	let hide='syncmedia-hide-timestamps';
	if(document.body.classList.contains(hide)){ console.warn("showing timestamps",document.body.classList); document.body.classList.remove(hide); }
	else{ console.warn("hiding timestamps",document.body.classList); document.body.classList.add(hide); }
}

function syncmediaIdTime(href){
	const url=new URL(href);
	let time=parseInt(url.hash.match('#t=([0-9]+)$')[1]);
	let id=url.hostname+url.pathname;
	return [id,time];
}


function syncmediaInside(e){
	if(!e) return null;
	let ss=e.querySelectorAll(":scope .syncmedia");
	if(ss.length==0) return null;
	return ss[0];
}

function myOpenAudioInPlayer(ev){
   console.log('myOpenAudioInPlayer',ev.srcElement);
   ev.preventDefault();
   var player=document.getElementById("my_audio_player");
   if(player==null){
      console.log('Creating player.')
      player=document.createElement('audio');
      player.controls=true;
      player.autoplay=false;
      player.id='my_audio_player';
      player.style='width: 100%;';
      var source= document.createElement('source');
      source.type='audio/mp3';
      player.appendChild(source);
      document.getElementsByClassName('header-article-items__start')[0].appendChild(player);
   } else {
      // console.debug('Using existing player.');
   }
   player.children[0].src=ev.srcElement.href;
   player.load(); // if src changed, needs to be reloaded (otherwise previous href will be played)
   // setting the href with #t=... does not set time in itself, do it explicitly here:
   let tt=ev.srcElement.href.split('#')[1].split('=')[1].split(',');
   // console.warn(ev.srcElement.href,tt);
   // let t0=Number(tt[0]);
   // something going on here: currentTime takes time to be set, so stream may not be seeked completely when play() is called?
   // is it necessary to pause()?
   player.pause();
   player.currentTime=Number(tt[0]);
   player.duration=10;
   // console.debug('Moving to time ',t,player.currentTime);
   player.play();
   return false; // don't follow the HREF
};

// auxiliary class
class Emphasizer {
	// interval in ms to update the emphasis
	dt = 2000;
	timeout = undefined;
	player = undefined;
	constructor() {
		// find main <article> element for dimensions
		let articles = document.getElementsByTagName("article");
		if (articles.length !== 1) throw new Error("too many <article> elements for emphasizing");
		let article = this.article = articles[0];
		article.style.position = "relative"
		//
		// actual emphasis
		let emph = this.emph = document.createElement("div");
		emph.style.position = "absolute";
		emph.style.zIndex = -9999;
		emph.style.overflow = "hidden";
		let emphTop = this.emphTop = document.createElement("div");
		let emphMid = this.emphMid = document.createElement("div");
		let emphBot = this.emphBot = document.createElement("div");
		for (let e of [emphTop,emphMid,emphBot]) {
			e.style.position = "absolute";
			e.style.backgroundColor = "rgba(0,127,0,0.4)";
			e.style.width = "100%";
			emph.appendChild(e);
		}
		article.appendChild(emph);
		//
		// find time stamps
		let timeStampsElems = Array.from(article.querySelectorAll("a.reference.external"));
		timeStampsElems = timeStampsElems.filter(elem => {
			//if (elem.href.includes("mailto:")) return false;
			// some other filter conditions? maybe check that `href` match diven regex?
			if (elem.href.match('#t=[0-9]+$')){ return true; }
			// console.error('Href not matching:',elem.href);
			return false;
		})
		timeStampsElems.forEach(elem => elem.addEventListener("click", () => this.emphasize()))
		// store timestamps together with id and time
		let timeStamps = this.timeStamps = timeStampsElems.map(element => {
			const url=new URL(element.href);
			let time=parseInt(url.hash.match('#t=([0-9]+)$')[1]);
			let id=url.hostname+url.pathname;
			return {element,id,time};
		});
		//
		// start emphasis
		this.emphasize();
	}
	emphasize() {
		// clear timeout in case it is called in advance
		clearTimeout(this.timeout);
		// get player
		this._getPlayer()
		// if present, do actual emphasis
		if (this.player) this._emphasize();
		// re-call itself
		this.timeout = setTimeout(() => this.emphasize(), this.dt);
	}
	_emphasize() {
		// data from player
		let time = this.player.currentTime;
		let src = this.player.children[0].src;
		const url=new URL(src);
		let id=url.hostname+url.pathname;
		//
		// find timestamp next to current time
		let timeStamp1;
		for (timeStamp1 of this.timeStamps) {
			if (timeStamp1.id !== id) { // only consider same id
				continue;
			}
			if (time < timeStamp1.time) {
				break;
			}
		}
		let index = this.timeStamps.indexOf(timeStamp1);
		let timeStamp0 = this.timeStamps[index-1];
		// timeStamp0 and timeStamp1 are stamps just before and just after currently playing time
		//
		// get relevant elements
		let e0 = timeStamp0.element;
		let e1 = timeStamp1.element;
		let parent = e0.closest("p,div"); // <p> or <div> element to get widths
		let {x:xa} = this.article.getBoundingClientRect(); // article as "main" element
		let {width:w, x} = parent.getBoundingClientRect(); // x,w from <p>
		let {width:w0, height:h0, x:x0} = e0.getBoundingClientRect(); // x0,w0,h0 from 1st time stamp
		let {width:w1, height:h1, x:x1} = e1.getBoundingClientRect(); // x1,w1,h1 from 2nd time stamp
		let t0 = e0.offsetTop; // top of 1st time stamp
		let t1 = e1.offsetTop; // top of 2nd time stamp
		let h = t1 + h1 - t0; // total emph height
		let l = x - xa; // emph left
		let hm = h - h0 - h1; // middle height
		let l0 = x0 - x; // left of 1st time stamp
		let wb = x1 /* + w1 */ - x; // width of bottom emph
		//
		//// use the values to style the emphasis
		let {emph,emphTop,emphMid,emphBot} = this;
		emph.style.width = `${w}px`;
		emph.style.height = `${h}px`;
		emph.style.top = `${t0}px`;
		emph.style.left = `${l}px`;
		emphTop.style.height = `${h0}px`;
		emphTop.style.left = `${l0}px`;
		emphMid.style.height = `${hm}px`;
		emphMid.style.top = `${h0}px`;
		emphBot.style.height = `${h1}px`;
		emphBot.style.bottom = 0;
		emphBot.style.width = `${wb}px`;
	}
	_getPlayer() {
		let player = document.getElementById("my_audio_player");
		if (!player) return;
		this.player = player
	}
}
