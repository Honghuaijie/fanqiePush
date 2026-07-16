import type { Server } from "node:http";
import express from "express";

export interface MockSubmission {
  chapterNumber: string;
  title: string;
  body: string;
  plannedDate: string;
  plannedTime: string;
  aiUsed: boolean;
  detectionMethod: string;
}

function page(content: string, script = ""): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>本地番茄模拟页</title>
<style>
body{font-family:sans-serif;padding:32px}button,a,input,[role=button],[role=switch],.ProseMirror{display:inline-block;margin:8px;padding:10px;min-width:80px;min-height:24px}.ProseMirror{display:block;border:1px solid #aaa;width:700px;min-height:240px}.modal{position:fixed;inset:80px;background:white;border:2px solid #333;padding:24px}.hidden{display:none!important}.picker-popup{position:fixed;left:180px;top:250px;background:white;border:1px solid #333;padding:16px;z-index:20}
</style></head><body>${content}<script>${script}</script></body></html>`;
}

export async function startFanqieMockServer(options: { typoPrompt: boolean }) {
  const app = express();
  const submissions: MockSubmission[] = [];
  const detectionClicks: string[] = [];
  app.use(express.json());

  app.get("/main/writer/book-manage", (_req, res) => {
    res.send(page(`
      <section><h1>我的小说</h1><article><strong>测试书</strong>
      <a href="/main/writer/chapter-manage/123&%E6%B5%8B%E8%AF%95%E4%B9%A6?type=1">章节管理</a></article></section>
    `));
  });

  app.get("/main/writer/chapter-manage/:book", (_req, res) => {
    res.send(page(`
      <h1>测试书</h1><h2>章节管理</h2>
      <a target="_blank" href="/main/writer/123/publish/?enter_from=newchapter">新建章节</a>
    `));
  });

  app.get("/main/writer/123/publish/", (_req, res) => {
    const nextAction = options.typoPrompt ? "showTypo()" : "showDetection()";
    res.send(page(`
      <h1>测试书</h1>
      <label>第 <input class="serial-input" value=""> 章</label>
      <input class="serial-editor-input-hint-area" placeholder="请输入标题" value="">
      <div class="ProseMirror" contenteditable="true">请输入正文</div>
      <p id="saved">已保存到云端</p>
      <button>存草稿</button><button id="next">下一步</button>
      <div id="typo" class="modal hidden"><h2>发布提示</h2><p>检测到错别字未修改</p><button id="submitTypo">提交</button></div>
      <div id="detection" class="modal hidden"><h2>请选择内容检测方式</h2><button id="basic">仅基础检测</button><button id="full">全面检测</button></div>
      <div id="settings" class="modal arco-modal hidden" role="dialog">
        <h2>发布设置</h2><label>是否使用AI <span id="aiYes">是</span> <span id="aiNo">否</span></label>
        <p>定时发布 <button role="switch" aria-checked="true">开启</button></p>
        <input id="publishDate" class="arco-picker-start-time" placeholder="日期" value="2026-08-01">
        <input id="publishTime" class="arco-picker-start-time" placeholder="时间" value="09:30">
        <button id="confirmPublish">确认发布</button>
      </div>
      <div id="picker" class="picker-popup hidden"><span>2026年8月</span><span role="gridcell" id="day1">1</span></div>
    `, `
      let aiUsed = false;
      let detectionMethod = "";
      const typo = document.getElementById("typo");
      const detection = document.getElementById("detection");
      const settings = document.getElementById("settings");
      const picker = document.getElementById("picker");
      function showTypo(){ typo.classList.remove("hidden"); }
      function showDetection(){ typo.classList.add("hidden"); detection.classList.remove("hidden"); }
      function showSettings(method){ detectionMethod=method; detection.classList.add("hidden"); settings.classList.remove("hidden"); fetch("/detection",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({method})}); }
      document.getElementById("next").onclick=()=>${nextAction};
      document.getElementById("submitTypo").onclick=showDetection;
      document.getElementById("basic").onclick=()=>showSettings("basic");
      document.getElementById("full").onclick=()=>showSettings("full");
      document.getElementById("aiYes").onclick=()=>{aiUsed=true};
      document.getElementById("aiNo").onclick=()=>{aiUsed=false};
      document.getElementById("publishDate").onclick=()=>picker.classList.remove("hidden");
      document.getElementById("day1").onclick=()=>{document.getElementById("publishDate").value="2026-08-01";picker.classList.add("hidden")};
      document.getElementById("confirmPublish").onclick=async()=>{
        const number=document.querySelector(".serial-input").value;
        const rawTitle=document.querySelector(".serial-editor-input-hint-area").value;
        const payload={chapterNumber:number,title:"第"+String(number).padStart(3,"0")+"章 "+rawTitle,body:document.querySelector(".ProseMirror").innerText,plannedDate:document.getElementById("publishDate").value,plannedTime:document.getElementById("publishTime").value,aiUsed,detectionMethod};
        await fetch("/submit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
        settings.classList.add("hidden");
        const success=document.createElement("p");success.className="message";success.textContent="定时发布成功";document.body.appendChild(success);
      };
    `));
  });

  app.post("/detection", (req, res) => {
    detectionClicks.push(String(req.body.method));
    res.json({ ok: true });
  });
  app.post("/submit", (req, res) => {
    submissions.push(req.body as MockSubmission);
    res.json({ ok: true });
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("模拟番茄服务没有监听 TCP 端口。");

  return {
    origin: `http://127.0.0.1:${address.port}`,
    submissions,
    detectionClicks,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
