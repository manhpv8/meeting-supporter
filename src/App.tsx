import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Download, Trash2, Search, Send, Bot, User, Lightbulb, Settings, AlertCircle } from 'lucide-react';
import SettingsModal from './components/SettingsModal';
import * as vad from '@ricky0123/vad-web'; // Correct import for vad library

// --- Global Type Definitions ---
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

// --- WebSocket Client Class ---
class TranscriptionWebSocketClient {
  private socket: WebSocket | null = null;
  public isConnected: boolean = false;
  public isRecording: boolean = false;
  private clientUid: string;
  private isInitialConfigSent: boolean = false;
  private config: any;
  private onServerMessageCallback: (data: string | ArrayBuffer) => void;
  private onConnectionCallback: () => void;
  private onDisconnectionCallback: (code: number, reason: string) => void;
  private onErrorCallback: (message: string) => void;

  constructor(config: any) {
    this.config = config;
    this.clientUid = 'client_' + Math.random().toString(36).substr(2, 9);
    this.onServerMessageCallback = config.onServerMessage;
    this.onConnectionCallback = config.onConnection;
    this.onDisconnectionCallback = config.onDisconnection;
    this.onErrorCallback = config.onError;
    console.log(`[WS Client] Initialized with UID: ${this.clientUid}`);
  }

  private generateUID(): string {
    return 'client_' + Math.random().toString(36).substr(2, 9);
  }

  public connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        console.log('[WS Client] Already connected or connecting, resolving.');
        resolve(true);
        return;
      }

      const wsUrl = `wss://${this.config.host}:${this.config.port}`;
      console.log(`[WS Client] Attempting to connect to: ${wsUrl}`);
      this.socket = new WebSocket(wsUrl);

      const connectionTimeout = setTimeout(() => {
        if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
          console.error('[WS Client] Connection timeout reached.');
          this.socket.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000); // 10 seconds timeout

      this.socket.onopen = () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.isInitialConfigSent = false; // Reset for new connection
        this.sendInitialConfig();
        if (this.onConnectionCallback) this.onConnectionCallback();
        console.log('[WS Client] WebSocket connection opened.');
        resolve(true);
      };

      this.socket.onmessage = (event) => {
        if (this.onServerMessageCallback) this.onServerMessageCallback(event.data);
      };

      this.socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.isRecording = false;
        if (wasConnected && this.onDisconnectionCallback) {
          this.onDisconnectionCallback(event.code, event.reason);
        }
        console.log(`[WS Client] WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
      };

      this.socket.onerror = (errorEvent) => {
        clearTimeout(connectionTimeout);
        this.isConnected = false;
        console.error("[WS Client] WebSocket Error:", errorEvent);
        if (this.onErrorCallback) this.onErrorCallback('WebSocket connection error');
      };
    });
  }

  private sendInitialConfig(): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && !this.isInitialConfigSent) {
      const configMessage = {
        uid: this.clientUid,
        language: this.config.language,
        task: this.config.task,
        model: this.config.model,
        use_vad: this.config.useVad,
        max_connection_time: this.config.maxConnectionTime
      };
      this.socket.send(JSON.stringify(configMessage));
      this.isInitialConfigSent = true;
      console.log("[WS Client] Sent initial config:", configMessage);
      return true;
    }
    return false;
  }

  public sendAudioData(audioData: ArrayBuffer): boolean {
    if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return false;
    }
    if (!this.isInitialConfigSent) this.sendInitialConfig();
    this.socket.send(audioData);
    return true;
  }

  public endTranscription(): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(new TextEncoder().encode("END_OF_AUDIO").buffer); // Ensure sending as ArrayBuffer
      this.isRecording = false;
      console.log("[WS Client] Sent END_OF_AUDIO signal.");
      return true;
    }
    console.warn('[WS Client] Cannot send END_OF_AUDIO: socket not open.');
    return false;
  }

  public close(): void {
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'close', uid: this.clientUid }));
        this.socket.close(1000, "Normal closure");
      }
      this.socket = null;
      this.isConnected = false;
      this.isInitialConfigSent = false;
      console.log("[WS Client] Explicitly closing WebSocket.");
    }
  }
}

// --- Audio Processor Manager ---
const AudioProcessorManager = {
  audioBuffer: null as Float32Array | null,
  bufferCapacity: null as number | null,
  bufferIndex: 0,
  bufferFull: false,
  tempBuffer: [] as Float32Array[],
  speechStartTimeout: null as NodeJS.Timeout | null,
  postDelayBuffer: [] as Float32Array[],
  lastSendTime: null as number | null,
  nativeSampleRate: null as number | null,
  
  vadInstance: null as any, 
  audioContext: null as AudioContext | null,
  audioStream: null as MediaStream | null,
  micSource: null as MediaStreamAudioSourceNode | null,
  audioWorkletNode: null as AudioWorkletNode | null,
  processorUrl: null as string | null,

  WORKLET_PROCESSOR_URL: '/audio-sender-processor.js', 

  initBuffer(sampleRate: number, bufferDurationSeconds: number) {
    this.bufferCapacity = sampleRate * bufferDurationSeconds;
    this.audioBuffer = new Float32Array(this.bufferCapacity);
    this.bufferIndex = 0;
    this.bufferFull = false;
    console.log(`[AudioProcessor] Initialized pre-speech buffer: ${this.bufferCapacity} samples (~${bufferDurationSeconds} seconds)`);
  },

  appendToBuffer(audioData: Float32Array) {
    if (!this.audioBuffer || this.bufferCapacity === null) {
      console.warn("[AudioProcessor] Pre-speech buffer not initialized, initializing with default.");
      this.initBuffer(this.nativeSampleRate || 16000, 3);
    }
    const inputLength = audioData.length;
    let remainingSamples = inputLength;
    let offset = 0;

    while (remainingSamples > 0) {
      const samplesToCopy = Math.min(remainingSamples, (this.bufferCapacity || 0) - this.bufferIndex);
      if (this.audioBuffer) {
        this.audioBuffer.set(audioData.subarray(offset, offset + samplesToCopy), this.bufferIndex);
      }
      this.bufferIndex = (this.bufferIndex + samplesToCopy) % (this.bufferCapacity || 1);
      if (this.bufferIndex === 0 && (this.bufferCapacity || 0) > 0) {
        this.bufferFull = true;
      }
      remainingSamples -= samplesToCopy;
      offset += samplesToCopy;
    }
  },

  getBufferedAudio(): Float32Array {
    if (!this.audioBuffer || this.bufferCapacity === null) {
      return new Float32Array(0);
    }
    if (!this.bufferFull) {
      return this.audioBuffer.subarray(0, this.bufferIndex);
    }
    const result = new Float32Array(this.bufferCapacity);
    const firstPart = this.audioBuffer.subarray(this.bufferIndex);
    const secondPart = this.audioBuffer.subarray(0, this.bufferIndex);
    result.set(firstPart, 0);
    result.set(secondPart, firstPart.length);
    return result;
  },

  combineBuffers(preSpeechBuffer: Float32Array, tempBufferArray: Float32Array[]): Float32Array {
    const totalLength = preSpeechBuffer.length + tempBufferArray.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;

    combined.set(preSpeechBuffer, offset);
    offset += preSpeechBuffer.length;

    for (const chunk of tempBufferArray) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  },

  async resampleAudio(audioData: Float32Array, sourceSampleRate: number, targetSampleRate: number): Promise<Float32Array> {
    if (sourceSampleRate === targetSampleRate) {
      return audioData;
    }

    const offlineContext = new OfflineAudioContext({
      numberOfChannels: 1,
      length: Math.ceil(audioData.length * targetSampleRate / sourceSampleRate),
      sampleRate: targetSampleRate
    });

    const buffer = offlineContext.createBuffer(1, audioData.length, sourceSampleRate);
    buffer.getChannelData(0).set(audioData);

    const source = offlineContext.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineContext.destination);
    source.start();

    const renderedBuffer = await offlineContext.startRendering();
    return renderedBuffer.getChannelData(0);
  },

  formatAudioData(float32Array: Float32Array): ArrayBuffer {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16.buffer;
  },

  async setupAudioCapture(
    targetSampleRate: number,
    onSpeechStartCallback: () => void,
    onSpeechEndCallback: () => void,
    onAudioChunkReady: (audioData: ArrayBuffer) => void,
    setIsSpeechActive: (active: boolean) => void // Callback to update speech activity state
  ) {
    try {
      console.log('[AudioProcessor] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      console.log('[AudioProcessor] Microphone access granted.');

      this.audioContext = new AudioContext();
      this.nativeSampleRate = this.audioContext.sampleRate;
      console.log(`[AudioProcessor] Detected native sample rate: ${this.nativeSampleRate} Hz`);

      this.initBuffer(this.nativeSampleRate, 3);

      const currentVadInstance = await vad.MicVAD.new({
        stream: stream,
        sampleRate: this.nativeSampleRate,
        onSpeechStart: () => {
          setIsSpeechActive(true);
          onSpeechStartCallback();
          this.tempBuffer = [];
          this.postDelayBuffer = [];
          this.lastSendTime = null;
          console.log('[AudioProcessor] VAD: Speech Started.');

          this.speechStartTimeout = setTimeout(() => {
            if (currentVadInstance?.speech?.active) {
              const preSpeechBuffer = this.getBufferedAudio();
              const combinedAudio = this.combineBuffers(preSpeechBuffer, this.tempBuffer);
              this.processAndSendAudio(combinedAudio, targetSampleRate, onAudioChunkReady);
              this.lastSendTime = Date.now();
              this.tempBuffer = [];
              console.log('[AudioProcessor] Sent pre-speech buffer after timeout.');
            } else {
                console.warn('[AudioProcessor] VAD speech.active was undefined/false in onSpeechStart timeout. Will not send pre-speech buffer.');
            }
            this.speechStartTimeout = null;
          }, 500);
        },
        onSpeechEnd: () => {
          setIsSpeechActive(false);
          onSpeechEndCallback();
          console.log('[AudioProcessor] VAD: Speech Ended.');

          if (this.speechStartTimeout) {
            clearTimeout(this.speechStartTimeout);
            this.speechStartTimeout = null;
            const preSpeechBuffer = this.getBufferedAudio();
            const combinedAudio = this.combineBuffers(preSpeechBuffer, this.tempBuffer);
            this.processAndSendAudio(combinedAudio, targetSampleRate, onAudioChunkReady);
            this.tempBuffer = [];
            console.log('[AudioProcessor] Sent remaining temp buffer on speech end (early).');
          } else if (this.postDelayBuffer.length > 0) {
            const combinedPostDelay = this.postDelayBuffer.reduce((acc, chunk) => {
                const result = new Float32Array(acc.length + chunk.length);
                result.set(acc, 0);
                result.set(chunk, acc.length);
                return result;
            }, new Float32Array(0));
            this.processAndSendAudio(combinedPostDelay, targetSampleRate, onAudioChunkReady);
            this.postDelayBuffer = [];
            console.log('[AudioProcessor] Sent post-delay buffer on speech end.');
          }
        }
      });
      // Assign to the manager's property AFTER it's fully initialized
      this.vadInstance = currentVadInstance; 
      this.vadInstance.start();
      console.log('[AudioProcessor] VAD started.');

      this.micSource = this.audioContext.createMediaStreamSource(stream);

      console.log(`[AudioProcessor] Attempting to load AudioWorklet module from: ${this.WORKLET_PROCESSOR_URL}`);
      try {
        await this.audioContext.audioWorklet.addModule(this.WORKLET_PROCESSOR_URL);
        console.log('[AudioProcessor] AudioWorklet module loaded successfully.');
      } catch (workletError: any) {
        console.error('[AudioProcessor] Failed to add AudioWorklet module:', workletError);
        throw new Error(`Unable to load worklet module. Original error: ${workletError.message}. Check browser console for network errors or module syntax.`);
      }
      
      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-sender-processor');
      console.log('[AudioProcessor] AudioWorkletNode created.');

      this.audioWorkletNode.port.onmessage = async (event) => {
        if (event.data && event.data.audioData) {
          const audioData = event.data.audioData as Float32Array;
          this.appendToBuffer(audioData);

          // This is the primary point where we send audio.
          // It should send whenever the VAD instance indicates active speech.
          if (currentVadInstance?.speech?.active) { 
            if (this.speechStartTimeout) {
              this.tempBuffer.push(audioData.slice());
            } else {
              this.postDelayBuffer.push(audioData.slice());
              const totalSamples = this.postDelayBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
              const elapsedTime = this.lastSendTime ? (Date.now() - this.lastSendTime) / 1000 : 0;

              if (totalSamples >= (this.nativeSampleRate || 16000) * 0.6 || elapsedTime >= 0.6) {
                const combinedPostDelay = this.postDelayBuffer.reduce((acc, chunk) => {
                    const result = new Float32Array(acc.length + chunk.length);
                    result.set(acc, 0);
                    result.set(chunk, acc.length);
                    return result;
                }, new Float32Array(0));
                this.processAndSendAudio(combinedPostDelay, targetSampleRate, onAudioChunkReady);
                this.postDelayBuffer = [];
                this.lastSendTime = Date.now();
              }
            }
          } else {
            // Log for debugging: why is VAD not active when audio is coming from worklet?
            // This might happen right at the start before VAD fully activates, or if no speech is detected.
            // console.warn('[AudioProcessor] VAD not actively detecting speech. Buffering or skipping audio send (onmessage).'); 
          }
        }
      };

      this.micSource.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.audioContext.destination);
      console.log('[AudioProcessor] Audio graph connected.');

      return true;
    } catch (error: any) {
      console.error('[AudioProcessor] Full error during setup:', error);
      this.releaseAudioResources();
      throw new Error(`Unable to start audio capture: ${error.message || 'Unknown error'}. Please ensure you grant microphone permissions and check browser console for details.`);
    }
  },

  async processAndSendAudio(audioData: Float32Array, targetSampleRate: number, onAudioChunkReady: (audioData: ArrayBuffer) => void) {
    if (audioData.length === 0) return;
    const resampledAudio = await this.resampleAudio(audioData, this.nativeSampleRate || 44100, targetSampleRate);
    const formattedData = this.formatAudioData(resampledAudio);
    onAudioChunkReady(formattedData);
  },

  releaseAudioResources() {
    console.log("[AudioProcessor] Releasing audio resources...");
    if (this.vadInstance) {
      this.vadInstance.pause();
      this.vadInstance = null;
      console.log("[AudioProcessor] VAD stopped.");
    }
    if (this.speechStartTimeout) {
      clearTimeout(this.speechStartTimeout);
      this.speechStartTimeout = null;
    }

    if (this.audioWorkletNode) {
        this.audioWorkletNode.disconnect();
        this.audioWorkletNode = null;
        console.log("[AudioProcessor] AudioWorkletNode disconnected.");
    }
    if (this.micSource) {
        this.micSource.disconnect();
        this.micSource = null;
        console.log("[AudioProcessor] Mic source disconnected.");
    }
    if (this.audioContext) {
        this.audioContext.close().catch(e => console.error("[AudioProcessor] Error closing AudioContext:", e));
        this.audioContext = null;
        console.log("[AudioProcessor] AudioContext closed.");
    }
    if (this.audioStream) {
        this.audioStream.getTracks().forEach(track => track.stop());
        this.audioStream = null;
        console.log("[AudioProcessor] MediaStream tracks stopped.");
    }
    
    this.audioBuffer = null;
    this.bufferIndex = 0;
    this.bufferFull = false;
    this.tempBuffer = [];
    this.postDelayBuffer = [];
    this.lastSendTime = null;
    this.nativeSampleRate = null;
  }
};


const defaultSuggestionPrompt = 'Based on this conversation, provide helpful insights, key points, action items, and relevant follow-up suggestions.';
const defaultGeminiModel = 'gemini-1.5-flash';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeechActive, setIsSpeechActive] = useState(false); // State for VAD speech activity
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [currentText, setCurrentText] = useState(''); // For interim results from your STT API
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isTyping, setIsTyping] = useState(false); // Used for user chat response loading
  const [showSettings, setShowSettings] = useState(false);
  const [suggestionPrompt, setSuggestionPrompt] = useState<string>(defaultSuggestionPrompt);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>(defaultGeminiModel);
  const [lastSummaryLength, setLastSummaryLength] = useState(0);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [lastSuggestionLength, setLastSuggestionLength] = useState(0);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);

  // New states for your WebSocket API configuration (default values)
  const [wsHost, setWsHost] = useState("stt-streaming.blaze.vn");
  const [wsPort, setWsPort] = useState(443);
  const [wsLanguage, setWsLanguage] = useState('vi'); // Default to Vietnamese
  const [wsTask, setWsTask] = useState('transcribe');
  const [wsModel, setWsModel] = useState('small');
  const [wsUseVad, setWsUseVad] = useState(true);
  const [wsMaxConnectionTime, setWsMaxConnectionTime] = useState(600);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting' | 'failed'>('idle');

  // Refs for managing WebSocket client
  const websocketClientRef = useRef<TranscriptionWebSocketClient | null>(null);
  const transcriptQueue = useRef<string[]>([]); // To manage incoming transcription pieces to avoid duplicates and ensure order

  const transcriptRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // --- WebSocket Message Handler (Callback for TranscriptionWebSocketClient) ---
  const handleWebSocketMessage = useCallback((messageData: string | ArrayBuffer) => {
    if (messageData instanceof ArrayBuffer) {
      return;
    }
    try {
      const data = JSON.parse(messageData);
      console.log('[STT Server Message] Received data:', JSON.stringify(data).slice(0, 200) + (JSON.stringify(data).length > 200 ? '...' : ''));

      if (data.segments && Array.isArray(data.segments)) {
        let newCurrentText = '';
        let latestSegment: any = null;

        data.segments.forEach((seg: any) => {
            if (seg.completed) {
                if (!transcriptQueue.current.includes(seg.text)) {
                    transcriptQueue.current.push(seg.text);
                    console.log(`[STT Segments] Finalized: "${seg.text}"`); // Explicit log for finalized transcription
                }
            } else {
                newCurrentText = seg.text;
            }
            latestSegment = seg;
        });

        setTranscript(prev => {
            let updatedTranscript = [...prev];
            while (transcriptQueue.current.length > 0) {
                const textToAdd = transcriptQueue.current.shift();
                if (textToAdd) {
                    updatedTranscript.push({
                        id: `${Date.now()}-${Math.random()}`,
                        text: textToAdd,
                        timestamp: new Date(),
                        confidence: latestSegment?.confidence
                    });
                }
            }
            return updatedTranscript;
        });

        setCurrentText(newCurrentText);
        if (newCurrentText) {
            console.log(`[STT Segments] Interim: "${newCurrentText}"`); // Explicit log for interim transcription
        }
        
      } else if (data.type === 'transcription' && data.text) {
        console.log(`[STT Simple] Received: "${data.text}"`); // Explicit log for simple transcription
        setTranscript(prev => {
          const newSegment: TranscriptSegment = {
            id: `${Date.now()}-${Math.random()}`,
            text: data.text,
            timestamp: new Date(),
          };
          const updatedTranscript = [...prev, newSegment];
          return updatedTranscript;
        });
        setCurrentText('');
      } else {
          console.warn('[STT Server Message] Unhandled message format:', data);
      }
    } catch (error) {
      console.error('[STT Server Message] Error parsing or handling WebSocket message:', error);
    }
  }, []);

  // --- Effect for AI Suggestions and Summaries based on transcript changes ---
  useEffect(() => {
    if (transcript.length > 0 || currentText) { 
      generateAutoSuggestions(transcript);
      checkAndGenerateAutoSummary(transcript);
    }
  }, [transcript, currentText, geminiApiKey, suggestionPrompt, lastSummaryLength, lastSuggestionLength, isGeneratingSummary, isGeneratingSuggestion]);


  // --- WebSocket Connection Management ---
  const connectWebSocket = useCallback(async () => {
    setConnectionStatus('connecting');
    console.log('[App] Attempting WebSocket connection...');
    if (websocketClientRef.current) {
        websocketClientRef.current.close();
    }

    const client = new TranscriptionWebSocketClient({
      host: wsHost,
      port: wsPort,
      language: wsLanguage,
      task: wsTask,
      model: wsModel,
      useVad: wsUseVad,
      maxConnectionTime: wsMaxConnectionTime,
      onServerMessage: handleWebSocketMessage,
      onConnection: () => {
        setConnectionStatus('connected');
        setChatMessages(prev => [...prev, { id: Date.now().toString(), type: 'assistant', content: '✅ Connected to STT server.', timestamp: new Date() }]);
        console.log('[App] WebSocket connected. UI updated.');
      },
      onDisconnection: (code: number, reason: string) => {
        setConnectionStatus('disconnected');
        setChatMessages(prev => [...prev, { id: Date.now().toString(), type: 'assistant', content: `🔗 Disconnected from STT server: ${reason} (Code: ${code}).`, timestamp: new Date() }]);
        console.warn(`[App] WebSocket disconnected. Code: ${code}, Reason: ${reason}`);
      },
      onError: (errorMessage: string) => {
        setConnectionStatus('error');
        setChatMessages(prev => [...prev, { id: Date.now().toString(), type: 'assistant', content: `❌ STT Connection Error: ${errorMessage}`, timestamp: new Date() }]);
        console.error(`[App] WebSocket connection error: ${errorMessage}`);
      }
    });
    websocketClientRef.current = client;

    try {
      await client.connect();
    } catch (error: any) {
      console.error('[App] Initial WebSocket connection failed:', error);
      setConnectionStatus('failed');
      setChatMessages(prev => [...prev, { id: Date.now().toString(), type: 'assistant', content: `❌ Failed to connect to STT server: ${error.message}.`, timestamp: new Date() }]);
    }
  }, [wsHost, wsPort, wsLanguage, wsTask, wsModel, wsUseVad, wsMaxConnectionTime, handleWebSocketMessage]);

  // Initial WebSocket connection and cleanup on component mount/unmount
  useEffect(() => {
    console.log('[App] Component mounted. Initiating WebSocket connection.');
    connectWebSocket();
    return () => {
      console.log('[App] Component unmounting. Cleaning up resources.');
      if (websocketClientRef.current) {
        websocketClientRef.current.close();
      }
      AudioProcessorManager.releaseAudioResources();
    };
  }, [connectWebSocket]);


  // --- Start/Stop Recording with your STT API ---
  const startRecording = useCallback(async () => {
    if (isRecording) {
        console.log('[App] Recording already in progress.');
        return;
    }

    if (!websocketClientRef.current || !websocketClientRef.current.isConnected) {
        console.warn('[App] STT server not connected for recording. Attempting reconnect...');
        setChatMessages(prev => [...prev, { id: Date.now().toString(), type: 'assistant', content: '⚠️ STT server not connected. Attempting to reconnect...', timestamp: new Date() }]);
        await connectWebSocket();
        if (!websocketClientRef.current || !websocketClientRef.current.isConnected) {
            console.error('[App] Failed to start recording: STT server not available after reconnect attempt.');
            setChatMessages(prev => [...prev, { id: Date.now().toString(), type: 'assistant', content: '❌ Failed to start recording: STT server not available.', timestamp: new Date() }]);
            return;
        }
    }

    try {
        console.log('[App] Attempting to setup audio capture...');
        const success = await AudioProcessorManager.setupAudioCapture(
            16000, // Target sample rate for your STT API
            () => { /* VAD onSpeechStart handled by AudioProcessorManager */ },
            () => { /* VAD onSpeechEnd handled by AudioProcessorManager */ },
            (audioData: ArrayBuffer) => { // onAudioChunkReady: Send audio to WebSocket
                if (websocketClientRef.current && websocketClientRef.current.isConnected) {
                    const sent = websocketClientRef.current.sendAudioData(audioData);
                }
            },
            setIsSpeechActive // Pass state updater for VAD activity indicator
        );

        if (success) {
            setIsRecording(true);
            if (websocketClientRef.current) {
                websocketClientRef.current.isRecording = true;
            }
            setChatMessages(prev => [...prev, { id: Date.now().toString(), type: 'assistant', content: '🎤 Recording started, listening for speech...', timestamp: new Date() }]);
            console.log('[App] Recording started successfully.');
        } else {
            console.error('[App] Audio capture setup failed.');
            setChatMessages(prev => [...prev, { id: Date.now().toString(), type: 'assistant', content: '❌ Failed to start audio capture. Check microphone permissions and browser console for details.', timestamp: new Date() }]);
        }
    } catch (error: any) {
        console.error("[App] Error during recording start process:", error);
        setChatMessages(prev => [...prev, { id: Date.now().toString(), type: 'assistant', content: `❌ Error starting recording: ${error.message}`, timestamp: new Date() }]);
    }
  }, [isRecording, connectWebSocket, setIsSpeechActive]);


  const stopRecording = useCallback(() => {
    if (!isRecording) {
        console.log('[App] Not recording, cannot stop.');
        return;
    }

    setIsRecording(false);
    AudioProcessorManager.releaseAudioResources();
    if (websocketClientRef.current && websocketClientRef.current.isConnected) {
      websocketClientRef.current.endTranscription();
      websocketClientRef.current.isRecording = false;
    }
    setChatMessages(prev => [...prev, { id: Date.now().toString(), type: 'assistant', content: '⏹️ Recording stopped.', timestamp: new Date() }]);
    console.log('[App] Recording stopped.');
  }, [isRecording]);

  const clearTranscript = () => {
    setTranscript([]);
    setCurrentText('');
    console.log('[App] Transcript cleared.');
  };

  const clearAll = () => {
    clearTranscript();
    setChatMessages([]);
    setChatInput('');
    setLastSummaryLength(0);
    setLastSuggestionLength(0);
    console.log('[App] All data cleared.');
  };

  const generateAutoSuggestions = async (segments: TranscriptSegment[]) => {
    if (!geminiApiKey.trim()) {
        return;
    }
    if (segments.length === 0) return;

    const fullTranscription = segments.map(s => s.text).join(' ');
    const totalWords = fullTranscription.split(' ').length;

    const shouldGenerateSuggestion =
      totalWords >= lastSuggestionLength + 10 ||
      (segments.length >= 3 && segments.length % 3 === 0 && totalWords > 0);


    if (shouldGenerateSuggestion && !isGeneratingSuggestion) {
      setIsGeneratingSuggestion(true);
      console.log(`[AI Suggest] Triggering auto suggestion for ${totalWords} words.`);
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
        setLastSuggestionLength(totalWords);
        console.log('[AI Suggest] Auto suggestion generated successfully.');
      } catch (error) {
        console.error('[AI Suggest] Auto suggestion error:', error);
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
    console.log('[App] Transcript downloaded.');
  };

  const checkAndGenerateAutoSummary = async (segments: TranscriptSegment[]) => {
    if (!geminiApiKey.trim()) {
      if (segments.length > 0 && !chatMessages.some(msg => msg.content.includes('🔑 **Setup Required**: Please configure your Gemini API key'))) {
        const apiKeyMessage: ChatMessage = {
          id: `api-key-notice-${Date.now()}`,
          type: 'assistant',
          content: '🔑 **Setup Required**: Please configure your Gemini API key in Settings to enable automatic AI summaries and advanced suggestions.',
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, apiKeyMessage]);
        console.log('[AI Summary] API key missing message displayed.');
      }
      return;
    }

    const fullTranscription = segments.map(s => s.text).join(' ');
    const totalWords = fullTranscription.split(' ').length;

    const shouldGenerateSummary =
      totalWords >= lastSummaryLength + 50 ||
      (segments.length >= 5 && segments.length % 5 === 0 && totalWords > 0);

    if (shouldGenerateSummary && !isGeneratingSummary) {
      setIsGeneratingSummary(true);
      console.log(`[AI Summary] Triggering auto summary for ${totalWords} words.`);
      try {
        const summaryPrompt = `Based on the following transcription, please provide a concise summary. Focus on the main topics discussed, any key decisions made, and important action items. Keep the summary to a maximum of 150 words.

Current conversation transcription:
${fullTranscription}`;

        const summary = await callGeminiAPI(fullTranscription, summaryPrompt);

        const summaryMessage: ChatMessage = {
          id: `auto-summary-${Date.now()}`,
          type: 'assistant',
          content: `🤖 **AI Summary**: ${summary}`,
          timestamp: new Date()
        };

        setChatMessages(prev => [...prev, summaryMessage]);
        setLastSummaryLength(totalWords);
        console.log('[AI Summary] Auto summary generated successfully.');
      } catch (error) {
        console.error('Gemini API error for summary:', error);
        const errorMessage: ChatMessage = {
          id: `error-summary-${Date.now()}`,
          type: 'assistant',
          content: `❌ **Error Generating Summary**: Failed to generate AI summary. Please check your API key and network connection.`,
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
    console.log('[Gemini API] Calling Gemini API...');

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
      const errorMessage = `Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`;
      console.error('[Gemini API] Error response:', errorMessage);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('[Gemini API] Response received.');

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('[Gemini API] Invalid response structure:', data);
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
    setIsTyping(true); // Set isTyping to true when user sends a message, indicating AI processing
    console.log('[Chat] User submitted message. Triggering AI response.');

    generateChatResponse(chatInput, transcript);
  };

  const generateChatResponse = async (question: string, transcriptSegments: TranscriptSegment[]) => {
    try {
      let responseContent: string;

      const fullTranscript = transcriptSegments.map(s => s.text).join(' ');
      console.log('[Chat AI] Generating response to user question...');

      if (!geminiApiKey.trim()) {
        responseContent = `🔑 **Setup Required**: Please configure your Gemini API key in Settings for advanced AI responses. You can ask about summaries, key points, or action items based on the current transcription.`;
        console.warn('[Chat AI] Gemini API key missing for chat response.');
      } else {
        const chatPrompt = `You are an AI assistant helping with transcription analysis. Your goal is to provide concise, helpful, and accurate answers based *only* on the provided transcription. If the information isn't in the transcription, state that you don't have enough information from the current conversation.

Context: The user has been recording a conversation/meeting and has the following transcription:

Transcription: "${fullTranscript}"

User Question: "${question}"

Please provide a helpful, accurate response based on the transcription content. If the transcription is empty or the question cannot be answered solely from the transcription, state that. Prioritize brevity and direct answers.`;

        responseContent = await callGeminiAPI(fullTranscript, chatPrompt);
        console.log('[Chat AI] Gemini API chat response received.');
      }

      const assistantMessage: ChatMessage = {
        id: `chat-response-${Date.now()}`,
        type: 'assistant',
        content: responseContent,
        timestamp: new Date()
      };

      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('[Chat AI] Chat response generation error:', error);
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
                {/* Connection Status Indicators */}
                {connectionStatus === 'connecting' && <span className="text-sm text-yellow-600">Connecting STT...</span>}
                {connectionStatus === 'reconnecting' && <span className="text-sm text-yellow-600">Reconnecting STT...</span>}
                {connectionStatus === 'disconnected' && !isRecording && <span className="text-sm text-red-600">STT Disconnected</span>}
                {connectionStatus === 'error' && <span className="text-sm text-red-600">STT Connection Error</span>}
                {connectionStatus === 'connected' && !isRecording && <span className="text-sm text-green-600">STT Ready</span>}
              </div>
            </div>

            <div ref={transcriptRef} className="flex-1 p-4 overflow-y-auto space-y-3">
              {transcript.length === 0 && !currentText ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <div className="text-center">
                    <Mic className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                    <p className="text-lg">Start recording to see live transcription</p>
                    <p className="text-sm mt-2">Your speech will appear here in real-time</p>
                    {connectionStatus === 'idle' && <p className="text-xs text-slate-400 mt-1">Initializing STT service...</p>}
                    {connectionStatus === 'failed' && <p className="text-xs text-red-500 mt-1">Failed to initialize STT service. Check settings/console.</p>}
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
                  {isSpeechActive && currentText === '' && (
                    <div className="flex space-x-3 opacity-60">
                      <div className="flex-shrink-0 text-xs text-slate-500 w-16">
                        {new Date().toLocaleTimeString()}
                      </div>
                      <div className="flex-1 text-slate-900 leading-relaxed italic">
                        <span className="animate-pulse">...listening...</span>
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
                            {!isGeneratingSummary && !isGeneratingSuggestion && !isTyping && "AI thinking..."}
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
        // Props for your WebSocket STT configuration
        wsHost={wsHost}
        setWsHost={setWsHost}
        wsPort={wsPort}
        setWsPort={setWsPort}
        wsLanguage={wsLanguage}
        setWsLanguage={setWsLanguage}
        wsModel={wsModel}
        setWsModel={setWsModel}
        wsTask={wsTask}
        setWsTask={setWsTask}
        wsUseVad={wsUseVad}
        setWsUseVad={setWsUseVad}
        wsMaxConnectionTime={wsMaxConnectionTime}
        setWsMaxConnectionTime={setWsMaxConnectionTime}
        reconnectWebSocket={connectWebSocket} // Pass function to trigger reconnection from settings
      />
    </div>
  );
}

export default App;