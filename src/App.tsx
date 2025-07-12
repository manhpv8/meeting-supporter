import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Download, Trash2, Search, Send, Bot, User, Lightbulb, Settings, AlertCircle } from 'lucide-react';
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

const defaultSuggestionPrompt = 'Based on this conversation, provide helpful insights, key points, action items, and relevant follow-up suggestions.';
const defaultGeminiModel = 'gemini-1.5-flash';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isTyping, setIsTyping] = useState(false); // Used for user chat response loading
  const [showSettings, setShowSettings] = useState(false);
  const [suggestionPrompt, setSuggestionPrompt] = useState<string>(defaultSuggestionPrompt);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>(defaultGeminiModel);
  const [lastSummaryLength, setLastSummaryLength] = useState(0);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false); // Loading state for auto summary
  const [lastSuggestionLength, setLastSuggestionLength] = useState(0);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false); // Loading state for auto suggestion

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        if (finalTranscript) {
          const newSegment: TranscriptSegment = {
            id: Date.now().toString(),
            text: finalTranscript,
            timestamp: new Date(),
            confidence: event.results[event.results.length - 1][0].confidence
          };
          setTranscript(prev => {
            const updatedTranscript = [...prev, newSegment];
            generateAutoSuggestions(updatedTranscript);
            checkAndGenerateAutoSummary(updatedTranscript);
            return updatedTranscript;
          });
          setCurrentText('');
        } else {
          setCurrentText(interimTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error === 'aborted' && !isRecording) {
          console.log('Speech recognition stopped by user');
        } else {
          console.error('Speech recognition error:', event.error);
        }
      };

      recognitionRef.current.onend = () => {
        if (isRecording) {
          recognitionRef.current.start();
        }
      };
    }
  }, [isRecording]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, currentText]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages, isTyping, isGeneratingSummary, isGeneratingSuggestion]); // Add loading states to chat scroll dependency

  const startRecording = () => {
    if (recognitionRef.current) {
      setIsRecording(true);
      recognitionRef.current.start();
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      setIsRecording(false);
      recognitionRef.current.stop();
    }
  };

  const clearTranscript = () => {
    setTranscript([]);
    setCurrentText('');
  };

  const clearAll = () => {
    clearTranscript();
    setChatMessages([]);
    setChatInput('');
    setLastSummaryLength(0);
    setLastSuggestionLength(0);
  };

  const generateAutoSuggestions = async (segments: TranscriptSegment[]) => {
    if (!geminiApiKey.trim()) return;
    if (segments.length === 0) return;

    const fullTranscription = segments.map(s => s.text).join(' ');
    const totalWords = fullTranscription.split(' ').length;

    // Generate suggestions every 5 words or every 2 segments for more frequent updates
    const shouldGenerateSuggestion =
      totalWords >= lastSuggestionLength + 5 ||
      (segments.length >= 2 && segments.length % 2 === 0);

    if (shouldGenerateSuggestion && !isGeneratingSuggestion) {
      setIsGeneratingSuggestion(true);
      try {
        const suggestionPromptText = `${suggestionPrompt}

Please provide specific, actionable suggestions based on the current conversation. Focus on:
- Key insights that can be extracted
- Important points that should be noted
- Potential action items or follow-ups
- Questions that might arise from the discussion

Keep the response concise (max 150 words) and practical.

Current conversation:
${fullTranscription}`;

        const suggestion = await callGeminiAPI(fullTranscription, suggestionPromptText);

        const suggestionMessage: ChatMessage = {
          id: `auto-suggestion-${Date.now()}`,
          type: 'assistant',
          content: `💡 **AI Suggestion**: ${suggestion}`,
          timestamp: new Date()
        };

        setChatMessages(prev => [...prev, suggestionMessage]);
        setLastSuggestionLength(totalWords); // Update length after successful generation
      } catch (error) {
        console.error('Auto suggestion error:', error);
        // Don't show error messages for auto suggestions to avoid spam in chat
      } finally {
        setIsGeneratingSuggestion(false);
      }
    }
  };

  const downloadTranscript = () => {
    const fullText = transcript.map(segment =>
      `[${segment.timestamp.toLocaleTimeString()}] ${segment.text}`
    ).join('\n');

    const blob = new Blob([fullText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const checkAndGenerateAutoSummary = async (segments: TranscriptSegment[]) => {
    if (!geminiApiKey.trim()) {
      // Show message about needing API key only once
      if (segments.length === 5 && !chatMessages.some(msg => msg.content.includes('Gemini API key'))) {
        const apiKeyMessage: ChatMessage = {
          id: `api-key-notice-${Date.now()}`,
          type: 'assistant',
          content: '🔑 **Setup Required**: Please configure your Gemini API key in Settings to enable automatic AI summaries and advanced suggestions.',
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, apiKeyMessage]);
      }
      return;
    }

    const fullTranscription = segments.map(s => s.text).join(' ');
    const totalWords = fullTranscription.split(' ').length;

    // Generate summary every 100 words or every 8 segments
    const shouldGenerateSummary =
      totalWords >= lastSummaryLength + 100 ||
      (segments.length >= 10 && segments.length % 8 === 0);

    if (shouldGenerateSummary && !isGeneratingSummary) {
      setIsGeneratingSummary(true);
      try {
        const summaryPrompt = `${suggestionPrompt}

Please provide a concise summary of the current conversation (max 200 words). Focus on key points, main topics, and any conclusions or decisions.

Current conversation:
${fullTranscription}`;

        const summary = await callGeminiAPI(fullTranscription, summaryPrompt);

        const summaryMessage: ChatMessage = {
          id: `auto-summary-${Date.now()}`,
          type: 'assistant',
          content: `🤖 **AI Summary**: ${summary}`,
          timestamp: new Date()
        };

        setChatMessages(prev => [...prev, summaryMessage]);
        setLastSummaryLength(totalWords); // Update length after successful generation
      } catch (error) {
        console.error('Gemini API error:', error);
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          type: 'assistant',
          content: `❌ **Error**: Failed to generate AI summary. Please check your API key and try again.`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsGeneratingSummary(false);
      }
    }
  };

  const callGeminiAPI = async (transcriptionText: string, prompt: string): Promise<string> => {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

    const requestBody = {
      contents: [{
        parts: [{
          text: `${prompt}\n\nTranscription to analyze:\n${transcriptionText}`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response from Gemini API');
    }

    return data.candidates[0].content.parts[0].text;
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: chatInput,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsTyping(true); // Set isTyping to true when user sends a message

    // Generate AI response using Gemini API
    generateChatResponse(chatInput, transcript);
  };

  const generateChatResponse = async (question: string, transcriptSegments: TranscriptSegment[]) => {
    try {
      let responseContent: string;

      const fullTranscript = transcriptSegments.map(s => s.text).join(' ');

      if (!geminiApiKey.trim()) {
        responseContent = `🔑 **Setup Required**: Please configure your Gemini API key in Settings for advanced AI responses. You can ask about summaries, key points, or action items based on the current transcription.`;
      } else {
        const chatPrompt = `You are an AI assistant helping with transcription analysis. Your goal is to provide concise, helpful, and accurate answers based *only* on the provided transcription. If the information isn't in the transcription, state that you don't have enough information from the current conversation.

Context: The user has been recording a conversation/meeting and has the following transcription:

Transcription: "${fullTranscript}"

User Question: "${question}"

Please provide a helpful, accurate response based on the transcription content. If the transcription is empty or the question cannot be answered solely from the transcription, state that. Prioritize brevity and direct answers.`;

        responseContent = await callGeminiAPI(fullTranscript, chatPrompt);
      }

      const assistantMessage: ChatMessage = {
        id: `chat-response-${Date.now()}`,
        type: 'assistant',
        content: responseContent,
        timestamp: new Date()
      };

      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat response error:', error);
      const errorMessage: ChatMessage = {
        id: `chat-error-${Date.now()}`,
        type: 'assistant',
        content: `❌ **Error**: Failed to generate response. ${!geminiApiKey.trim() ? 'Please configure your Gemini API key in Settings.' : 'Please check your API key and try again.'}`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false); // Set isTyping to false once response is received or error occurs
    }
  };

  const highlightText = (text: string, searchTerm: string) => {
    if (!searchTerm) return text;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-300">$1</mark>');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-lg">
                <Mic className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">LiveNote Pro</h1>
                <p className="text-sm text-slate-600">Real-time transcription & AI assistance</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  isRecording
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
                }`}
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                <span>{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
              </button>

              <button
                onClick={downloadTranscript}
                disabled={transcript.length === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-all disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                <span>Export</span>
              </button>

              <button
                onClick={clearAll}
                disabled={transcript.length === 0 && chatMessages.length === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-all disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
                <span>Clear All</span>
              </button>

              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-all"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
          {/* Transcription Panel */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Live Transcription</h2>
              <div className="flex items-center space-x-3">
                <div className="relative">
                  {!geminiApiKey.trim() && (
                    <div className="absolute -top-2 -right-2 z-10">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    </div>
                  )}
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search transcript..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {isRecording && (
                  <div className="flex items-center space-x-2 text-red-600">
                    <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium">Recording</span>
                  </div>
                )}
              </div>
            </div>

            <div ref={transcriptRef} className="flex-1 p-4 overflow-y-auto space-y-3">
              {transcript.length === 0 && !currentText ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <div className="text-center">
                    <Mic className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                    <p className="text-lg">Start recording to see live transcription</p>
                    <p className="text-sm mt-2">Your speech will appear here in real-time</p>
                  </div>
                </div>
              ) : (
                <>
                  {transcript.map((segment) => (
                    <div key={segment.id} className="flex space-x-3 group">
                      <div className="flex-shrink-0 text-xs text-slate-500 w-16">
                        {segment.timestamp.toLocaleTimeString()}
                      </div>
                      <div
                        className="flex-1 text-slate-900 leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: highlightText(segment.text, searchTerm)
                        }}
                      />
                      {segment.confidence && (
                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className={`text-xs px-2 py-1 rounded ${
                            segment.confidence > 0.8 ? 'bg-green-100 text-green-700' :
                            segment.confidence > 0.6 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {Math.round(segment.confidence * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  {currentText && (
                    <div className="flex space-x-3 opacity-60">
                      <div className="flex-shrink-0 text-xs text-slate-500 w-16">
                        {new Date().toLocaleTimeString()}
                      </div>
                      <div className="flex-1 text-slate-900 leading-relaxed italic">
                        {currentText}
                        <span className="animate-pulse">|</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Chat & Suggestions Panel */}
          <div className="space-y-6">

            {/* Chat */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[600px]">
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900">AI Assistant</h3>
                <p className="text-sm text-slate-600">
                  {geminiApiKey.trim() ?
                    'AI-powered suggestions and Q&A about your transcription' :
                    'Configure Gemini API in Settings for advanced AI features'
                  }
                </p>
                {!geminiApiKey.trim() && (
                  <div className="mt-2 flex items-center space-x-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">Gemini API key required for AI summaries</span>
                  </div>
                )}
              </div>

              <div ref={chatRef} className="flex-1 p-4 overflow-y-auto space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-slate-500 py-8">
                    <Bot className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">
                      {geminiApiKey.trim() ?
                        'Start recording to receive real-time AI suggestions!' :
                        'Configure Gemini API key to enable AI features'
                      }
                    </p>
                  </div>
                ) : (
                  chatMessages.map((message) => (
                    <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex items-start space-x-2 max-w-[80%] ${message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                          message.type === 'user' ? 'bg-blue-600' : 'bg-slate-600'
                        }`}>
                          {message.type === 'user' ?
                            <User className="h-4 w-4 text-white" /> :
                            <Bot className="h-4 w-4 text-white" />
                          }
                        </div>
                        <div className={`rounded-lg px-4 py-2 ${
                          message.type === 'user'
                            ? 'bg-blue-600 text-white'
                            : message.content.includes('💡') || message.content.includes('🤖') ? 'bg-blue-50 text-blue-900 border border-blue-200' :
                              message.content.includes('🔑') ? 'bg-amber-50 text-amber-900 border border-amber-200' :
                              message.content.includes('❌') ? 'bg-red-50 text-red-900 border border-red-200' :
                              'bg-slate-100 text-slate-900'
                        }`}>
                          <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                          <p className={`text-xs mt-1 ${
                            message.type === 'user' ? 'text-blue-100' :
                            message.content.includes('💡') || message.content.includes('🤖') ? 'text-blue-600' :
                            message.content.includes('🔑') ? 'text-amber-600' :
                            message.content.includes('❌') ? 'text-red-600' :
                            'text-slate-500'
                          }`}>
                            {message.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {/* Unified Loading/Analyzing Message */}
                {(isTyping || isGeneratingSummary || isGeneratingSuggestion) && (
                  <div className="flex justify-start">
                    <div className="flex items-start space-x-2 max-w-[80%]">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="bg-slate-100 rounded-lg px-4 py-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-slate-600">
                            {isGeneratingSummary && "Generating AI summary..."}
                            {isGeneratingSuggestion && "Generating AI suggestion..."}
                            {isTyping && "Assistant analyzing..."}
                          </span>
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleChatSubmit} className="p-4 border-t border-slate-200">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about the transcription..."
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        suggestionPrompt={suggestionPrompt}
        onUpdatePrompt={setSuggestionPrompt}
        geminiApiKey={geminiApiKey}
        onUpdateGeminiApiKey={setGeminiApiKey}
        geminiModel={geminiModel}
        onUpdateGeminiModel={setGeminiModel}
      />
    </div>
  );
}

export default App;