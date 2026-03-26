import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, MessageCircle, ArrowLeft } from 'lucide-react'
import { messagesApi } from '@/lib/api'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getInitials, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

function ThreadList({ threads, activeId, onSelect }) {
  if (!threads?.length) return (
    <div className="text-center py-12 text-gray-400">
      <MessageCircle size={36} className="mx-auto mb-3 opacity-30" />
      <p className="text-sm">No conversations yet</p>
    </div>
  )
  return (
    <div className="space-y-0.5">
      {threads.map(t => {
        const other = t.other_user
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left border-l-4',
              activeId === t.id ? 'border-pixel-accent bg-gray-100' : 'border-transparent hover:bg-gray-100'
            )}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-pixel-accent font-bold text-sm shrink-0 text-gray-900">
              {getInitials(other?.first_name, other?.last_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-semibold truncate', activeId === t.id ? 'text-pixel-accent' : 'text-gray-900')}>
                {other?.first_name} {other?.last_name}
              </p>
              {t.last_message && (
                <p className="text-xs text-gray-500 truncate mt-0.5">{t.last_message}</p>
              )}
            </div>
            {t.unread_count > 0 && (
              <span className="w-5 h-5 rounded-full bg-pixel-accent text-gray-900 text-xs flex items-center justify-center font-bold shrink-0">
                {t.unread_count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function MessageBubble({ msg, isOwn }) {
  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] px-4 py-2.5 text-sm rounded-2xl',
          isOwn
            ? 'bg-pixel-accent text-gray-900 rounded-br-sm'
            : 'bg-white border border-pixel-border text-gray-900 rounded-bl-sm'
        )}
      >
        <p>{msg.content}</p>
        <p className={cn('text-xs mt-1', isOwn ? 'text-gray-600' : 'text-gray-400')}>
          {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function ThreadView({ thread, onBack }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  const { data: messages } = useQuery({
    queryKey: ['thread', thread.id],
    queryFn: () => messagesApi.getThread(thread.id).then(r => r.data.data),
    refetchInterval: 5000,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const { mutate: send, isPending } = useMutation({
    mutationFn: () => messagesApi.send({ thread_id: thread.id, content: text }),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['thread', thread.id] })
      qc.invalidateQueries({ queryKey: ['threads'] })
    },
  })

  const handleSend = () => {
    if (!text.trim()) return
    send()
  }

  const other = thread.other_user

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b-2 border-pixel-border shrink-0 bg-pixel-surface">
        <button onClick={onBack} className="btn-ghost p-1.5 md:hidden">
          <ArrowLeft size={18} />
        </button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-pixel-accent font-bold text-sm shrink-0 text-gray-900">
          {getInitials(other?.first_name, other?.last_name)}
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">
            {other?.first_name} {other?.last_name}
          </p>
          <p className="text-xs text-gray-500 capitalize">{other?.role?.toLowerCase()}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-pixel-bg">
        {messages?.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_id === user?.id} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-4 py-3 border-t-2 border-pixel-border flex items-center gap-2 bg-pixel-surface shrink-0">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="TYPE A MESSAGE..."
          className="input flex-1 py-2.5"
        />
        <button
          onClick={handleSend}
          disabled={isPending || !text.trim()}
          className="btn-primary p-2.5"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

export default function MessagingPage() {
  const [activeThread, setActiveThread] = useState(null)

  const { data: threads, isLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: () => messagesApi.listThreads().then(r => r.data.data),
    refetchInterval: 10000,
  })

  const showThread = activeThread !== null

  return (
    <div className="h-[calc(100vh-4rem)] md:h-screen flex max-w-4xl mx-auto">
      {/* Thread list */}
      <div className={cn(
        'md:w-72 md:border-r-2 border-pixel-border flex flex-col bg-pixel-surface',
        showThread ? 'hidden md:flex' : 'flex w-full'
      )}>
        <div className="px-4 py-4 border-b-2 border-pixel-border">
          <h1 className="page-header">Messages</h1>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <ThreadList
              threads={threads}
              activeId={activeThread?.id}
              onSelect={setActiveThread}
            />
          )}
        </div>
      </div>

      {/* Thread view */}
      <div className={cn(
        'flex-1 flex flex-col',
        !showThread ? 'hidden md:flex' : 'flex'
      )}>
        {activeThread ? (
          <ThreadView thread={activeThread} onBack={() => setActiveThread(null)} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageCircle size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a conversation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
