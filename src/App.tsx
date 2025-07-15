import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Download, Trash2, Settings, Sparkles, Bot, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { vad } from '@ricky0123/vad-web';
import SettingsModal from './components/SettingsModal';

interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: Date;
  confidence?: number;
}

interface AISuggestion {
  id: string;
  content: string;
  timestamp: Date;
  type: 'suggestion' | 'summary';
}

interface STTMessage {
  uid?: string;
  message?: string;
  backend?: string;
  text?: string;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'ready'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  
  // Settings state
  const [suggestionPrompt, setSuggestionPrompt] = useState(
    'Based on this conversation, provide helpful insights, key points, action items, and relevant follow-up suggestions.'
  );
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-1.5-flash');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const vadRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptCountRef = useRef(0);
  const wordCountRef = useRef(0);

  // Load settings from localStorage
  useEffect(() => {
    const savedPrompt = localStorage.getItem('suggestionPrompt');
    const savedApiKey = localStorage.getItem('geminiApiKey');
    const savedModel = localStorage.getItem('geminiModel');
    
    if (savedPrompt) setSuggestionPrompt(savedPrompt);
    if (savedApiKey) setGeminiApiKey(savedApiKey);
    if (savedModel) setGeminiModel(savedModel);
  }, []);

  // Save settings to localStorage
  const updatePrompt = (prompt: string) => {
    setSuggestionPrompt(prompt);
    localStorage.setItem('suggestionPrompt', prompt);
  };

  const updateGeminiApiKey = (key: string) => {
    setGeminiApiKey(key);
    localStorage.setItem('geminiApiKey', key);
  };

  const updateGeminiModel = (model: string) => {
    setGeminiModel(model);
    localStorage.setItem('geminiModel', model);
  };

  const connectWebSocket = useCallback(() => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');
    const ws = new WebSocket('ws://localhost:9090');
    
    ws.onopen = () => {
      console.log('[STT Server] Connected to WebSocket');
      setConnectionStatus('connected');
    };
    
    ws.onmessage = (event) => {
      try {
        const data: STTMessage = JSON.parse(event.data);
        console.log('[STT Server Message]', data);
        
        // Handle different message types
        if (data.message === 'SERVER_READY') {
          console.log('[STT Server] Server is ready, backend:', data.backend);
          setConnectionStatus('ready');
          return;
        }
        
        if (data.text && data.text.trim()) {
          const newSegment: TranscriptSegment = {
            id: Date.now().toString(),
            text: data.text.trim(),
            timestamp: new Date(),
            confidence: data.segments?.[0] ? 1.0 : undefined
          };
          
          setTranscript(prev => [...prev, newSegment]);
          transcriptCountRef.current += 1;
          wordCountRef.current += data.text.trim().split(' ').length;
          
          // Auto-generate suggestions and summaries if API key is available
          if (geminiApiKey) {
            // Generate suggestions every 5 segments or 50 words
            if (transcriptCountRef.current % 5 === 0 || wordCountRef.current >= 50) {
              generateAISuggestion('suggestion');
              wordCountRef.current = 0; // Reset word count after suggestion
            }
            
            // Generate summary every 8 segments or 100 words
            if (transcriptCountRef.current % 8 === 0 || wordCountRef.current >= 100) {
              generateAISuggestion('summary');
            }
          }
        }
      } catch (error) {
        console.error('[STT Server] Error parsing message:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('[STT Server] WebSocket connection closed');
      setConnectionStatus('disconnected');
      // Attempt to reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
      console.error('[STT Server] WebSocket error:', error);
      setConnectionStatus('disconnected');
    };
    
    websocketRef.current = ws;
  }, [geminiApiKey]);

  const generateAISuggestion = async (type: 'suggestion' | 'summary') => {
    if (!geminiApiKey || transcript.length === 0) return;
    
    setIsProcessing(true);
    
    try {
      const recentTranscript = transcript.slice(-10).map(t => t.text).join(' ');
      const prompt = type === 'summary' 
        ? `Please provide a comprehensive summary of this conversation: "${recentTranscript}". ${suggestionPrompt}`
        : `${suggestionPrompt} Recent conversation: "${recentTranscript}"`;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data = await response.json();
      const suggestion = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (suggestion) {
        const newSuggestion: AISuggestion = {
          id: Date.now().toString(),
          content: suggestion,
          timestamp: new Date(),
          type
        };
        
        setSuggestions(prev => [...prev, newSuggestion]);
      }
    } catch (error) {
      console.error('Error generating AI suggestion:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const setupAudioWorklet = async (stream: MediaStream) => {
    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      await audioContext.audioWorklet.addModule('/audio-sender-processor.js');
      
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'audio-sender-processor');
      
      workletNode.port.onmessage = (event) => {
        if (websocketRef.current?.readyState === WebSocket.OPEN && !isMuted) {
          const audioData = event.data.audioData;
          const buffer = new ArrayBuffer(audioData.length * 4);
          const view = new Float32Array(buffer);
          view.set(audioData);
          websocketRef.current.send(buffer);
        }
      };
      
      source.connect(workletNode);
      
      audioContextRef.current = audioContext;
      workletNodeRef.current = workletNode;
    } catch (error) {
      console.error('Error setting up audio worklet:', error);
    }
  };

  const setupVAD = async (stream: MediaStream) => {
    try {
      const vadInstance = await vad({
        stream,
        onSpeechStart: () => {
          console.log('[VAD] Speech started');
        },
        onSpeechEnd: () => {
          console.log('[VAD] Speech ended');
        },
        onVADMisfire: () => {
          console.log('[VAD] VAD misfire');
        }
      });
      
      vadRef.current = vadInstance;
    } catch (error) {
      console.error('Error setting up VAD:', error);
    }
  };

  const startRecording = async () => {
    try {
      connectWebSocket();
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      streamRef.current = stream;
      
      await setupAudioWorklet(stream);
      await setupVAD(stream);
      
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Error accessing microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (vadRef.current) {
      vadRef.current.destroy();
      vadRef.current = null;
    }
    
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    workletNodeRef.current = null;
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const clearTranscript = () => {
    setTranscript([]);
    setSuggestions([]);
    transcriptCountRef.current = 0;
    wordCountRef.current = 0;
  };

  const downloadTranscript = () => {
    const content = transcript.map(t => 
      `[${t.timestamp.toLocaleTimeString()}] ${t.text}`
    ).join('\n');
    
    const suggestionsContent = suggestions.map(s => 
      `\n[${s.type.toUpperCase()} - ${s.timestamp.toLocaleTimeString()}] ${s.content}`
    ).join('\n');
    
    const fullContent = content + '\n\n--- AI SUGGESTIONS & SUMMARIES ---' + suggestionsContent;
    
    const blob = new Blob([fullContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-yellow-600';
      case 'ready': return 'text-green-600';
      case 'connecting': return 'text-blue-600';
      default: return 'text-red-600';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'ready': return 'Ready';
      case 'connecting': return 'Connecting...';
      default: return 'Disconnected';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">
            Live Transcription & AI Assistant
          </h1>
          <p className="text-slate-600">
            Real-time speech-to-text with intelligent AI suggestions
          </p>
          <div className={`text-sm font-medium mt-2 ${getConnectionStatusColor()}`}>
            STT Server: {getConnectionStatusText()}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={connectionStatus === 'connecting'}
            className={`flex items-center space-x-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
            } ${connectionStatus === 'connecting' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {connectionStatus === 'connecting' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
            <span>
              {connectionStatus === 'connecting' 
                ? 'Connecting...' 
                : isRecording 
                  ? 'Stop Recording' 
                  : 'Start Recording'
              }
            </span>
          </button>

          {isRecording && (
            <button
              onClick={toggleMute}
              className={`flex items-center space-x-2 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                isMuted
                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                  : 'bg-slate-600 hover:bg-slate-700 text-white'
              }`}
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center space-x-2 px-4 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-medium transition-all duration-200"
          >
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </button>

          <button
            onClick={downloadTranscript}
            disabled={transcript.length === 0}
            className="flex items-center space-x-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all duration-200"
          >
            <Download className="h-5 w-5" />
            <span>Download</span>
          </button>

          <button
            onClick={clearTranscript}
            disabled={transcript.length === 0}
            className="flex items-center space-x-2 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all duration-200"
          >
            <Trash2 className="h-5 w-5" />
            <span>Clear</span>
          </button>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Transcript Panel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 h-96 flex flex-col">
              <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center">
                  <Mic className="h-5 w-5 mr-2 text-blue-600" />
                  Live Transcript
                  {isRecording && (
                    <div className="ml-3 flex items-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></div>
                      <span className="text-sm text-red-600 font-medium">Recording</span>
                    </div>
                  )}
                </h2>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto">
                {transcript.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <Mic className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Start recording to see live transcription</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transcript.map((segment) => (
                      <div key={segment.id} className="group">
                        <div className="flex items-start space-x-3">
                          <div className="text-xs text-slate-400 mt-1 min-w-[60px]">
                            {segment.timestamp.toLocaleTimeString()}
                          </div>
                          <div className="flex-1 text-slate-700 leading-relaxed">
                            {segment.text}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Suggestions Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 h-96 flex flex-col">
              <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-blue-50 rounded-t-xl">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center">
                  <Bot className="h-5 w-5 mr-2 text-purple-600" />
                  AI Insights
                  {isProcessing && (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin text-purple-600" />
                  )}
                </h2>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto">
                {!geminiApiKey ? (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="mb-2">Configure Gemini API</p>
                      <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="text-blue-600 hover:text-blue-700 text-sm underline"
                      >
                        Open Settings
                      </button>
                    </div>
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>AI suggestions will appear here</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {suggestions.map((suggestion) => (
                      <div key={suggestion.id} className={`p-3 rounded-lg border-l-4 ${
                        suggestion.type === 'summary' 
                          ? 'bg-blue-50 border-blue-400' 
                          : 'bg-purple-50 border-purple-400'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-medium uppercase tracking-wide ${
                            suggestion.type === 'summary' ? 'text-blue-600' : 'text-purple-600'
                          }`}>
                            {suggestion.type === 'summary' ? 'Summary' : 'Suggestion'}
                          </span>
                          <span className="text-xs text-slate-400">
                            {suggestion.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {suggestion.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-6 text-center text-sm text-slate-500">
          {transcript.length > 0 && (
            <span>
              {transcript.length} segments • {transcript.reduce((acc, t) => acc + t.text.split(' ').length, 0)} words
              {suggestions.length > 0 && ` • ${suggestions.length} AI insights`}
            </span>
          )}
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        suggestionPrompt={suggestionPrompt}
        onUpdatePrompt={updatePrompt}
        geminiApiKey={geminiApiKey}
        onUpdateGeminiApiKey={updateGeminiApiKey}
        geminiModel={geminiModel}
        onUpdateGeminiModel={updateGeminiModel}
      />
    </div>
  );
}