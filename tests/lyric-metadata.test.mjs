import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanLyricLines,inspectLyricMetadata} from '../shared/lyric-metadata.mjs';
const line=(text,time)=>({startTime:time,endTime:time+500,words:[{word:text,startTime:time,endTime:time+500}],translatedLyric:'',romanLyric:''});
const context={musicName:'MOON-VINE',artists:['夏背','Orangestar'],duration:180000};

test('metadata filtering removes verified headers and edge credits without changing body or timestamps',()=>{
 const body=[line('The first real lyric',10000),line('The final real lyric',175000)];
 const lines=[line('MOON-VINE--夏背/Orangestar',0),line('词：夏背',100),line('Written by: Orangestar',200),...body,line('作曲：Orangestar',179000)];
 const result=inspectLyricMetadata(lines,context);
 assert.deepEqual(result.removed.map(r=>r.index),[0,1,2,5]);
 assert.deepEqual(result.lines,body);assert.equal(result.lines[0],body[0]);assert.equal(lines.length,6);
 assert.equal(cleanLyricLines(result.lines,context),result.lines);
});
test('uncertain headers, quoted credits, real body text and singer labels survive',()=>{
 const protectedLines=['MOON-VINE--Other artist','Other song--夏背','MOON-VINE','你说词：写给我听','「词：你和我」','Music is all I need','Jungkook：'];
 for(const text of protectedLines){const lines=[line(text,0),line('body',50000)];assert.equal(cleanLyricLines(lines,context),lines,text);}
 const middle=[line('body',10000),line('作词：Someone',90000),line('body',170000)];
 assert.equal(cleanLyricLines(middle,context),middle,'middle timestamps must not be cut by an edge-only rule');
 const duet=[{...line('词：Someone',0),isDuet:true},line('body',10000)];
 assert.equal(cleanLyricLines(duet,context),duet);
});
test('localized labels, title aliases and version suffixes are recognized',()=>{
 const song={musicNames:['Moonbath'],titleAliases:['月光浴'],artistNames:['Yorushika'],artistAliases:['ヨルシカ'],duration:200000};
 const lines=[line('月光浴 (Single)--ヨルシカ',0),line('【作詞：n-buna】',100),line('작곡：n-buna',200),line('Lyrics by n-buna',300),line('body',9000)];
 assert.equal(cleanLyricLines(lines,song).length,1);
});
