import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ChatMessage { id:string; user:string; body:string; ts:number; week:number; }
interface ChatProps { currentWeek:number; currentUser:string|null; }

export const Chat:React.FC<ChatProps> = ({ currentWeek, currentUser }) => {
  const [messages,setMessages] = useState<ChatMessage[]>([]);
  const [input,setInput] = useState('');
  const [sending,setSending] = useState(false);
  const [loading,setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement|null>(null);
  const lastWeekRef = useRef<number>(currentWeek);

  const load = useCallback(async ()=>{
    try {
      const r = await fetch(`/api/chat?week=${currentWeek}`);
      if(!r.ok) return;
      const j = await r.json();
      if(Array.isArray(j.messages)) setMessages(j.messages);
    } catch{} finally { setLoading(false); }
  },[currentWeek]);

  useEffect(()=>{ load(); const id = setInterval(load, 8000); return ()=> clearInterval(id); },[load]);

  // Reset scroll on week change
  useEffect(()=>{ if(currentWeek !== lastWeekRef.current){ lastWeekRef.current = currentWeek; setMessages([]); load(); if(listRef.current) listRef.current.scrollTop = 0; } },[currentWeek, load]);

  useEffect(()=>{ if(listRef.current){ listRef.current.scrollTop = listRef.current.scrollHeight; } },[messages]);

  const submit = async ()=>{
    if(!currentUser || !input.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch('/api/chat', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ body: input.trim() }) });
      if(r.ok){ setInput(''); await load(); }
    } catch{} finally { setSending(false); }
  };

  const onKey = (e:React.KeyboardEvent<HTMLInputElement>)=>{ if(e.key==='Enter'){ submit(); } };

  return (
    <div className="max-w-2xl mx-auto bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 flex flex-col h-[520px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-lg">Week {currentWeek} Chat</h3>
        <span className="text-white/50 text-xs">resets weekly</span>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {loading && messages.length===0 && <div className="text-white/40 text-sm py-8 text-center">Loading chat...</div>}
        {!loading && messages.length===0 && <div className="text-white/40 text-sm py-8 text-center">No messages yet. Start the conversation!</div>}
        {messages.map(m=> (
          <div key={m.id} className="group px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-sm flex flex-col">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-semibold text-white/90 text-xs">u/{m.user}</span>
              <span className="text-[10px] text-white/40">{new Date(m.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>
            </div>
            <span className="leading-snug whitespace-pre-wrap break-words">{m.body}</span>
          </div>
        ))}
      </div>
      <div className="pt-3 flex items-center gap-2">
        <input
          value={input}
          onChange={e=>setInput(e.target.value.slice(0,280))}
          onKeyDown={onKey}
          placeholder={currentUser? 'Type a message (Enter to send)' : 'Log in on Reddit to chat'}
          disabled={!currentUser || sending}
          className="flex-1 px-3 py-2 rounded-lg bg-white/15 border border-white/25 text-white placeholder-white/40 focus:outline-none"
        />
        <button disabled={!currentUser || !input.trim() || sending} onClick={submit} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${(!currentUser || !input.trim() || sending)?'bg-white/10 text-white/40 cursor-not-allowed':'bg-blue-500 hover:bg-blue-600 text-white'}`}>{sending? '...':'Send'}</button>
      </div>
      <div className="text-right text-[10px] text-white/30 mt-1">Max 280 chars</div>
    </div>
  );
};
