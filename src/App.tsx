import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Settings, Sparkles, Bot, Loader2 } from 'lucide-react';
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
  type: 'realtime' | 'fullSentence';
  text: string;
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [realtimeText, setRealtimeText] = useState('');

  // Trạng thái cài đặt AI
  const [systemPrompt, setSystemPrompt] = useState(
    'Bạn là một trợ lý cuộc họp thông minh.'
  );
  const [suggestionPrompt, setSuggestionPrompt] = useState(
    'Dựa trên câu nói gần đây, hãy cung cấp một gợi ý phản hồi hoặc câu hỏi hữu ích để tiếp tục cuộc trò chuyện.'
  );
  const [summaryPrompt, setSummaryPrompt] = useState(
    'Vui lòng tóm tắt toàn diện cuộc trò chuyện này, tập trung vào các điểm chính, quyết định và các mục hành động.'
  );
  const [summaryTriggerThreshold, setSummaryTriggerThreshold] = useState(3);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-1.5-flash');
  const [maxSuggestionsTokens, setMaxSuggestionsTokens] = useState(100); // Giá trị mặc định
  const [maxSummaryTokens, setMaxSummaryTokens] = useState(500); // Giá trị mặc định

  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const serverCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fullSentenceCountRef = useRef(0);

  // Sử dụng ref để lưu trữ giá trị cài đặt mới nhất cho các callbacks và useEffect
  const geminiApiKeyRef = useRef(geminiApiKey);
  const summaryTriggerThresholdRef = useRef(summaryTriggerThreshold);
  const systemPromptRef = useRef(systemPrompt);
  const suggestionPromptRef = useRef(suggestionPrompt);
  const summaryPromptRef = useRef(summaryPrompt);
  const maxSuggestionsTokensRef = useRef(maxSuggestionsTokens);
  const maxSummaryTokensRef = useRef(maxSummaryTokens);


  // Cập nhật ref khi state tương ứng thay đổi
  useEffect(() => {
    geminiApiKeyRef.current = geminiApiKey;
  }, [geminiApiKey]);

  useEffect(() => {
    summaryTriggerThresholdRef.current = summaryTriggerThreshold;
  }, [summaryTriggerThreshold]);

  useEffect(() => {
    systemPromptRef.current = systemPrompt;
  }, [systemPrompt]);

  useEffect(() => {
    suggestionPromptRef.current = suggestionPrompt;
  }, [suggestionPrompt]);

  useEffect(() => {
    summaryPromptRef.current = summaryPrompt;
  }, [summaryPrompt]);

  useEffect(() => {
    maxSuggestionsTokensRef.current = maxSuggestionsTokens;
  }, [maxSuggestionsTokens]);

  useEffect(() => {
    maxSummaryTokensRef.current = maxSummaryTokens;
  }, [maxSummaryTokens]);


  // Tải cài đặt từ localStorage khi component mount
  useEffect(() => {
    const savedSystemPrompt = localStorage.getItem('systemPrompt');
    const savedSuggestionPrompt = localStorage.getItem('suggestionPrompt');
    const savedSummaryPrompt = localStorage.getItem('summaryPrompt');
    const savedSummaryThreshold = localStorage.getItem('summaryTriggerThreshold');
    const savedApiKey = localStorage.getItem('geminiApiKey');
    const savedModel = localStorage.getItem('geminiModel');
    const savedMaxSuggestionsTokens = localStorage.getItem('maxSuggestionsTokens');
    const savedMaxSummaryTokens = localStorage.getItem('maxSummaryTokens');

    if (savedSystemPrompt) setSystemPrompt(savedSystemPrompt);
    if (savedSuggestionPrompt) setSuggestionPrompt(savedSuggestionPrompt);
    if (savedSummaryPrompt) setSummaryPrompt(savedSummaryPrompt);
    if (savedSummaryThreshold) setSummaryTriggerThreshold(parseInt(savedSummaryThreshold) || 3);
    if (savedApiKey) {
      setGeminiApiKey(savedApiKey);
      console.log('Gemini API Key loaded from localStorage.');
    } else {
      console.log('No Gemini API Key found in localStorage.');
    }
    if (savedModel) setGeminiModel(savedModel);
    if (savedMaxSuggestionsTokens) setMaxSuggestionsTokens(parseInt(savedMaxSuggestionsTokens) || 100);
    if (savedMaxSummaryTokens) setMaxSummaryTokens(parseInt(savedMaxSummaryTokens) || 500);
  }, []);

  // Các hàm cập nhật cài đặt và lưu vào localStorage
  const updateSystemPrompt = (prompt: string) => {
    setSystemPrompt(prompt);
    localStorage.setItem('systemPrompt', prompt);
  };

  const updateSuggestionPrompt = (prompt: string) => {
    setSuggestionPrompt(prompt);
    localStorage.setItem('suggestionPrompt', prompt);
  };

  const updateSummaryPrompt = (prompt: string) => {
    setSummaryPrompt(prompt);
    localStorage.setItem('summaryPrompt', prompt);
  };

  const updateSummaryTriggerThreshold = (threshold: number) => {
    setSummaryTriggerThreshold(threshold);
    localStorage.setItem('summaryTriggerThreshold', threshold.toString());
  };

  const updateGeminiApiKey = (key: string) => {
    setGeminiApiKey(key);
    localStorage.setItem('geminiApiKey', key);
    console.log('Gemini API Key updated and saved.');
  };

  const updateGeminiModel = (model: string) => {
    setGeminiModel(model);
    localStorage.setItem('geminiModel', model);
  };

  const updateMaxSuggestionsTokens = (tokens: number) => {
    setMaxSuggestionsTokens(tokens);
    localStorage.setItem('maxSuggestionsTokens', tokens.toString());
  };

  const updateMaxSummaryTokens = (tokens: number) => {
    setMaxSummaryTokens(tokens);
    localStorage.setItem('maxSummaryTokens', tokens.toString());
  };

  // Hàm kết nối WebSocket đến máy chủ STT
  const connectWebSocket = useCallback(() => {
    if (websocketRef.current && (websocketRef.current.readyState === WebSocket.OPEN || websocketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionStatus('connecting');
    const ws = new WebSocket("wss://5ea6a0d18294.ngrok-free.app"); // Đảm bảo URL này là chính xác

    ws.onopen = () => {
      console.log('[STT Server] Đã kết nối tới máy chủ WebSocket');
      setConnectionStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data: STTMessage = JSON.parse(event.data);
        if (data.type === 'realtime') {
          setRealtimeText(data.text);
        } else if (data.type === 'fullSentence') {
          if (data.text && data.text.trim()) {
            const newSegment: TranscriptSegment = {
              id: Date.now().toString(),
              text: data.text.trim(),
              timestamp: new Date(),
              confidence: 1.0
            };

            setTranscript(prev => [...prev, newSegment]);
            setRealtimeText('');

            // Tăng biến đếm câu hoàn chỉnh
            fullSentenceCountRef.current += 1;
          }
        }
      } catch (error) {
        console.error('[STT Server] Lỗi khi phân tích tin nhắn:', error);
      }
    };

    ws.onclose = () => {
      console.log('[STT Server] Kết nối WebSocket đã đóng');
      setConnectionStatus('disconnected');
    };

    ws.onerror = (error) => {
      console.error('[STT Server] Lỗi WebSocket:', error);
      setConnectionStatus('disconnected');
    };

    websocketRef.current = ws;
  }, []);

  // Kiểm tra trạng thái máy chủ định kỳ để tự động kết nối lại
  useEffect(() => {
    const checkServer = () => {
      if (connectionStatus === 'disconnected') {
        connectWebSocket();
      }
    };

    checkServer();
    serverCheckIntervalRef.current = setInterval(checkServer, 5000);

    return () => {
      if (serverCheckIntervalRef.current) {
        clearInterval(serverCheckIntervalRef.current);
      }
    };
  }, [connectionStatus, connectWebSocket]);

  // Hàm gọi API Gemini để tạo gợi ý hoặc tóm tắt
  const generateAIContent = useCallback(async (
    type: 'suggestion' | 'summary',
    currentApiKey: string,
    currentSystemPrompt: string,
    currentSuggestionPrompt: string,
    currentSummaryPrompt: string,
    currentGeminiModel: string,
    currentTranscript: TranscriptSegment[],
    currentMaxSuggestionsTokens: number,
    currentMaxSummaryTokens: number
  ) => {
    if (!currentApiKey || currentTranscript.length === 0) {
      console.warn(`Cannot generate AI ${type}: Missing Gemini API Key or empty transcript.`);
      return;
    }

    if (type === 'suggestion') setIsSuggesting(true);
    if (type === 'summary') setIsSummarizing(true);
    setIsProcessing(true);

    try {
      const allTranscriptText = currentTranscript.map(t => t.text).join(' ');
      const recentTranscriptText = currentTranscript.slice(-5).map(t => t.text).join(' ');

      let prompt = '';
      let maxOutputTokens = 0;
      if (type === 'summary') {
        prompt = `${currentSystemPrompt}\n${currentSummaryPrompt}\nCuộc trò chuyện: "${allTranscriptText}"`;
        maxOutputTokens = currentMaxSummaryTokens;
      } else { // type === 'suggestion'
        prompt = `${currentSystemPrompt}\n${currentSuggestionPrompt}\nCuộc trò chuyện gần đây: "${recentTranscriptText}"`;
        maxOutputTokens = currentMaxSuggestionsTokens;
      }

      console.log(`[AI Trigger] Kích hoạt tạo ${type === 'summary' ? 'Tóm tắt' : 'Gợi ý'} AI...`);
      console.log('Using Gemini API Key:', currentApiKey ? '********' + currentApiKey.slice(-4) : 'Not set');
      console.log('Using Gemini Model:', currentGeminiModel);
      console.log('Max Output Tokens:', maxOutputTokens);

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentGeminiModel}:generateContent?key=${currentApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            maxOutputTokens: maxOutputTokens,
          },
        })
      });

      if (!response.ok) {
        throw new Error(`Yêu cầu API thất bại: ${response.status} - ${await response.text()}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (content) {
        const newAIContent: AISuggestion = {
          id: Date.now().toString(),
          content: content,
          timestamp: new Date(),
          type
        };

        setSuggestions(prev => [...prev, newAIContent]);
      } else {
        console.warn(`AI response for ${type} did not contain content:`, data);
      }
    } catch (error) {
      console.error(`Lỗi khi tạo ${type} AI:`, error);
    } finally {
      if (type === 'suggestion') setIsSuggesting(false);
      if (type === 'summary') setIsSummarizing(false);
      setIsProcessing(false);
    }
  }, []); // generateAIContent không phụ thuộc vào transcript vì nó được truyền dưới dạng tham số

  // Kích hoạt AI khi transcript thay đổi (có câu hoàn chỉnh mới)
  useEffect(() => {
    if (transcript.length > 0 && geminiApiKeyRef.current) {
      const currentFullSentenceCount = fullSentenceCountRef.current;
      const currentSummaryThreshold = summaryTriggerThresholdRef.current;

      // Gợi ý luôn được kích hoạt sau mỗi câu mới
      generateAIContent(
        'suggestion',
        geminiApiKeyRef.current,
        systemPromptRef.current,
        suggestionPromptRef.current,
        summaryPromptRef.current,
        geminiModel,
        transcript, // Truyền transcript mới nhất
        maxSuggestionsTokensRef.current,
        maxSummaryTokensRef.current
      );

      // Tóm tắt được kích hoạt theo ngưỡng
      if (currentFullSentenceCount > 0 && currentFullSentenceCount % currentSummaryThreshold === 0) {
        generateAIContent(
          'summary',
          geminiApiKeyRef.current,
          systemPromptRef.current,
          suggestionPromptRef.current,
          summaryPromptRef.current,
          geminiModel,
          transcript, // Truyền transcript mới nhất
          maxSuggestionsTokensRef.current,
          maxSummaryTokensRef.current
        );
      }
    }
  }, [transcript, geminiModel, generateAIContent]); // Dependencies: transcript, geminiModel, generateAIContent

  // Thiết lập xử lý âm thanh từ microphone
  const setupAudioProcessing = async (stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(256, 1, 1);

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        if (websocketRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const outputData = new Int16Array(inputData.length);

          for (let i = 0; i < inputData.length; i++) {
            outputData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }

          const metadata = JSON.stringify({ sampleRate: audioContext.sampleRate });
          const metadataBytes = new TextEncoder().encode(metadata);
          const metadataLength = new ArrayBuffer(4);
          const metadataLengthView = new DataView(metadataLength);
          metadataLengthView.setInt32(0, metadataBytes.byteLength, true);
          const combinedData = new Blob([metadataLength, metadataBytes, outputData.buffer]);
          websocketRef.current.send(combinedData);
        }
      };

      audioContextRef.current = audioContext;
      processorRef.current = processor;
    } catch (error) {
      console.error('Lỗi khi thiết lập xử lý âm thanh:', error);
    }
  };

  // Bắt đầu ghi âm
  const startRecording = async () => {
    try {
      connectWebSocket();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      streamRef.current = stream;

      await setupAudioProcessing(stream);

      setIsRecording(true);
    } catch (error) {
      console.error('Lỗi khi bắt đầu ghi âm:', error);
      console.error('Lỗi khi truy cập micro. Vui lòng kiểm tra quyền.');
      alert('Không thể truy cập micro. Vui lòng đảm bảo bạn đã cấp quyền truy cập micro cho trang này.');
    }
  };

  // Dừng ghi âm
  const stopRecording = () => {
    setIsRecording(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    setRealtimeText('');
    fullSentenceCountRef.current = 0;
  };

  // Các hàm tiện ích cho trạng thái kết nối
  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-blue-600';
      default: return 'text-red-600';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Đã kết nối';
      case 'connecting': return 'Đang kết nối...';
      default: return 'Đã ngắt kết nối';
    }
  };

  const filteredSuggestions = suggestions.filter(s => s.type === 'suggestion');
  const filteredSummaries = suggestions.filter(s => s.type === 'summary');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 font-inter">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Tiêu đề */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">
            Ghi âm Trực tiếp & Trợ lý AI
          </h1>
          <p className="text-slate-600">
            Chuyển đổi giọng nói thành văn bản theo thời gian thực với các gợi ý AI thông minh
          </p>
          <div className={`text-sm font-medium mt-2 ${getConnectionStatusColor()}`}>
            Máy chủ STT: {getConnectionStatusText()}
          </div>
        </div>

        {/* Điều khiển */}
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
                ? 'Đang kết nối...'
                : isRecording
                  ? 'Dừng ghi âm'
                  : 'Bắt đầu ghi âm'
              }
            </span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center space-x-2 px-4 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-medium transition-all duration-200"
          >
            <Settings className="h-5 w-5" />
            <span>Cài đặt</span>
          </button>
        </div>

        {/* Lưới nội dung chính */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bảng bản ghi */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 h-96 flex flex-col">
              <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center">
                  <Mic className="h-5 w-5 mr-2 text-blue-600" />
                  Bản ghi trực tiếp
                  {isRecording && (
                    <div className="ml-3 flex items-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></div>
                      <span className="text-sm text-red-600 font-medium">Đang ghi âm</span>
                    </div>
                  )}
                </h2>
              </div>

              <div className="flex-1 p-4 overflow-y-auto">
                {transcript.length === 0 && !realtimeText ? (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <Mic className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Bắt đầu ghi âm để xem bản ghi trực tiếp</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Hiển thị văn bản thời gian thực (câu một phần hiện tại) ở trên cùng */}
                    {realtimeText && (
                      <div className="group">
                        <div className="flex items-start space-x-3">
                          <div className="text-xs text-slate-400 mt-1 min-w-[60px]">
                            {new Date().toLocaleTimeString()}
                          </div>
                          <div className="flex-1 text-slate-500 leading-relaxed italic">
                            {realtimeText}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Hiển thị các đoạn bản ghi (đã hoàn thành) theo thứ tự ngược lại */}
                    {transcript.slice().reverse().map((segment) => (
                      <div key={segment.id} className="group">
                        <div className="flex items-start space-x-3">
                          <div className="text-xs text-slate-400 mt-1 min-w-[60px]">
                            {segment.timestamp.toLocaleTimeString()}
                          </div>
                          <div className={`flex-1 leading-relaxed ${
                            transcript.indexOf(segment) % 2 === 0 ? 'text-yellow-600' : 'text-cyan-600'
                          }`}>
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

          {/* Bảng gợi ý AI */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 h-96 flex flex-col">
              <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-blue-50 rounded-t-xl">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center">
                  <Bot className="h-5 w-5 mr-2 text-purple-600" />
                  Thông tin chi tiết AI
                  {(isSummarizing || isSuggesting) && (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin text-purple-600" />
                  )}
                </h2>
              </div>

              <div className="flex-1 p-4 overflow-y-auto">
                {!geminiApiKey ? (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="mb-2">Cấu hình API Gemini</p>
                      <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="text-blue-600 hover:text-blue-700 text-sm underline"
                      >
                        Mở cài đặt
                      </button>
                    </div>
                  </div>
                ) : filteredSuggestions.length === 0 && filteredSummaries.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Gợi ý và tóm tắt AI sẽ xuất hiện ở đây</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Hiển thị các gợi ý */}
                    {filteredSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className="p-3 rounded-lg border-l-4 bg-purple-50 border-purple-400">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-purple-600">
                            Gợi ý
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

                    {/* Hiển thị các tóm tắt */}
                    {filteredSummaries.map((summary) => (
                      <div key={summary.id} className="p-3 rounded-lg border-l-4 bg-blue-50 border-blue-400">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-blue-600">
                            Tóm tắt
                          </span>
                          <span className="text-xs text-slate-400">
                            {summary.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {summary.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Thanh trạng thái */}
        <div className="mt-6 text-center text-sm text-slate-500">
          {transcript.length > 0 && (
            <span>
              {transcript.length} đoạn • {transcript.reduce((acc, t) => acc + t.text.split(' ').length, 0)} từ
              {suggestions.length > 0 && ` • ${suggestions.length} thông tin chi tiết AI`}
            </span>
          )}
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        systemPrompt={systemPrompt}
        onUpdateSystemPrompt={updateSystemPrompt}
        suggestionPrompt={suggestionPrompt}
        onUpdateSuggestionPrompt={updateSuggestionPrompt}
        summaryPrompt={summaryPrompt}
        onUpdateSummaryPrompt={updateSummaryPrompt}
        summaryTriggerThreshold={summaryTriggerThreshold}
        onUpdateSummaryTriggerThreshold={updateSummaryTriggerThreshold}
        geminiApiKey={geminiApiKey}
        onUpdateGeminiApiKey={updateGeminiApiKey}
        geminiModel={geminiModel}
        onUpdateGeminiModel={updateGeminiModel}
        maxSuggestionsTokens={maxSuggestionsTokens}
        onUpdateMaxSuggestionsTokens={updateMaxSuggestionsTokens}
        maxSummaryTokens={maxSummaryTokens}
        onUpdateMaxSummaryTokens={updateMaxSummaryTokens}
      />
    </div>
  );
}