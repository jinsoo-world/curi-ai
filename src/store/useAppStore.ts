import { create } from 'zustand'
import type { AppState, User, Mentor, ChatSession, Message } from '@/types'

export const useAppStore = create<AppState>((set) => ({
    user: null,
    currentMentor: null,
    currentSession: null,
    messages: [],
    isStreaming: false,
    sidebarOpen: false,

    setUser: (user: User | null) => set({ user }),
    setCurrentMentor: (mentor: Mentor | null) => set({ currentMentor: mentor }),
    setCurrentSession: (session: ChatSession | null) =>
        set({ currentSession: session }),
    setMessages: (messages: Message[]) => set({ messages }),
    addMessage: (message: Message) =>
        set((state) => ({ messages: [...state.messages, message] })),
    setIsStreaming: (isStreaming: boolean) => set({ isStreaming }),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}))
