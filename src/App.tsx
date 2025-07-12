import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Download, Trash2, Search, Send, Bot, User, Lightbulb, Settings } from 'lucide-react';
import SettingsModal from './components/SettingsModal';

interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: Date;
  confidence?: number;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Suggestion {
  id: string;
  content: string;
  timestamp: Date;
}

const defaultSuggestionPrompt = 'Based on this conversation, provide helpful insights, key points, action items, and relevant follow-up suggestions.';

function App() {
  // ... [rest of the code remains exactly the same until the end]
}

export default App;