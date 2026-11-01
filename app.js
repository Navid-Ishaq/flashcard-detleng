'use strict';
const $=id=>document.getElementById(id);
const state={rows:[],name:'',deck:[],index:0,flipped:false,selected:-1,mode:'instant',studyMode:'mcq',demo:true,responses:new Map(),rangeGroups:[],selectedRangeGroup:'all',sessionMode:'learning',testSubmitted:false,lastResult:null,attempts:new Map(),groupProgress:new Map(),activeAttempt:null};
const SAMPLE=[{number:1,question:'What is the capital of France?',answer:'Paris'},{number:2,question:'What is the capital of Japan?',answer:'Tokyo'},{number:3,question:'What is the capital of Italy?',answer:'Rome'},{number:4,question:'What is the capital of Spain?',answer:'Madrid'},{number:5,question:'What is the capital of Germany?',answer:'Berlin'},{number:6,question:'What is the capital of Canada?',answer:'Ottawa'}];
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,' ').trim();
function similarity(a,b){a=norm(a);b=norm(b);if(!a||!b)return 0;if(a===b)return 1;const aa=new Set(a.split(' ')),bb=new Set(b.split(' '));let overlap=0;aa.forEach(x=>{if(bb.has(x))overlap++});const jac=overlap/(aa.size+bb.size-overlap);if(a.includes(b)||b.includes(a))return .93;return jac}
function randomInt(max){if(crypto?.getRandomValues){const x=new Uint32Array(1);crypto.getRandomValues(x);return x[0]%max}return Math.floor(Math.random()*max)}
function shuffle(arr){arr=arr.slice();for(let i=arr.length-1;i>0;i--){const j=randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
function selectDistractors(answer,pool){let possibles=shuffle(pool.filter(v=>norm(v)!==norm(answer)));const selected=[];for(const threshold of [.49,.73,.90,1.01]){for(const cand of possibles){if(selected.length===2)break;if(similarity(answer,cand)>=threshold||selected.some(x=>similarity(x,cand)>=threshold))continue;selected.push(cand)}if(selected.length===2)break}return selected}
function makeDeck(rows,bank){const answers=[...new Map(bank.filter(r=>r.answer?.trim()).map(r=>[norm(r.answer),r.answer.trim()])).values()];return rows.map(r=>{const wrong=selectDistractors(r.answer,answers);if(wrong.length<2)throw Error('Need at least 3 different answers in your source file to build three-option flashcards. Add more answer rows and try again.');const options=shuffle([r.answer,...wrong]);return {...r,options,correct:options.findIndex(x=>x===r.answer)}})}
function status(message='',error=false){$('status').textContent=message;$('status').className='status '+(error?'error':'success')}
// Attempts live in this page session, scoped to source bank, range and study mode.
function attemptKey(rows){return state.studyMode+':'+state.sessionMode+':'+rows.map(r=>r.number).sort((a,b)=>a-b).join(',')}
function retainAttempt(){
  if(!state.activeAttempt||!state.deck.length)return;
  state.attempts.set(state.activeAttempt,{deck:state.deck,responses:new Map(state.responses),index:state.index,flipped:state.flipped,testSubmitted:state.testSubmitted,lastResult:state.lastResult});
  if(state.studyMode!=='mcq')return;
  for(const card of state.deck){
    const answered=state.responses.has(card.number);
    state.groupProgress.set(state.sessionMode+':'+card.number,{answered,correct:answered&&(state.sessionMode==='learning'||state.testSubmitted)?state.responses.get(card.number)===card.correct:null,submitted:state.testSubmitted});
  }
}
function renderGroupProgress(){
  if(!state.rows.length)return;
  const current=state.deck[state.index];
  $('rangeGroupButtons').querySelectorAll('[data-range-group]').forEach(button=>{
    const key=button.dataset.rangeGroup;
    const group=key==='all'?state.rows:state.rows.slice(Number(key)*10,Number(key)*10+10);
    const entries=group.map(r=>state.groupProgress.get(state.sessionMode+':'+r.number));
    const touched=entries.some(e=>e?.answered);
    const mastered=entries.length>0&&entries.every(e=>e?.correct===true);
    const finished=entries.every(e=>e?.answered&&(state.sessionMode==='learning'||e.submitted));
    const inCurrent=state.activeAttempt&&state.studyMode==='mcq'&&current&&group.some(r=>r.number===current.number);
    const progress=mastered?'mastered':inCurrent&&!finished?'in-progress':touched?'needs-practice':'';
    for(const name of ['mastered','in-progress','needs-practice'])button.classList.toggle('group-'+name,progress===name);
    const label=key==='all'?'All questions':'Group '+(Number(key)+1);
    const detail=progress==='mastered'?'all correct':progress==='in-progress'?'in progress':progress==='needs-practice'?'needs practice or completion':'not attempted';
    button.title=label+' · '+detail;
    button.setAttribute('aria-label',label+': questions '+group[0].number+' to '+group[group.length-1].number+', '+detail);
  });
}
// Build groups from available source rows, not from assumed consecutive IDs.
function renderRangeGroups(){
  state.rangeGroups=[];
  for(let i=0;i<state.rows.length;i+=10){
    const rows=state.rows.slice(i,i+10);
    state.rangeGroups.push({start:rows[0].number,end:rows[rows.length-1].number,count:rows.length});
  }
  const all={start:state.rows[0].number,end:state.rows[state.rows.length-1].number,count:state.rows.length};
  const button=(key,label,group)=>`<button type="button" class="range-group-btn" data-range-group="${key}" aria-pressed="false" aria-label="${label==='All'?'All questions':'Group '+label}: questions ${group.start} to ${group.end}, ${group.count} question${group.count===1?'':'s'}"><strong>${label}</strong><span>${group.start}–${group.end}</span><small>${group.count} question${group.count===1?'':'s'}</small></button>`;
  $('rangeGroupButtons').innerHTML=button('all','All',all)+state.rangeGroups.map((group,i)=>button(i,String(i+1),group)).join('');
  $('rangeGroups').classList.remove('hidden');
  state.selectedRangeGroup='all';
}
function updateRangeGroupHighlight(start,end){
  const first=state.rows[0].number,last=state.rows[state.rows.length-1].number;
  const selected=state.rangeGroups[state.selectedRangeGroup];
  if(state.selectedRangeGroup==='all'&&start===first&&end===last){
    // Keep All selected even when the file fits into a single group.
  }else if(!selected||selected.start!==start||selected.end!==end){
    state.selectedRangeGroup=start===first&&end===last?'all':String(state.rangeGroups.findIndex(g=>g.start===start&&g.end===end));
  }
  $('rangeGroupButtons').querySelectorAll('[data-range-group]').forEach(button=>{
    const active=button.dataset.rangeGroup===String(state.selectedRangeGroup);
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  });
  renderGroupProgress();
}
function chooseRangeGroup(key){
  const group=key==='all'?{start:state.rows[0]?.number,end:state.rows[state.rows.length-1]?.number}:state.rangeGroups[Number(key)];
  if(!group||group.start===undefined)return;
  state.selectedRangeGroup=key;
  $('startNumber').value=group.start;$('endNumber').value=group.end;
  updateRange();
}
function updateRange(){if(!state.rows.length)return;let a=+$('startNumber').value,b=+$('endNumber').value;const chosen=state.rows.filter(r=>r.number>=a&&r.number<=b);$('rangeInfo').textContent=`${chosen.length} question(s) in this range · ${state.rows.length} rows available in this file.`;updateRangeGroupHighlight(a,b);}
function activateRows(rows,name){state.attempts.clear();state.groupProgress.clear();state.activeAttempt=null;state.rows=rows.sort((a,b)=>a.number-b.number);state.name=name;state.demo=false;const n=state.rows.map(r=>r.number);$('startNumber').disabled=false;$('endNumber').disabled=false;$('startNumber').value=Math.min(...n);$('endNumber').value=Math.max(...n);$('startNumber').max=Math.max(...n);$('endNumber').max=Math.max(...n);$('generateBtn').disabled=false;$('editBtn').disabled=false;$('fileSummary').classList.remove('hidden');$('fileSummary').innerHTML=`<strong>✓ ${escapeHTML(name)}</strong><br>${rows.length} question(s) extracted · Numbers ${Math.min(...n)}–${Math.max(...n)}`;renderRangeGroups();updateRange();status('File ready. Review your range and generate flashcards.');}
function parseDocx(buffer){return JSZip.loadAsync(buffer).then(async zip=>{const f=zip.file('word/document.xml');if(!f)throw Error('Invalid DOCX: word/document.xml was not found.');const xml=new DOMParser().parseFromString(await f.async('text'),'application/xml');if(xml.querySelector('parsererror'))throw Error('Unable to read the Word document.');const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';const descendants=(el,name)=>Array.from(el.getElementsByTagNameNS(ns,name));const plain=el=>descendants(el,'p').map(p=>{const tokens=[];const walk=node=>{if(node.nodeType===1){if(node.localName==='t')tokens.push(node.textContent);else if(node.localName==='tab')tokens.push(' ');else if(node.localName==='br')tokens.push(' ');else Array.from(node.childNodes).forEach(walk)}};walk(p);return tokens.join('').trim()}).filter(Boolean).join(' ').trim();const tables=descendants(xml,'tbl');const triples=[];for(const table of tables){for(const tr of Array.from(table.children).filter(x=>x.localName==='tr')){const tcs=Array.from(tr.children).filter(x=>x.localName==='tc');if(tcs.length>=3)triples.push([plain(tcs[0]),plain(tcs[1]),plain(tcs.slice(2).length===1?tcs[2]:tcs[2])]);}}if(!triples.length)throw Error('No 3-column Word table found. Place question number, statement and answer in three table columns.');return rowsFromTriples(triples)})}
function rowsFromTriples(triples){const rows=[],seen=new Set();for(const [rawNo,q,a] of triples){const noText=String(rawNo||'').trim(),n=Number(noText.replace(/^0+(?=\d)/,''));if(!/^\d{1,7}$/.test(noText)||!Number.isSafeInteger(n)||!q?.trim()||!a?.trim())continue;if(seen.has(n))continue;seen.add(n);rows.push({number:n,question:q.trim(),answer:a.trim()})}if(!rows.length)throw Error('Could not identify any numbered questions. First column must contain numeric question IDs.');return rows}
async function handleFile(file){if(!file)return;if(file.size>25*1024*1024){status('File exceeds 25 MB. Please use a smaller document.',true);return}let ext=file.name.toLowerCase().split('.').pop();if(ext!=='docx'){status('Only Microsoft Word .docx files are supported. Please upload a DOCX question bank.',true);$('fileInput').value='';return}status('Reading and extracting question rows…');$('generateBtn').disabled=true;try{const bytes=await file.arrayBuffer();const rows=await parseDocx(bytes);activateRows(rows,file.name)}catch(e){status(e.message||String(e),true);$('fileSummary').classList.add('hidden')}}
function createDeck(rows,sourceRows){
  try{
    retainAttempt();
    const key=attemptKey(rows),saved=state.attempts.get(key);
    if(saved){
      state.deck=saved.deck;state.responses=new Map(saved.responses);state.index=saved.index;state.flipped=saved.flipped;state.testSubmitted=saved.testSubmitted;state.lastResult=saved.lastResult;
    }else{
      const deck=makeDeck(rows,sourceRows);state.deck=deck;resetAttempt();
    }
    state.activeAttempt=key;state.demo=false;render();enableExports(true);
    status(saved?`Resumed ${state.deck.length} flashcard(s). Your answers and progress are retained.`:`Ready! ${state.deck.length} flashcard(s) generated successfully.`);
    $('previewPanel').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){status(e.message,true)}
}
function render(){const c=state.deck[state.index];if(!c)return;if(testInProgress())state.flipped=false;state.selected=state.responses.get(c.number)??-1;$('deckCounter').textContent=`${state.demo?'SAMPLE · ':''}${state.index+1} / ${state.deck.length}`;let content=`<div class="card-label"><span>${state.flipped?'ANSWER SIDE':'QUESTION SIDE'}</span><span>QUESTION ${escapeHTML(String(c.number).padStart(3,'0'))}</span></div><div class="question-text">${escapeHTML(c.question)}</div>`;if(state.flipped){const label=String.fromCharCode(65+c.correct);content+=`<div class="answer-main"><div class="answer-icon">✓</div><div class="card-label">CORRECT ANSWER</div><div class="answer-value">${state.studyMode==='classic'?'':escapeHTML(label)+'. '}${escapeHTML(c.answer)}</div><div class="answer-feedback">${state.studyMode==='classic'?'Tap to return to the question.':state.selected>=0?state.selected===c.correct?'You chose the correct option.':'Your choice was '+String.fromCharCode(65+state.selected)+'. Keep practicing.':'Click again to return to the question.'}</div></div>`}else if(state.studyMode==='classic'){content+='<div class="classic-prompt">Think of your answer, then flip the card to reveal it.</div>'}else{content+='<div class="options-list">'+c.options.map((opt,i)=>{let cls='option';if(state.selected===i)cls+=' selected';if((state.sessionMode==='learning'||state.testSubmitted)&&state.selected>=0){if(i===c.correct)cls+=' correct';else if(i===state.selected)cls+=' incorrect'}return `<button type="button" class="${cls}" data-option="${i}"${answerIsLocked(c)?' disabled':''}><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${escapeHTML(opt)}</span></button>`}).join('')+'</div>';} $('cardContent').innerHTML=content;$('flipCard').classList.toggle('classic-card',state.studyMode==='classic');$('shuffleOptionsBtn').disabled=state.studyMode==='classic'||state.sessionMode==='test'||answerIsLocked(c);$('flipBtn').disabled=testInProgress();$('flipCard').classList.toggle('flipped',state.flipped);$('prevBtn').disabled=state.index===0;$('nextBtn').disabled=state.index===state.deck.length-1&&!testInProgress();$('nextBtn').textContent=state.index===state.deck.length-1?(testInProgress()?'Finish Test ✓':'Last card ✓'):'Next →';renderSessionStatus();renderQuizNavigation();retainAttempt();renderGroupProgress();}
// Keep original source IDs in the grid even when the study deck is shuffled.
function renderQuizNavigation(){
  const current=state.deck[state.index];
  const reveal=state.studyMode==='mcq'&&(state.sessionMode==='learning'||state.testSubmitted);
  const activeNumber=document.activeElement?.closest('#quizQuestions button')?.dataset.questionNumber;
  $('quizQuestions').innerHTML=state.deck.slice().sort((a,b)=>a.number-b.number).map(card=>{
    const isCurrent=card.number===current.number,answered=state.responses.has(card.number);
    const outcome=reveal&&answered?(state.responses.get(card.number)===card.correct?'correct':'incorrect'):'';
    const label=`Question ${card.number}${isCurrent?', current question':''}${outcome==='correct'?', correct':outcome==='incorrect'?', needs practice':answered?', answer selected':''}`;
    return `<button type="button" class="quiz-question${isCurrent?' is-current':''}${answered?' is-answered':''}${outcome?' is-'+outcome:''}" data-question-number="${escapeHTML(card.number)}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}"${isCurrent?' aria-current="step"':''}>${escapeHTML(card.number)}</button>`;
  }).join('');
  $('quizNavigationLegend').innerHTML=reveal?'<span>Current question: outlined</span><span>Green = Correct</span><span>Red = Needs practice</span>':'<span>Current question: outlined</span><span>Answer selected: shaded</span>';
  if(activeNumber){
    Array.from($('quizQuestions').children).find(button=>button.dataset.questionNumber===activeNumber)?.focus({preventScroll:true});
  }
}
function answerIsLocked(card){
  return state.testSubmitted||(state.studyMode==='mcq'&&state.sessionMode==='learning'&&state.responses.has(card.number));
}
function jumpToQuestion(number){
  const index=state.deck.findIndex(card=>card.number===number);
  if(index<0)return;
  state.index=index;state.flipped=false;render();
  $('flipCard').focus({preventScroll:true});
  $('flipCard').scrollIntoView({behavior:'smooth',block:'start'});
}
function testInProgress(){return state.studyMode==='mcq'&&state.sessionMode==='test'&&!state.testSubmitted}
function resetAttempt(){
  state.responses.clear();state.index=0;state.selected=-1;state.flipped=false;
  state.testSubmitted=false;state.lastResult=null;
  $('studyNotice').textContent='';
  if($('testResultDialog').open)$('testResultDialog').close();
}
function chooseSessionMode(mode){
  if(state.sessionMode===mode)return;
  state.sessionMode=mode;state.mode=mode==='learning'?'instant':'flip';state.activeAttempt=state.activeAttempt?attemptKey(state.deck):null;resetAttempt();render();
}
function renderSessionStatus(){
  const mcq=state.studyMode==='mcq',testing=state.sessionMode==='test';
  $('practiceModes').classList.toggle('hidden',!mcq);
  for(const [id,mode] of [['learningModeBtn','learning'],['testModeBtn','test']]){
    $(id).classList.toggle('active',state.sessionMode===mode);
    $(id).setAttribute('aria-pressed',String(state.sessionMode===mode));
  }
  const answered=state.deck.filter(c=>state.responses.has(c.number)).length;
  $('sessionProgress').textContent=mcq?(testing?state.testSubmitted?'Test complete · Review your answers':`Test Mode · ${answered}/${state.deck.length} answered`:'Learning Mode · Instant feedback · First answer locks'):'';
  $('lastResult').textContent=mcq&&state.lastResult?`Last result: ${state.lastResult.correct}/${state.lastResult.total} · ${state.lastResult.percent}%`:'';
  $('lastResult').classList.toggle('hidden',!mcq||!state.lastResult);
  $('finishTestBtn').classList.toggle('hidden',!mcq||!testing||state.testSubmitted);
  $('showResultBtn').classList.toggle('hidden',!mcq||!state.lastResult);
  $('flipCard').setAttribute('aria-label',testInProgress()?'Test question. Choose an option. Answers are hidden until you finish.':'Flip flashcard');
  $('studyFlipHint').textContent=testInProgress()?'Choose your answer. Correct answers are revealed after you finish the test.':'↻ Tap the card or press Space to flip';
}
function finishTest(){
  if(!testInProgress())return;
  const missing=state.deck.filter(c=>!state.responses.has(c.number));
  if(missing.length){
    jumpToQuestion(missing[0].number);
    $('studyNotice').textContent=`${missing.length} question${missing.length===1?'':'s'} remaining—complete ${missing.length===1?'it':'them'} to see your result.`;
    return;
  }
  const correct=state.deck.filter(c=>state.responses.get(c.number)===c.correct).length;
  state.lastResult={correct,total:state.deck.length,percent:Math.round(correct/state.deck.length*100)};
  state.testSubmitted=true;state.flipped=false;$('studyNotice').textContent='';render();showTestResult();
}
function showTestResult(){
  const result=state.lastResult;if(!result)return;
  const perfect=result.correct===result.total,strong=result.correct/result.total>=.7;
  $('resultTitle').textContent=perfect?'Outstanding!':strong?'Great work!':'Keep going—you’re making progress.';
  $('resultMessage').textContent=perfect?'You’ve mastered this set. Carry that confidence into your next challenge.':strong?'Your hard work is showing. Review the missed questions, practise again, and aim for a perfect score.':'Every attempt builds your confidence. Take your time, review the answers, and try again—you can get there.';
  $('resultScore').textContent=`${result.correct}/${result.total}`;
  $('resultPercent').textContent=`${result.percent}% correct`;
  $('resultDetail').textContent=`${result.correct} correct · ${result.total-result.correct} to review · ${result.total} questions completed`;
  $('resultEmblem').textContent=perfect?'★':strong?'✦':'↗';
  if(!$('testResultDialog').open)$('testResultDialog').showModal();
}
function reviewTestAnswers(){
  $('testResultDialog').close();
  const missed=state.deck.find(c=>state.responses.get(c.number)!==c.correct);
  jumpToQuestion((missed||state.deck[0]).number);
}
function flip(){if(testInProgress())return;if(!state.deck.length)return;state.flipped=!state.flipped;render()}
function go(delta){const next=state.index+delta;if(next<0||next>=state.deck.length)return;state.index=next;state.flipped=false;state.selected=-1;render()}
function enableExports(on){['htmlBtn','pdfBtn','csvBtn','xlsxBtn','zipBtn'].forEach(id=>$(id).disabled=!on);$('exportPanel').querySelector('p:not(.mini-overline)').textContent=on?`${state.deck.length} card(s) ready. Exports contain the current question and option order.`:'Generate a deck first to enable downloadable formats.'}
function openModal(id){$(id).classList.remove('hidden');document.body.style.overflow='hidden';$(id).querySelector('button')?.focus()}
function closeModal(id){$(id).classList.add('hidden');document.body.style.overflow=''}
function switchAuth(signup){$('usernameField').classList.toggle('hidden',!signup);$('confirmField').classList.toggle('hidden',!signup);$('signUpTab').classList.toggle('active',signup);$('signInTab').classList.toggle('active',!signup);$('authSubmit').textContent=signup?'Create Account':'Sign In';$('authTitle').textContent=signup?'A place for your next chapter.':'Welcome to Flashcard.';}
function showEditor(){const wrap=$('editorRows');wrap.innerHTML='';state.rows.forEach(r=>appendEditRow(r));openModal('editorModal')}
function appendEditRow(r){const div=document.createElement('div');div.className='editor-row';div.innerHTML=`<input aria-label="Question number" type="number" min="0" class="no-edit" value="${r.number}"><textarea aria-label="Question" class="question-edit">${escapeHTML(r.question)}</textarea><textarea aria-label="Answer" class="answer-edit">${escapeHTML(r.answer)}</textarea><button class="remove-edit" aria-label="Remove row" type="button">×</button>`;div.querySelector('.remove-edit').onclick=()=>div.remove();$('editorRows').append(div)}
function saveEditor(){const rows=[],ids=new Set();for(const node of $('editorRows').children){const n=Number(node.querySelector('.no-edit').value),q=node.querySelector('.question-edit').value.trim(),a=node.querySelector('.answer-edit').value.trim();if(!Number.isSafeInteger(n)||n<0||!q||!a||ids.has(n)){alert('Each row needs a unique non-negative number, question and answer.');return}ids.add(n);rows.push({number:n,question:q,answer:a})}if(!rows.length){alert('Keep at least one valid question row.');return}activateRows(rows,state.name||'Edited question bank');closeModal('editorModal')}
function csvCell(x){return '"'+String(x??'').replace(/"/g,'""')+'"'}
function rowsExport(){return [['Question Number','Question','Option A','Option B','Option C','Correct Letter','Correct Answer'],...state.deck.map(c=>[c.number,c.question,...c.options,String.fromCharCode(65+c.correct),c.answer])]}
function fileBase(){return (state.name||'flashcards').replace(/\.[^.]+$/,'').replace(/[^\w\-.]+/g,'-').slice(0,55)||'flashcards'}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function exportCSV(){const csv='\ufeff'+rowsExport().map(r=>r.map(csvCell).join(',')).join('\r\n');download(new Blob([csv],{type:'text/csv;charset=utf-8'}),fileBase()+'-flashcards.csv')}
function excelColumn(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
async function excelBlob(){const rows=rowsExport(),xml=rows.map((r,i)=>`<row r="${i+1}">${r.map((v,j)=>{const numeric=j===0&&i>0;return `<c r="${excelColumn(j)}${i+1}" ${numeric?'':'t="inlineStr"'}>${numeric?`<v>${v}</v>`:`<is><t>${escapeHTML(v)}</t></is>`}</c>`}).join('')}</row>`).join('');const zip=new JSZip();zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');zip.folder('_rels').file('.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');zip.folder('xl').file('workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Flashcards" sheetId="1" r:id="rId1"/></sheets></workbook>');zip.folder('xl/_rels').file('workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');zip.folder('xl/worksheets').file('sheet1.xml',`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`);return await zip.generateAsync({type:'blob',compression:'DEFLATE'})}
async function exportExcel(){download(await excelBlob(),fileBase()+'-flashcards.xlsx')}
function standaloneHTML(){
const cards=JSON.stringify(state.deck).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028');
return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DeTLeng Offline Flashcards</title>
<style>body{background:#f5f8f3;color:#183e34;font-family:system-ui,Arial,sans-serif;margin:0;padding:25px;line-height:1.55}main{max-width:850px;margin:30px auto}.top,.controls,.tools,.study-choice{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}h1{font-size:clamp(28px,5vw,43px)}.study-choice{margin:16px 0}.study-choice button{flex:1}.study-choice button.active{background:#173f35;color:white;border-color:#173f35}.card{border:1px solid #cdded1;border-radius:22px;padding:25px;background:white;min-height:330px;cursor:pointer;display:flex;flex-direction:column;gap:20px;box-shadow:0 15px 45px #12492c15}.question{font-size:clamp(21px,3vw,27px);font-weight:750}.classic .question{font-size:clamp(25px,3.4vw,34px);margin:auto 0;text-align:center}.opts{display:grid;gap:10px;margin-top:auto}.opt{padding:15px;background:#f6f9f5;border:1px solid #d2e0d4;border-radius:12px;font-size:17px;text-align:left;color:#173e34}.opt.sel{border-color:#287f66;background:#e3f3e8}.answer{margin:auto;background:#e3f5e6;border-radius:18px;padding:22px;text-align:center;font-size:24px;font-weight:800;overflow-wrap:anywhere}.prompt{text-align:center;color:#5b776c;font-size:16px;margin:auto 0}button{cursor:pointer;border:1px solid #cdded1;border-radius:12px;background:white;color:#173e34;padding:12px 16px;font-size:16px;font-weight:750}button.primary{background:#173f35;color:white}button:disabled{opacity:.4;cursor:default}.hint{text-align:center;color:#60736b;font-size:14px;margin:12px}.tools{margin-top:15px}@media(max-width:480px){body{padding:12px}.card{padding:17px}.study-choice button{width:100%}}@media print{button,.controls,.tools,.study-choice{display:none}}</style></head><body><main><div class="top"><h1>DeTLeng · Flashcard</h1><span id="counter"></span></div><div class="study-choice" role="group" aria-label="Choose study mode"><button id="mcqMode" class="active" aria-pressed="true">☷ MCQ Mode · 3 options</button><button id="classicMode" aria-pressed="false">▣ Classic Flashcard · Q &amp; A</button></div><section id="card" class="card" tabindex="0" aria-label="Flip card"></section><p class="hint">Tap card or press Space to flip</p><div class="controls"><button onclick="nav(-1)">← Previous</button><button onclick="flip()">↻ Flip</button><button class="primary" onclick="nav(1)">Next →</button></div><div class="tools"><button id="shuffleOptions" onclick="reshuffleOptions()">⇄ Shuffle options</button><button onclick="reshuffleCards()">⤨ Shuffle questions</button><button onclick="i=0;flipped=false;selected=-1;render()">↺ Restart</button></div><p class="hint">Interactive offline deck · Both study modes · No internet needed</p></main>
<script>let cards=${cards};let i=0,flipped=false,selected=-1,mode='mcq';const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function sh(a){for(let j=a.length-1;j>0;j--){let k=Math.floor(Math.random()*(j+1));[a[j],a[k]]=[a[k],a[j]]}return a}function changeMode(m){mode=m;flipped=false;selected=-1;document.getElementById('mcqMode').classList.toggle('active',m==='mcq');document.getElementById('classicMode').classList.toggle('active',m==='classic');document.getElementById('mcqMode').setAttribute('aria-pressed',String(m==='mcq'));document.getElementById('classicMode').setAttribute('aria-pressed',String(m==='classic'));document.getElementById('shuffleOptions').disabled=m==='classic';render()}function render(){let c=cards[i];document.getElementById('counter').textContent=(i+1)+' / '+cards.length;document.getElementById('card').classList.toggle('classic',mode==='classic');document.getElementById('card').innerHTML='<small>'+(flipped?'ANSWER':'QUESTION')+' SIDE · #'+esc(c.number)+'</small><div class="question">'+esc(c.question)+'</div>'+(flipped?'<div class="answer">✓ Correct answer<br>'+(mode==='classic'?'':String.fromCharCode(65+c.correct)+'. ')+esc(c.answer)+'</div>':mode==='classic'?'<div class="prompt">Guess in your mind, then flip to reveal the answer.</div>':'<div class="opts">'+c.options.map((o,k)=>'<button class="opt '+(selected===k?'sel':'')+'" data-option="'+k+'">'+String.fromCharCode(65+k)+'. '+esc(o)+'</button>').join('')+'</div>')}function flip(){flipped=!flipped;render()}function nav(d){if(i+d<0||i+d>=cards.length)return;i+=d;flipped=false;selected=-1;render()}function reshuffleOptions(){if(mode==='classic')return;let c=cards[i],pairs=sh(c.options.map((v,k)=>({v,k})));c.options=pairs.map(p=>p.v);c.correct=pairs.findIndex(p=>p.k===c.correct);selected=-1;flipped=false;render()}function reshuffleCards(){cards=sh(cards);i=0;selected=-1;flipped=false;render()}document.getElementById('mcqMode').onclick=()=>changeMode('mcq');document.getElementById('classicMode').onclick=()=>changeMode('classic');document.getElementById('card').addEventListener('click',e=>{let b=e.target.closest('[data-option]');if(b&&mode==='mcq'){selected=+b.dataset.option;render();return}flip()});document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;if(e.code==='Space'){e.preventDefault();flip()}else if(e.code==='ArrowLeft')nav(-1);else if(e.code==='ArrowRight')nav(1)});render();<\/script></body></html>`;
}
function exportHTML(){download(new Blob([standaloneHTML()],{type:'text/html;charset=utf-8'}),fileBase()+'-interactive.html')}
function exportPDF(){const items=state.deck.map(c=>`<article style="page-break-inside:avoid;margin-bottom:23px;border:1px solid #a7bbac;padding:17px;border-radius:8px"><h2 style="font-size:16px">Question ${escapeHTML(c.number)}. ${escapeHTML(c.question)}</h2>${c.options.map((o,i)=>`<p>${String.fromCharCode(65+i)}. ${escapeHTML(o)}</p>`).join('')}</article>`).join('');const answer=state.deck.map(c=>`<p><strong>${escapeHTML(c.number)}.</strong> ${String.fromCharCode(65+c.correct)} — ${escapeHTML(c.answer)}</p>`).join('');const html=`<!doctype html><html><head><meta charset="utf-8"><title>Printable DeTLeng Flashcards</title><style>body{font:14px/1.5 Arial;margin:35px;color:#173e34}h1{font-size:25px}.answerkey{page-break-before:always}@media print{body{margin:15mm}}</style></head><body><h1>DeTLeng Flashcards — Questions</h1>${items}<section class="answerkey"><h1>Answer key</h1>${answer}</section><section class="answerkey"><h1>Classic Flashcards — Question &amp; Answer</h1>${state.deck.map(c=>`<article style="page-break-inside:avoid;margin-bottom:20px;border:1px solid #a7bbac;padding:17px;border-radius:8px"><h2 style="font-size:17px">Question ${escapeHTML(c.number)}. ${escapeHTML(c.question)}</h2><p style="font-size:17px"><strong>Answer:</strong> ${escapeHTML(c.answer)}</p></article>`).join('')}</section><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`;const w=window.open('','_blank');if(!w){status('Allow pop-ups to open the printable PDF view, or export Interactive HTML.',true);return}w.document.open();w.document.write(html);w.document.close();status('Print view opened. Choose “Save as PDF” in your browser print dialog.')}
async function exportZIP(){const zip=new JSZip();zip.file('index.html',standaloneHTML());zip.file('questions.csv','\ufeff'+rowsExport().map(r=>r.map(csvCell).join(',')).join('\r\n'));zip.file('README.txt','DeTLeng Offline Flashcards\n\nExtract this ZIP, then double-click index.html in a browser. No internet or account is required.\nquestions.csv contains your current MCQ options and answer key.');download(await zip.generateAsync({type:'blob',compression:'DEFLATE'}),fileBase()+'-offline.zip')}
function setup(){ $('year').textContent=new Date().getFullYear();const nav=$('mainNav');const theme=document.createElement('button');theme.className='theme-button';theme.setAttribute('aria-label','Toggle light and dark mode');theme.title='Toggle light/dark';theme.textContent='☾';nav.insertBefore(theme,$('loginBtn'));theme.onclick=()=>{document.body.classList.toggle('dark');theme.textContent=document.body.classList.contains('dark')?'☀':'☾'};const modes=$('practiceModes');$('learningModeBtn').onclick=()=>chooseSessionMode('learning');$('testModeBtn').onclick=()=>chooseSessionMode('test');$('finishTestBtn').onclick=finishTest;$('showResultBtn').onclick=showTestResult;$('closeResultBtn').onclick=()=>$('testResultDialog').close();$('reviewAnswersBtn').onclick=reviewTestAnswers;$('tryAgainBtn').onclick=()=>{resetAttempt();render();$('flipCard').focus({preventScroll:true});$('flipCard').scrollIntoView({behavior:'smooth',block:'start'})};const studySwitch=document.createElement('div');studySwitch.className='study-choice';studySwitch.setAttribute('role','group');studySwitch.setAttribute('aria-label','Choose study mode');studySwitch.innerHTML='<button type="button" class="study-choice-btn active" id="mcqModeBtn" aria-pressed="true">☷ MCQ Mode · 3 options</button><button type="button" class="study-choice-btn" id="classicModeBtn" aria-pressed="false">▣ Classic Flashcard · Q & A</button>';$('studyArea').insertBefore(studySwitch,modes);function chooseStudyMode(mode){if(state.studyMode!==mode)resetAttempt();state.studyMode=mode;state.activeAttempt=state.activeAttempt?attemptKey(state.deck):null;state.selected=-1;state.flipped=false;for(const [id,value] of [['mcqModeBtn','mcq'],['classicModeBtn','classic']]){const btn=$(id);btn.classList.toggle('active',mode===value);btn.setAttribute('aria-pressed',String(mode===value))}modes.style.display=mode==='classic'?'none':'';render()}$('mcqModeBtn').onclick=()=>chooseStudyMode('mcq');$('classicModeBtn').onclick=()=>chooseStudyMode('classic');$('menuToggle').onclick=()=>{nav.classList.toggle('open');$('menuToggle').setAttribute('aria-expanded',String(nav.classList.contains('open')))};nav.querySelectorAll('a[href^="#"]').forEach(a=>a.onclick=()=>nav.classList.remove('open'));$('loginBtn').onclick=()=>{switchAuth(false);$('authFormView').classList.remove('hidden');$('freeView').classList.add('hidden');openModal('authModal')};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close==='auth'?'authModal':'editorModal'));$('signInTab').onclick=()=>switchAuth(false);$('signUpTab').onclick=()=>switchAuth(true);$('authForm').onsubmit=e=>{e.preventDefault();$('authFormView').classList.add('hidden');$('freeView').classList.remove('hidden')};$('showPasswordBtn').onclick=()=>{const v=$('passwordInput').type==='password'?'text':'password';document.querySelectorAll('#authForm input[type="password"], #authForm input[type="text"]').forEach(el=>{if(el.id==='passwordInput'||el.parentElement=== $('confirmField'))el.type=v});$('showPasswordBtn').textContent=v==='text'?'Hide password':'Show password'};$('continueFree').onclick=()=>closeModal('authModal');$('dropzone').onclick=()=>$('fileInput').click();$('dropzone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('fileInput').click()}};$('fileInput').onchange=e=>handleFile(e.target.files?.[0]);$('dropzone').ondragover=e=>{e.preventDefault();$('dropzone').classList.add('dragover')};$('dropzone').ondragleave=()=>$('dropzone').classList.remove('dragover');$('dropzone').ondrop=e=>{e.preventDefault();$('dropzone').classList.remove('dragover');handleFile(e.dataTransfer.files[0])};$('rangeGroupButtons').onclick=e=>{const button=e.target.closest('[data-range-group]');if(button)chooseRangeGroup(button.dataset.rangeGroup)};$('startNumber').oninput=updateRange;$('endNumber').oninput=updateRange;$('generateBtn').onclick=()=>{const a=Number($('startNumber').value),b=Number($('endNumber').value);if(!Number.isFinite(a)||!Number.isFinite(b)||a>b){status('Please choose a valid start and end number.',true);return}let rows=state.rows.filter(r=>r.number>=a&&r.number<=b);if(!rows.length){status('No questions exist within this range.',true);return}if($('shuffleQuestions').checked)rows=shuffle(rows);createDeck(rows,state.rows)};$('demoBtn').onclick=()=>{activateRows(SAMPLE.map(x=>({...x})),'Sample question bank');createDeck(state.rows,state.rows);state.demo=true;render()};$('editBtn').onclick=showEditor;$('addRowBtn').onclick=()=>appendEditRow({number:Math.max(0,...state.rows.map(r=>r.number))+1,question:'',answer:''});$('saveRowsBtn').onclick=saveEditor;$('flipCard').onclick=e=>{const opt=e.target.closest('[data-option]');if(opt){if(answerIsLocked(state.deck[state.index]))return;$('studyNotice').textContent='';state.selected=Number(opt.dataset.option);state.responses.set(state.deck[state.index].number,state.selected);render();return}flip()};$('flipCard').onkeydown=e=>{if(e.code==='Space'&&e.target===$('flipCard')){e.preventDefault();flip()}};$('quizQuestions').onclick=e=>{const button=e.target.closest('[data-question-number]');if(button)jumpToQuestion(Number(button.dataset.questionNumber))};$('flipBtn').onclick=flip;$('prevBtn').onclick=()=>go(-1);$('nextBtn').onclick=()=>{if(testInProgress()&&state.index===state.deck.length-1)finishTest();else go(1)};$('shuffleOptionsBtn').onclick=()=>{const c=state.deck[state.index];if(!c||state.sessionMode==='test'||answerIsLocked(c))return;const pairs=shuffle(c.options.map((v,k)=>({v,k})));c.options=pairs.map(p=>p.v);c.correct=pairs.findIndex(p=>p.k===c.correct);state.responses.delete(c.number);state.selected=-1;state.flipped=false;render()};$('shuffleDeckBtn').onclick=()=>{state.deck=shuffle(state.deck);state.index=0;state.flipped=false;state.selected=-1;render()};$('restartBtn').onclick=()=>{resetAttempt();render()};$('csvBtn').onclick=exportCSV;$('xlsxBtn').onclick=()=>exportExcel().catch(e=>status(e.message,true));$('htmlBtn').onclick=exportHTML;$('pdfBtn').onclick=exportPDF;$('zipBtn').onclick=()=>exportZIP().catch(e=>status(e.message,true));document.addEventListener('keydown',e=>{if($('testResultDialog').open)return;if(!$('testResultDialog').open&&!document.querySelector('.modal:not(.hidden)')&&document.activeElement?.tagName!=='INPUT'&&document.activeElement?.tagName!=='TEXTAREA'&&document.activeElement?.tagName!=='BUTTON'){if(e.code==='ArrowLeft')go(-1);if(e.code==='ArrowRight')go(1);if(e.code==='Space'&&document.activeElement===document.body){e.preventDefault();flip()}}if(e.key==='Escape')document.querySelectorAll('.modal:not(.hidden)').forEach(m=>closeModal(m.id))});state.deck=makeDeck(SAMPLE.slice(0,3),SAMPLE);render();enableExports(false)}
document.addEventListener('DOMContentLoaded',setup);
