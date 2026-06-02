import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Trash2, Bot, Send, Sparkles, RefreshCw, X, Key, Eye, EyeOff, Check } from 'lucide-react';

interface Task {
  id: string;
  content: string;
  status: 'todo' | 'progress' | 'done';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

const DEFAULT_TASKS: Task[] = [
  { id: 't1', content: '閱讀設計書籍，思考 Kanban 的排版', status: 'todo' },
  { id: 't2', content: '學習 CSS 霧藍、芥末黃與鼠尾草綠色彩配對', status: 'progress' },
  { id: 't3', content: '建立個人極簡高質感 Kanban 任務看板', status: 'done' }
];

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const stored = localStorage.getItem('kanban-tasks');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return DEFAULT_TASKS;
      }
    }
    return DEFAULT_TASKS;
  });

  const [todoInput, setTodoInput] = useState('');
  const [progressInput, setProgressInput] = useState('');
  const [doneInput, setDoneInput] = useState('');

  // Secure User-entered API Key states
  const [userApiKey, setUserApiKey] = useState(() => {
    return localStorage.getItem('kanban-user-api-key') || '';
  });
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [maskApiKey, setMaskApiKey] = useState(true);

  // AI Chat states
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    const stored = localStorage.getItem('kanban-ai-chat');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('kanban-tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('kanban-user-api-key', userApiKey);
  }, [userApiKey]);

  useEffect(() => {
    localStorage.setItem('kanban-ai-chat', JSON.stringify(chatHistory));
    scrollToBottom();
  }, [chatHistory]);

  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAddTask = (status: 'todo' | 'progress' | 'done', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const newTask: Task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      content: trimmed,
      status
    };

    setTasks(prev => [...prev, newTask]);
    
    // reset inputs
    if (status === 'todo') setTodoInput('');
    if (status === 'progress') setProgressInput('');
    if (status === 'done') setDoneInput('');
  };

  const handleMove = (id: string, direction: 'left' | 'right') => {
    setTasks(prev => prev.map(task => {
      if (task.id !== id) return task;
      
      let nextStatus = task.status;
      if (direction === 'left') {
        if (task.status === 'progress') nextStatus = 'todo';
        else if (task.status === 'done') nextStatus = 'progress';
      } else {
        if (task.status === 'todo') nextStatus = 'progress';
        else if (task.status === 'progress') nextStatus = 'done';
      }
      return { ...task, status: nextStatus };
    }));
  };

  const handleDelete = (id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  };

  // AI Chat operations
  const handleSendToAi = async (textToSend?: string) => {
    const inputMsg = (textToSend || chatInput).trim();
    if (!inputMsg || isAiLoading) return;

    setAiError(null);

    // Guard: Ensure user enters an API key first
    if (!userApiKey.trim()) {
      setShowApiKeyInput(true);
      setAiError("基於完全隱私與安全，本工具已停用後端共用金鑰。請於下方貼上您私人的 Gemini API Key 後再傳送訊息。");
      return;
    }

    if (!textToSend) {
      setChatInput('');
    }

    const userMessage: ChatMessage = {
      id: 'msg_' + Date.now() + '_user',
      role: 'user',
      text: inputMsg
    };

    // Add user message to history
    setChatHistory(prev => [...prev, userMessage]);
    setIsAiLoading(true);

    try {
      const headersInit: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // If user supplied their custom API key, forward it through secure header
      if (userApiKey.trim()) {
        headersInit['x-gemini-key'] = userApiKey.trim();
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: headersInit,
        body: JSON.stringify({
          message: inputMsg,
          history: chatHistory.map(h => ({ role: h.role, text: h.text }))
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '呼叫 AI 失敗，請確認伺服器已正常啟動');
      }

      const aiMessage: ChatMessage = {
        id: 'msg_' + Date.now() + '_model',
        role: 'model',
        text: data.text
      };

      setChatHistory(prev => [...prev, aiMessage]);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || '連線失敗，請檢查 API 金鑰設定與網路連線。');
    } finally {
      setIsAiLoading(false);
    }
  };

  const clearChatHistory = () => {
    if (window.confirm('確定要清除所有與 AI 的對話紀錄嗎？')) {
      setChatHistory([]);
      setAiError(null);
    }
  };

  // Render parsed Markdown/paragraphs for AI messages
  const renderAIResponse = (text: string) => {
    const lines = text.split('\n');
    let insideList = false;
    const renderedElements: React.ReactNode[] = [];

    const formatTextWithBolding = (paraText: string, elementKey: string) => {
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;
      while ((match = boldRegex.exec(paraText)) !== null) {
        if (match.index > lastIndex) {
          parts.push(paraText.substring(lastIndex, match.index));
        }
        parts.push(
          <strong key={match.index} className="font-bold text-[#e07a5f]">
            {match[1]}
          </strong>
        );
        lastIndex = boldRegex.lastIndex;
      }
      if (lastIndex < paraText.length) {
        parts.push(paraText.substring(lastIndex));
      }
      return parts.length > 0 ? parts : paraText;
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ');

      if (isBullet) {
        insideList = true;
        const listText = trimmed.replace(/^[-*•]\s+/, '');
        renderedElements.push(
          <li key={`li-${idx}`} className="ml-5 list-disc text-sm text-[#33312e] leading-relaxed py-0.5 font-sans">
            {formatTextWithBolding(listText, `li-bold-${idx}`)}
          </li>
        );
      } else {
        if (insideList) {
          insideList = false;
        }

        if (trimmed === '') {
          renderedElements.push(<div key={`space-${idx}`} className="h-2" />);
        } else {
          // Check if markdown-style heading
          if (trimmed.startsWith('### ')) {
            renderedElements.push(
              <h4 key={`h4-${idx}`} className="text-sm font-bold text-[#33312e] mt-3 mb-1 font-serif">
                {formatTextWithBolding(trimmed.substring(4), `h4-bold-${idx}`)}
              </h4>
            );
          } else if (trimmed.startsWith('## ')) {
            renderedElements.push(
              <h3 key={`h3-${idx}`} className="text-base font-bold text-[#33312e] mt-4 mb-1.5 font-serif border-l-2 border-[#e07a5f] pl-2">
                {formatTextWithBolding(trimmed.substring(3), `h3-bold-${idx}`)}
              </h3>
            );
          } else {
            renderedElements.push(
              <p key={`p-${idx}`} className="text-sm text-[#33312e] leading-relaxed py-0.5 font-sans">
                {formatTextWithBolding(trimmed, `p-bold-${idx}`)}
              </p>
            );
          }
        }
      }
    });

    return renderedElements;
  };

  const todoTasks = tasks.filter(t => t.status === 'todo');
  const progressTasks = tasks.filter(t => t.status === 'progress');
  const doneTasks = tasks.filter(t => t.status === 'done');

  return (
    <div className="min-h-screen bg-[#f5f3ee] py-12 px-4 selection:bg-[#e07a5f] selection:text-white">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10 text-center">
          <h1 id="app-title" className="font-serif text-4xl font-bold tracking-wider text-[#33312e] mb-3">
            個人化 Kanban 任務板
          </h1>
          <p id="app-subtitle" className="font-serif text-sm tracking-widest text-[#78736a]">
            極簡・輕量・打開即用 × 強大 AI 助手支援
          </p>
        </header>

        {/* AI CONVERSATION AREA */}
        <section id="ai-chat-section" className="bg-[#edeae3]/60 border border-[#dbd6c7] rounded-[6px] p-5 mb-8 flex flex-col transition-all">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#dbd6c7]/60 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#e07a5f]" />
              <h2 className="font-serif text-lg font-bold text-[#33312e] flex items-center gap-1.5">
                AI 看板規劃專家
                <span className="text-xs font-normal font-sans bg-[#e07a5f]/10 text-[#e07a5f] px-2 py-0.5 rounded-full">
                  Gemini 3.5 驅動
                </span>
              </h2>
            </div>
            
            <div className="flex items-center gap-2">
              {/* API Key management button with dynamic highlights */}
              <button
                id="btn-toggle-key-input"
                type="button"
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                className={`text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-[4px] border transition-all cursor-pointer font-sans ${
                  userApiKey.trim()
                    ? 'border-[#859b84]/60 bg-[#859b84]/10 text-[#4c634b] font-medium hover:bg-[#859b84]/20'
                    : 'border-[#dbd6c7] hover:border-[#e07a5f] text-[#78736a] hover:text-[#e07a5f] hover:bg-white'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                {userApiKey.trim() ? (
                  <span className="flex items-center gap-1">
                    自訂金鑰已啟用 <Check className="w-3 h-3 text-[#4c634b]" />
                  </span>
                ) : (
                  "設定個人 AI 金鑰"
                )}
              </button>

              {chatHistory.length > 0 && (
                <button
                  id="btn-clear-chat"
                  onClick={clearChatHistory}
                  className="text-xs text-[#78736a] hover:text-[#e07a5f] hover:bg-[#edeae3] px-2.5 py-1.5 rounded-[4px] border border-transparent hover:border-[#dbd6c7] transition-all cursor-pointer"
                >
                  清除紀錄
                </button>
              )}
            </div>
          </div>

          {/* Secure API Key setup input panel */}
          {showApiKeyInput && (
            <div className="mb-4 p-4 bg-white border border-[#dbd6c7] rounded-[6px] transition-all">
              <span className="text-xs font-bold text-[#33312e] flex items-center gap-1.5 mb-1 font-sans">
                <Key className="w-4 h-4 text-[#e07a5f]" />
                個人 API 金鑰安全設定（安全保存在本地端）
              </span>
              <p className="text-xs text-[#78736a] mb-3 leading-relaxed font-sans">
                安全保障：您輸入的金鑰將直接存在您本地的 <code className="bg-[#edeae3] px-1 rounded text-[#e07a5f]">localStorage</code>，並且加密通訊僅用於傳輸給 Gemini 模型，本系統去中心化且不保留任何密鑰。
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    id="input-user-api-key"
                    type={maskApiKey ? "password" : "text"}
                    value={userApiKey}
                    onChange={(e) => setUserApiKey(e.target.value)}
                    placeholder="請貼上您的 Gemini API 金鑰 (例如：AIzaSy...)"
                    className="w-full bg-white border border-[#dbd6c7] text-xs rounded-[6px] pl-3 pr-10 py-2 text-[#33312e] focus:outline-none focus:border-[#e07a5f] focus:ring-1 focus:ring-[#e07a5f] transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setMaskApiKey(!maskApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78736a] hover:text-[#33312e] cursor-pointer animate-none"
                    title={maskApiKey ? "顯示金鑰" : "隱藏金鑰"}
                  >
                    {maskApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {userApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserApiKey('');
                      setShowApiKeyInput(false);
                    }}
                    className="border border-[#dbd6c7] hover:border-[#c23b3b] hover:bg-[#fdf3f3] text-xs px-3 py-2 rounded-[6px] text-[#78736a] hover:text-[#c23b3b] cursor-pointer transition-all font-sans"
                  >
                    清除金鑰
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowApiKeyInput(false)}
                  className="bg-[#e07a5f] hover:bg-[#d16e53] text-white text-xs px-4 py-2 rounded-[6px] cursor-pointer transition-all font-sans font-medium"
                >
                  確認保存
                </button>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#78736a] font-sans">
                <span className="w-1.5 h-1.5 rounded-full bg-[#e07a5f]"></span>
                提示：本看板助理採純自訂金鑰模式。若您尚未在此輸入您的個人 Gemini API Key，對話框將無法呼叫 AI 看板助理。
              </div>
            </div>
          )}

          {/* Prompt Suggestion Chips */}
          {chatHistory.length === 0 && (
            <div className="mb-4">
              <p className="text-xs font-sans text-[#78736a] mb-2.5 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#e07a5f]" />
                您可以點擊以下快速提示，向 AI 專家尋求靈感與看板規劃建議：
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSendToAi("請幫我把『建立個人理財規劃與記帳習慣』這個大任務，拆解成 5 個可以直接填入 Kanban 的具體待辦事項。")}
                  className="text-xs bg-white text-[#33312e] hover:text-[#e07a5f] hover:bg-white border border-[#dbd6c7] hover:border-[#e07a5f] px-3 py-1.5 rounded-[12px] transition-all cursor-pointer font-sans"
                >
                  💡 結構化拆解任務
                </button>
                <button
                  type="button"
                  onClick={() => handleSendToAi("我容易在工作時分心看社群軟體，請教我 3 個立刻見效的看板番茄鐘搭配心法。")}
                  className="text-xs bg-white text-[#33312e] hover:text-[#e07a5f] hover:bg-white border border-[#dbd6c7] hover:border-[#e07a5f] px-3 py-1.5 rounded-[12px] transition-all cursor-pointer font-sans"
                >
                  🎯 提升專注力方法
                </button>
                <button
                  type="button"
                  onClick={() => handleSendToAi("如何決定一個任務何時該從『待辦』移到『進行中』？如何避免『進行中』累積太多卡片？")}
                  className="text-xs bg-white text-[#33312e] hover:text-[#e07a5f] hover:bg-white border border-[#dbd6c7] hover:border-[#e07a5f] px-3 py-1.5 rounded-[12px] transition-all cursor-pointer font-sans"
                >
                  🚀 看板最佳實踐
                </button>
              </div>
            </div>
          )}

          {/* Chat History Messages Box */}
          {chatHistory.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto pr-1 flex flex-col gap-3 mb-4 custom-scrollbar">
              {chatHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] rounded-[6px] p-3.5 border text-sm font-sans whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-white border-[#dbd6c7] self-end'
                      : 'bg-[#faf8f5] border-[#f0ede6] self-start'
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 block ${
                    msg.role === 'user' ? 'text-[#e07a5f]' : 'text-[#78736a]'
                  }`}>
                    {msg.role === 'user' ? '您' : 'AI 規劃助理'}
                  </span>
                  <div>
                    {msg.role === 'user' ? (
                      <p className="text-[#33312e] leading-relaxed">{msg.text}</p>
                    ) : (
                      <div className="space-y-1">{renderAIResponse(msg.text)}</div>
                    )}
                  </div>
                </div>
              ))}

              {isAiLoading && (
                <div className="bg-[#faf8f5] border border-[#f0ede6] rounded-[6px] p-3.5 max-w-[85%] self-start flex items-center gap-2 text-sm text-[#78736a] font-sans">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#e07a5f]" />
                  <span>AI 正在研擬看板整合建議中...</span>
                </div>
              )}

              {aiError && (
                <div className="bg-[#fef8f8] border border-[#f5c6c6] text-[#c23b3b] rounded-[6px] p-3 text-xs font-sans self-stretch flex justify-between items-start">
                  <span>{aiError}</span>
                  <button onClick={() => setAiError(null)} className="cursor-pointer hover:opacity-80">
                    <X className="w-4 h-4 ml-1" />
                  </button>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
          )}

          {/* Input Area */}
          <form
            id="form-ai-chat"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendToAi();
            }}
            className="flex gap-2"
          >
            <input
              id="input-ai-chat"
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="輸入問題，如：『幫我列出完成個人部落格所需的所有待辦卡片』..."
              disabled={isAiLoading}
              className="flex-1 bg-white border border-[#dbd6c7] text-sm rounded-[6px] px-3 py-2.5 text-[#33312e] placeholder-[#b0aaa0] focus:outline-none focus:border-[#e07a5f] focus:ring-1 focus:ring-[#e07a5f] transition-all font-sans disabled:bg-[#f5f3ee]/50"
            />
            <button
              id="btn-send-ai"
              type="submit"
              disabled={isAiLoading || !chatInput.trim()}
              className="bg-[#e07a5f] hover:bg-[#d16e53] disabled:bg-[#dbd6c7] text-white px-4 py-2 text-sm rounded-[6px] font-sans font-medium transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              傳送
            </button>
          </form>
        </section>

        {/* KANBAN BOARD */}
        <main className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* TO-DO COLUMN */}
          <section id="column-todo" className="bg-[#edeae3] border border-[#dbd6c7] rounded-[6px] p-5 flex flex-col min-h-[520px]">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-[#dbd6c7]">
              <h2 className="font-serif text-lg font-bold text-[#33312e]">待辦</h2>
              <span id="counter-todo" className="flex items-center justify-center min-w-[24px] h-[24px] px-1.5 rounded-full text-xs font-bold text-white bg-[#5b8296]">
                {todoTasks.length}
              </span>
            </div>

            <div className="flex flex-col gap-3 mb-5 flex-grow font-sans">
              {todoTasks.length === 0 ? (
                <div className="text-xs text-[#b0aaa0] text-center py-8 border border-dashed border-[#dbd6c7] rounded-[6px]">
                  暫無任務
                </div>
              ) : (
                todoTasks.map(task => (
                  <div key={task.id} className="bg-white border border-[#dbd6c7] rounded-[6px] p-4 flex flex-col gap-3 group transition-all hover:border-[#78736a]">
                    <p className="text-sm font-sans text-[#33312e] break-all whitespace-pre-wrap leading-relaxed">
                      {task.content}
                    </p>
                    <div className="flex justify-between items-center border-t border-[#f0ede6] pt-2.5 mt-1">
                      <div className="flex gap-2">
                        <button
                          id={`move-right-${task.id}`}
                          onClick={() => handleMove(task.id, 'right')}
                          className="border border-[#dbd6c7] hover:border-[#33312e] hover:bg-[#f5f3ee] text-[#78736a] hover:text-[#33312e] p-1 rounded-[6px] transition-all cursor-pointer"
                          title="移至進行中"
                        >
                          <ArrowRight className="w-4.5 h-4.5" />
                        </button>
                      </div>
                      <button
                        id={`delete-${task.id}`}
                        onClick={() => handleDelete(task.id)}
                        className="text-[#bfa397] hover:text-[#e07a5f] p-1 rounded-[6px] hover:bg-[#fdf5f2] border border-transparent hover:border-[#e07a5f] transition-all cursor-pointer"
                        title="刪除"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              id="form-add-todo"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddTask('todo', todoInput);
              }}
              className="flex gap-2 border-t border-[#dbd6c7] pt-4 mt-auto"
            >
              <input
                id="input-add-todo"
                type="text"
                value={todoInput}
                onChange={(e) => setTodoInput(e.target.value)}
                placeholder="新增待辦任務..."
                required
                className="flex-1 bg-white border border-[#dbd6c7] text-sm rounded-[6px] px-3 py-2 text-[#33312e] placeholder-[#b0aaa0] focus:outline-none focus:border-[#e07a5f] focus:ring-1 focus:ring-[#e07a5f] transition-all font-sans"
              />
              <button
                id="btn-add-todo"
                type="submit"
                className="bg-[#e07a5f] hover:bg-[#d16e53] text-white px-4 py-2 text-sm rounded-[6px] font-sans font-medium transition-colors cursor-pointer shrink-0"
              >
                新增
              </button>
            </form>
          </section>

          {/* IN PROGRESS COLUMN */}
          <section id="column-progress" className="bg-[#edeae3] border border-[#dbd6c7] rounded-[6px] p-5 flex flex-col min-h-[520px]">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-[#dbd6c7]">
              <h2 className="font-serif text-lg font-bold text-[#33312e]">進行中</h2>
              <span id="counter-progress" className="flex items-center justify-center min-w-[24px] h-[24px] px-1.5 rounded-full text-xs font-bold text-white bg-[#cba135]">
                {progressTasks.length}
              </span>
            </div>

            <div className="flex flex-col gap-3 mb-5 flex-grow font-sans">
              {progressTasks.length === 0 ? (
                <div className="text-xs text-[#b0aaa0] text-center py-8 border border-dashed border-[#dbd6c7] rounded-[6px]">
                  暫無任務
                </div>
              ) : (
                progressTasks.map(task => (
                  <div key={task.id} className="bg-white border border-[#dbd6c7] rounded-[6px] p-4 flex flex-col gap-3 group transition-all hover:border-[#78736a]">
                    <p className="text-sm font-sans text-[#33312e] break-all whitespace-pre-wrap leading-relaxed">
                      {task.content}
                    </p>
                    <div className="flex justify-between items-center border-t border-[#f0ede6] pt-2.5 mt-1">
                      <div className="flex gap-2">
                        <button
                          id={`move-left-${task.id}`}
                          onClick={() => handleMove(task.id, 'left')}
                          className="border border-[#dbd6c7] hover:border-[#33312e] hover:bg-[#f5f3ee] text-[#78736a] hover:text-[#33312e] p-1 rounded-[6px] transition-all cursor-pointer"
                          title="移至待辦"
                        >
                          <ArrowLeft className="w-4.5 h-4.5" />
                        </button>
                        <button
                          id={`move-right-${task.id}`}
                          onClick={() => handleMove(task.id, 'right')}
                          className="border border-[#dbd6c7] hover:border-[#33312e] hover:bg-[#f5f3ee] text-[#78736a] hover:text-[#33312e] p-1 rounded-[6px] transition-all cursor-pointer"
                          title="移至完成"
                        >
                          <ArrowRight className="w-4.5 h-4.5" />
                        </button>
                      </div>
                      <button
                        id={`delete-${task.id}`}
                        onClick={() => handleDelete(task.id)}
                        className="text-[#bfa397] hover:text-[#e07a5f] p-1 rounded-[6px] hover:bg-[#fdf5f2] border border-transparent hover:border-[#e07a5f] transition-all cursor-pointer"
                        title="刪除"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              id="form-add-progress"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddTask('progress', progressInput);
              }}
              className="flex gap-2 border-t border-[#dbd6c7] pt-4 mt-auto"
            >
              <input
                id="input-add-progress"
                type="text"
                value={progressInput}
                onChange={(e) => setProgressInput(e.target.value)}
                placeholder="新增進行中任務..."
                required
                className="flex-1 bg-white border border-[#dbd6c7] text-sm rounded-[6px] px-3 py-2 text-[#33312e] placeholder-[#b0aaa0] focus:outline-none focus:border-[#e07a5f] focus:ring-1 focus:ring-[#e07a5f] transition-all font-sans"
              />
              <button
                id="btn-add-progress"
                type="submit"
                className="bg-[#e07a5f] hover:bg-[#d16e53] text-white px-4 py-2 text-sm rounded-[6px] font-sans font-medium transition-colors cursor-pointer shrink-0"
              >
                新增
              </button>
            </form>
          </section>

          {/* DONE COLUMN */}
          <section id="column-done" className="bg-[#edeae3] border border-[#dbd6c7] rounded-[6px] p-5 flex flex-col min-h-[520px]">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-[#dbd6c7]">
              <h2 className="font-serif text-lg font-bold text-[#33312e]">完成</h2>
              <span id="counter-done" className="flex items-center justify-center min-w-[24px] h-[24px] px-1.5 rounded-full text-xs font-bold text-white bg-[#859b84]">
                {doneTasks.length}
              </span>
            </div>

            <div className="flex flex-col gap-3 mb-5 flex-grow font-sans">
              {doneTasks.length === 0 ? (
                <div className="text-xs text-[#b0aaa0] text-center py-8 border border-dashed border-[#dbd6c7] rounded-[6px]">
                  暫無任務
                </div>
              ) : (
                doneTasks.map(task => (
                  <div key={task.id} className="bg-white border border-[#dbd6c7] rounded-[6px] p-4 flex flex-col gap-3 group transition-all hover:border-[#78736a]">
                    <p className="text-sm font-sans text-[#78736a] line-through opacity-75 break-all whitespace-pre-wrap leading-relaxed">
                      {task.content}
                    </p>
                    <div className="flex justify-between items-center border-t border-[#f0ede6] pt-2.5 mt-1">
                      <div className="flex gap-2">
                        <button
                          id={`move-left-${task.id}`}
                          onClick={() => handleMove(task.id, 'left')}
                          className="border border-[#dbd6c7] hover:border-[#33312e] hover:bg-[#f5f3ee] text-[#78736a] hover:text-[#33312e] p-1 rounded-[6px] transition-all cursor-pointer"
                          title="移至進行中"
                        >
                          <ArrowLeft className="w-4.5 h-4.5" />
                        </button>
                      </div>
                      <button
                        id={`delete-${task.id}`}
                        onClick={() => handleDelete(task.id)}
                        className="text-[#bfa397] hover:text-[#e07a5f] p-1 rounded-[6px] hover:bg-[#fdf5f2] border border-transparent hover:border-[#e07a5f] transition-all cursor-pointer"
                        title="刪除"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              id="form-add-done"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddTask('done', doneInput);
              }}
              className="flex gap-2 border-t border-[#dbd6c7] pt-4 mt-auto"
            >
              <input
                id="input-add-done"
                type="text"
                value={doneInput}
                onChange={(e) => setDoneInput(e.target.value)}
                placeholder="新增已完成任務..."
                required
                className="flex-1 bg-white border border-[#dbd6c7] text-sm rounded-[6px] px-3 py-2 text-[#33312e] placeholder-[#b0aaa0] focus:outline-none focus:border-[#e07a5f] focus:ring-1 focus:ring-[#e07a5f] transition-all font-sans"
              />
              <button
                id="btn-add-done"
                type="submit"
                className="bg-[#e07a5f] hover:bg-[#d16e53] text-white px-4 py-2 text-sm rounded-[6px] font-sans font-medium transition-colors cursor-pointer shrink-0"
              >
                新增
              </button>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}

