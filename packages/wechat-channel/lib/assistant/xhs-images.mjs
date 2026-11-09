import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,renameSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {downloadImage} from './meme-collector.mjs';
import {imageExt} from './received-memes.mjs';
const exec=promisify(execFile);
export async function saveNoteImages({note,root,indices,signal,download=downloadImage,convert,folderName='xhs'}){
 const images=note.images??[];
 if(indices===undefined)indices=images.slice(0,2).map((_,i)=>i+1);
 if(!Array.isArray(indices)||indices.length>4||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<1||i>images.length))throw Error('indices须为不重复的图片序号，每次最多4张，从1开始且不能超过笔记图片数');
 if(!['xhs','web-images'].includes(folderName))throw Error('媒体目录无效');
 const folder=join(root,'..','media',folderName);mkdirSync(folder,{recursive:true});const files=[],errors=[];
 for(const index of indices){signal?.throwIfAborted();const temp=mkdtempSync(join(folder,'download-'));try{
 const data=await download(images[index-1],signal);imageExt(data);const input=join(temp,'source'),output=join(temp,'image.png');writeFileSync(input,data);
 if(convert)await convert(input,output,signal);else{const ffmpeg=join(root,'..','tools','ffmpeg','bin','ffmpeg.exe');await exec(existsSync(ffmpeg)?ffmpeg:'ffmpeg',['-v','error','-y','-protocol_whitelist','file,pipe','-i',input,'-frames:v','1','-vf','scale=2048:2048:force_original_aspect_ratio=decrease',output],{windowsHide:true,timeout:20000,signal});}
 const bytes=readFileSync(output);if(imageExt(bytes)!=='.png')throw Error('图片转换未得到PNG');const sha=createHash('sha256').update(bytes).digest('hex'),path=join(folder,sha+'.png');if(!existsSync(path))renameSync(output,path);files.push({index,path,mime:'image/png',bytes:bytes.length});
 }catch(e){signal?.throwIfAborted();errors.push({index,error:String(e.message).slice(0,180)})}finally{rmSync(temp,{recursive:true,force:true})}}
 return {source:note.url,title:note.title,total:images.length,files,errors,downloaded:files.length>0,scope:'已下载原笔记配图，未进行视觉内容解读；不能凭文字断言图片中的细节',next:files.length?'用户要图片时，用wechat_send_file发送返回的path；下载成功不代表已经发出。':images.length?'图片下载失败，按errors说明原因，不声称不支持取图。':'当前笔记未提供正文图片地址，可能是视频或页面未加载图片。'};
}
