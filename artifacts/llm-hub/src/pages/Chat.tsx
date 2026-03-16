import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { 
  MessageSquare, Plus, Trash2, Send, Bot, User, 
  ChevronDown, Globe, HardDrive 
} from "lucide-react";
import { 
  useListConversations, 
  useCreateConversation, 
  useDeleteConversation,
  useGetMessages,
  useAddMessage,
  useSendChatMessage
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MODELS = [
  { id: "gpt-4o", name: "GPT-4o", type: "cloud", icon: Globe },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", type: "cloud", icon: Globe },
  { id: "local", name: "Local (llama.cpp)", type: "local", icon: HardDrive },
];

export default function Chat() {
  const queryClient = useQueryClient();
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState(MODELS[2].id);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [input, setInput] = useState("");

  // Queries
  const { data: conversations = [], isLoading: convsLoading } = useListConversations();
  const { data: messages = [], isLoading: msgsLoading } = useGetMessages(selectedConvId || 0, {
    query: { enabled: !!selectedConvId }
  });

  // Mutations
  const createConv = useCreateConversation();
  const deleteConv = useDeleteConversation();
  const addMsg = useAddMessage();
  const sendLocalChat = useSendChatMessage();

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendLocalChat.isPending]);

  // Actions
  const handleNewChat = () => {
    createConv.mutate({
      data: { title: "New Conversation", model: selectedModel }
    }, {
      onSuccess: (data) => {
        setSelectedConvId(data.id);
        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      }
    });
  };

  const handleDeleteChat = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConv.mutate({ id }, {
      onSuccess: () => {
        if (selectedConvId === id) setSelectedConvId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      }
    });
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedConvId) return;
    const userMsgContent = input;
    setInput("");

    // 1. Save User Message
    await addMsg.mutateAsync({
      id: selectedConvId,
      data: { role: 'user', content: userMsgContent }
    });
    
    queryClient.invalidateQueries({ queryKey: [`/api/chat/conversations/${selectedConvId}/messages`] });

    const conv = conversations.find(c => c.id === selectedConvId);
    
    // 2. Get Response
    if (conv?.model === 'local') {
      // Send to local LLM
      const formattedHistory = [...messages, { role: 'user', content: userMsgContent }].map(m => ({
        role: m.role,
        content: m.content
      }));

      try {
        const res = await sendLocalChat.mutateAsync({
          data: { messages: formattedHistory }
        });

        // 3. Save Assistant Message
        await addMsg.mutateAsync({
          id: selectedConvId,
          data: { role: 'assistant', content: res.content }
        });
        queryClient.invalidateQueries({ queryKey: [`/api/chat/conversations/${selectedConvId}/messages`] });
      } catch (err) {
        // Fallback save error
        await addMsg.mutateAsync({
          id: selectedConvId,
          data: { role: 'assistant', content: "**System Error:** Could not connect to local server." }
        });
        queryClient.invalidateQueries({ queryKey: [`/api/chat/conversations/${selectedConvId}/messages`] });
      }
    } else {
      // Stub for cloud models since we only implemented local proxy fully
      setTimeout(async () => {
        await addMsg.mutateAsync({
          id: selectedConvId,
          data: { role: 'assistant', content: `[Simulated response from ${conv?.model}] I am a stub.` }
        });
        queryClient.invalidateQueries({ queryKey: [`/api/chat/conversations/${selectedConvId}/messages`] });
      }, 1000);
    }
  };

  const activeModelObj = MODELS.find(m => m.id === selectedModel) || MODELS[2];

  return (
    <div className="flex-1 flex overflow-hidden h-full">
      {/* Sidebar */}
      <div className="w-80 border-r border-white/5 bg-background flex flex-col">
        <div className="p-4 border-b border-white/5">
          <Button onClick={handleNewChat} className="w-full gap-2 justify-start glass-panel glass-panel-hover text-foreground border-white/10 hover:text-white" variant="outline">
            <Plus className="w-4 h-4 text-primary" />
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          {convsLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No conversations yet</div>
          ) : (
            conversations.map((conv) => (
              <div 
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={cn(
                  "group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-200 border",
                  selectedConvId === conv.id 
                    ? "bg-white/10 border-white/10 text-white shadow-sm" 
                    : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-white"
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare className={cn("w-4 h-4 shrink-0", selectedConvId === conv.id ? "text-primary" : "")} />
                  <div className="truncate">
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <p className="text-[10px] opacity-60 truncate">
                      {format(new Date(conv.updatedAt), "MMM d, h:mm a")} · {conv.model}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={(e) => handleDeleteChat(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-red-400 rounded-md transition-all shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#0A0A0F] relative">
        {selectedConvId ? (
          <>
            {/* Chat Header */}
            <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between bg-background/50 backdrop-blur-md absolute top-0 w-full z-10">
              <h3 className="font-medium text-white">
                {conversations.find(c => c.id === selectedConvId)?.title}
              </h3>
              <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-xs text-muted-foreground flex items-center gap-2">
                <activeModelObj.icon className="w-3.5 h-3.5" />
                {conversations.find(c => c.id === selectedConvId)?.model}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto pt-24 pb-8 px-6 md:px-12 lg:px-24 scroll-smooth" ref={scrollRef}>
              <div className="max-w-3xl mx-auto space-y-8">
                {msgsLoading ? (
                  <div className="flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground flex flex-col items-center">
                    {/* stock image abstract 3d cube representing AI */}
                    <img 
                      src={`${import.meta.env.BASE_URL}images/empty-chat.png`}
                      alt="Start chatting"
                      className="w-48 h-48 mb-6 opacity-80"
                      onError={(e) => e.currentTarget.style.display = 'none'}
                    />
                    <p className="text-lg">This is the beginning of your conversation.</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={cn("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "")}>
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                        msg.role === 'user' 
                          ? "bg-primary/20 border-primary/30 text-primary" 
                          : "bg-accent/20 border-accent/30 text-accent"
                      )}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={cn(
                        "px-5 py-3.5 rounded-2xl max-w-[85%] text-[15px] leading-relaxed",
                        msg.role === 'user'
                          ? "bg-primary text-primary-foreground rounded-tr-none shadow-lg shadow-primary/10"
                          : "glass-panel rounded-tl-none text-foreground"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {sendLocalChat.isPending && (
                   <div className="flex gap-4">
                     <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-accent/20 border-accent/30 text-accent">
                       <Bot className="w-4 h-4" />
                     </div>
                     <div className="glass-panel rounded-2xl rounded-tl-none px-5 py-4 flex gap-1 items-center h-[52px]">
                       <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" />
                       <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce delay-75" />
                       <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce delay-150" />
                     </div>
                   </div>
                )}
              </div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-background/80 backdrop-blur-xl border-t border-white/5">
              <div className="max-w-3xl mx-auto relative flex flex-col">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                  className="relative flex items-end bg-[#18181B] border border-white/10 rounded-2xl p-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all shadow-xl"
                >
                  <textarea 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Message LLM Hub..."
                    className="w-full bg-transparent text-foreground placeholder:text-muted-foreground p-3 focus:outline-none resize-none min-h-[44px] max-h-[200px]"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="h-10 w-10 shrink-0 rounded-xl mb-1 mr-1"
                    disabled={!input.trim() || sendLocalChat.isPending || addMsg.isPending}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
                <div className="text-center mt-2">
                  <p className="text-[10px] text-muted-foreground">Local model chats remain on your machine.</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 relative z-10">
            <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 border border-white/10 rounded-3xl flex items-center justify-center mb-6 shadow-2xl backdrop-blur-xl">
              <MessageSquare className="w-10 h-10 text-white opacity-80" />
            </div>
            <h2 className="text-3xl font-display font-bold text-white mb-3">Welcome to LLM Hub</h2>
            <p className="text-muted-foreground max-w-md mb-8">
              Chat with your local llama.cpp instance or connect to cloud models. All your conversations are saved locally.
            </p>
            
            <div className="relative">
              <Button 
                variant="outline" 
                className="w-64 justify-between bg-[#18181B] border-white/10 hover:bg-[#27272A]"
                onClick={() => setShowModelSelect(!showModelSelect)}
              >
                <span className="flex items-center gap-2">
                  <activeModelObj.icon className="w-4 h-4 text-primary" />
                  {activeModelObj.name}
                </span>
                <ChevronDown className="w-4 h-4 opacity-50" />
              </Button>

              {showModelSelect && (
                <div className="absolute top-full left-0 w-full mt-2 bg-[#18181B] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setShowModelSelect(false); }}
                      className="w-full text-left px-4 py-3 text-sm flex items-center gap-3 hover:bg-white/5 transition-colors text-white"
                    >
                      <m.icon className="w-4 h-4 text-muted-foreground" />
                      {m.name}
                      {m.type === 'local' && <span className="ml-auto text-[10px] uppercase bg-primary/20 text-primary px-2 py-0.5 rounded">Local</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={handleNewChat} className="mt-6 w-64 shadow-primary/25 shadow-lg" variant="glow">
              Start Conversation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
