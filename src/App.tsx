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
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [suggestionPrompt, setSuggestionPrompt] = useState<string>(defaultSuggestionPrompt);

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
          setTranscript(prev => [...prev, newSegment]);
          setCurrentText('');
          generateRealtimeSuggestions([...transcript, newSegment], suggestionPrompt);
        } else {
          setCurrentText(interimTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
      };

      recognitionRef.current.onend = () => {
        if (isRecording) {
          recognitionRef.current.start();
        }
      };
    }
  }, [isRecording, transcript]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, currentText]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages]);

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

  const generateRealtimeSuggestions = (segments: TranscriptSegment[], prompt: string) => {
    if (segments.length === 0) return;

    const fullText = segments.map(s => s.text).join(' ');
    
    // Generate suggestions when there's enough content
    if (fullText.length < 100) return;
    
    // Generate suggestions every 5 segments or when significant content is added
    if (segments.length % 5 === 0 || fullText.length % 500 < 50) {
      const suggestionContent = generateAdvancedSuggestion(fullText, prompt);
      
      if (suggestionContent) {
        const suggestionMessage: ChatMessage = {
          id: `suggestion-${Date.now()}`,
          type: 'assistant',
          content: `💡 **AI Insight**: ${suggestionContent}`,
          timestamp: new Date()
        };
        
        setChatMessages(prev => [...prev, suggestionMessage]);
      }
    }
  };

  const generateAdvancedSuggestion = (transcriptionText: string, prompt: string): string | null => {
    if (!transcriptionText.trim() || !prompt.trim()) return null;
    
    // Analyze the full context of the transcription
    const context = analyzeTranscriptionContext(transcriptionText);
    
    // Generate suggestion based on the custom prompt and context
    return generateContextualSuggestion(transcriptionText, prompt, context);
  };

  const analyzeTranscriptionContext = (text: string) => {
    const analysis = {
      wordCount: text.split(' ').length,
      keyTopics: extractKeyTopics(text),
      sentiment: analyzeSentiment(text),
      conversationType: detectConversationType(text),
      actionItems: extractPotentialActions(text),
      questions: extractQuestions(text),
      decisions: extractDecisions(text),
      timeReferences: extractTimeReferences(text),
      participants: estimateParticipants(text)
    };
    
    return analysis;
  };

  const analyzeSentiment = (text: string): 'positive' | 'neutral' | 'negative' => {
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'perfect', 'love', 'like', 'happy', 'excited', 'successful', 'achievement'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'sad', 'angry', 'frustrated', 'problem', 'issue', 'challenge', 'difficult', 'failed'];
    
    const words = text.toLowerCase().split(/\s+/);
    const positiveCount = words.filter(word => positiveWords.includes(word)).length;
    const negativeCount = words.filter(word => negativeWords.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  };

  const detectConversationType = (text: string): string => {
    const textLower = text.toLowerCase();
    
    if (textLower.includes('meeting') || textLower.includes('agenda') || textLower.includes('minutes')) {
      return 'meeting';
    }
    if (textLower.includes('interview') || textLower.includes('candidate') || textLower.includes('position')) {
      return 'interview';
    }
    if (textLower.includes('presentation') || textLower.includes('slide') || textLower.includes('demo')) {
      return 'presentation';
    }
    if (textLower.includes('brainstorm') || textLower.includes('idea') || textLower.includes('creative')) {
      return 'brainstorming';
    }
    if (textLower.includes('lecture') || textLower.includes('lesson') || textLower.includes('learn')) {
      return 'educational';
    }
    
    return 'general';
  };

  const extractPotentialActions = (text: string): string[] => {
    const actionPatterns = [
      /(?:need to|should|must|will|have to|going to|plan to)\s+([^.!?]+)/gi,
      /(?:action item|todo|task):\s*([^.!?]+)/gi,
      /(?:follow up|next step):\s*([^.!?]+)/gi
    ];
    
    const actions: string[] = [];
    actionPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        actions.push(...matches.slice(0, 3));
      }
    });
    
    return actions;
  };

  const extractQuestions = (text: string): string[] => {
    const questionPattern = /[^.!?]*\?/g;
    const questions = text.match(questionPattern) || [];
    return questions.slice(0, 3).map(q => q.trim());
  };

  const extractDecisions = (text: string): string[] => {
    const decisionPatterns = [
      /(?:decided|decision|conclude|agreed|final):\s*([^.!?]+)/gi,
      /(?:we will|we'll|let's|final decision):\s*([^.!?]+)/gi
    ];
    
    const decisions: string[] = [];
    decisionPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        decisions.push(...matches.slice(0, 2));
      }
    });
    
    return decisions;
  };

  const extractTimeReferences = (text: string): string[] => {
    const timePattern = /(?:today|tomorrow|next week|next month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2})/gi;
    const timeRefs = text.match(timePattern) || [];
    return [...new Set(timeRefs)].slice(0, 3);
  };

  const estimateParticipants = (text: string): number => {
    const pronouns = text.toLowerCase().match(/\b(i|you|he|she|they|we)\b/g) || [];
    const uniquePronouns = new Set(pronouns);
    return Math.max(1, Math.min(uniquePronouns.size, 5));
  };

  const generateContextualSuggestion = (text: string, prompt: string, context: any): string => {
    const promptLower = prompt.toLowerCase();
    
    // Phân tích prompt để hiểu yêu cầu
    if (promptLower.includes('tóm tắt') || promptLower.includes('summary')) {
      return generateContextualSummary(context);
    }
    
    if (promptLower.includes('hành động') || promptLower.includes('action') || promptLower.includes('task')) {
      return generateContextualActions(context);
    }
    
    if (promptLower.includes('câu hỏi') || promptLower.includes('question')) {
      return generateContextualQuestions(context);
    }
    
    if (promptLower.includes('quyết định') || promptLower.includes('decision')) {
      return generateContextualDecisions(context);
    }
    
    if (promptLower.includes('insight') || promptLower.includes('phân tích') || promptLower.includes('analyze')) {
      return generateContextualInsights(context);
    }
    
    if (promptLower.includes('follow up') || promptLower.includes('tiếp theo') || promptLower.includes('next')) {
      return generateContextualFollowUps(context);
    }
    
    // Tạo suggestion tổng hợp dựa trên prompt tùy chỉnh
    return generateCustomContextualSuggestion(prompt, context);
  };

  const generateContextualSummary = (context: any): string => {
    const { wordCount, keyTopics, conversationType, sentiment, participants } = context;
    
    let summary = `**Tóm tắt cuộc trò chuyện** (${wordCount} từ, ${participants} người tham gia)\n`;
    summary += `• Loại: ${getConversationTypeVietnamese(conversationType)}\n`;
    summary += `• Tâm trạng: ${getSentimentVietnamese(sentiment)}\n`;
    
    if (keyTopics.length > 0) {
      summary += `• Chủ đề chính: ${keyTopics.slice(0, 3).join(', ')}\n`;
    }
    
    if (context.decisions.length > 0) {
      summary += `• Quyết định: ${context.decisions.length} quyết định được đưa ra`;
    }
    
    return summary;
  };

  const generateContextualActions = (context: any): string => {
    const { actionItems, timeReferences } = context;
    
    if (actionItems.length > 0) {
      let actions = `**Hành động cần thực hiện:**\n`;
      actionItems.slice(0, 3).forEach((action, index) => {
        actions += `${index + 1}. ${action.replace(/^(need to|should|must|will|have to|going to|plan to)\s*/i, '').trim()}\n`;
      });
      
      if (timeReferences.length > 0) {
        actions += `\n⏰ Thời gian liên quan: ${timeReferences.join(', ')}`;
      }
      
      return actions;
    }
    
    return `**Đề xuất hành động:** Xem xét tạo danh sách công việc cụ thể từ các điểm thảo luận chính`;
  };

  const generateContextualQuestions = (context: any): string => {
    const { questions, keyTopics, conversationType } = context;
    
    if (questions.length > 0) {
      let result = `**Câu hỏi từ cuộc trò chuyện:**\n`;
      questions.slice(0, 2).forEach((q, index) => {
        result += `${index + 1}. ${q.trim()}\n`;
      });
      return result;
    }
    
    // Tạo câu hỏi dựa trên context
    let suggestedQuestions = `**Câu hỏi đề xuất:**\n`;
    
    if (conversationType === 'meeting') {
      suggestedQuestions += `• Các bước tiếp theo là gì?\n• Ai sẽ chịu trách nhiệm cho từng nhiệm vụ?`;
    } else if (keyTopics.length > 0) {
      suggestedQuestions += `• Làm thế nào để triển khai ${keyTopics[0]}?\n• Có rủi ro nào cần xem xét không?`;
    } else {
      suggestedQuestions += `• Điểm chính cần làm rõ là gì?\n• Cần thêm thông tin gì?`;
    }
    
    return suggestedQuestions;
  };

  const generateContextualDecisions = (context: any): string => {
    const { decisions, actionItems } = context;
    
    if (decisions.length > 0) {
      let result = `**Quyết định đã đưa ra:**\n`;
      decisions.forEach((decision, index) => {
        result += `${index + 1}. ${decision.replace(/^(decided|decision|conclude|agreed|final):\s*/i, '').trim()}\n`;
      });
      return result;
    }
    
    if (actionItems.length > 0) {
      return `**Cần quyết định:** Có ${actionItems.length} hành động cần được xác nhận và phân công trách nhiệm`;
    }
    
    return `**Theo dõi quyết định:** Chưa có quyết định rõ ràng nào được ghi nhận. Cân nhắc tóm tắt các điểm đồng thuận`;
  };

  const generateContextualInsights = (context: any): string => {
    const { conversationType, sentiment, keyTopics, wordCount, participants } = context;
    
    let insights = `**Phân tích cuộc trò chuyện:**\n`;
    
    // Phân tích độ dài và mức độ tham gia
    if (wordCount > 500) {
      insights += `• Cuộc thảo luận chi tiết với ${wordCount} từ\n`;
    }
    
    if (participants > 2) {
      insights += `• Cuộc trò chuyện nhóm với ${participants} người tham gia\n`;
    }
    
    // Phân tích chủ đề
    if (keyTopics.length > 3) {
      insights += `• Nhiều chủ đề được đề cập (${keyTopics.length} chủ đề chính)\n`;
    }
    
    // Phân tích tâm trạng
    if (sentiment === 'positive') {
      insights += `• Tâm trạng tích cực, có thể là dấu hiệu của sự đồng thuận\n`;
    } else if (sentiment === 'negative') {
      insights += `• Có thể có thách thức hoặc bất đồng cần giải quyết\n`;
    }
    
    // Đề xuất dựa trên loại cuộc trò chuyện
    insights += getConversationSpecificInsight(conversationType);
    
    return insights;
  };

  const generateContextualFollowUps = (context: any): string => {
    const { conversationType, actionItems, decisions, timeReferences } = context;
    
    let followUps = `**Theo dõi tiếp theo:**\n`;
    
    if (conversationType === 'meeting') {
      followUps += `• Gửi biên bản họp cho tất cả thành viên\n`;
      followUps += `• Thiết lập timeline cho các nhiệm vụ được giao\n`;
    }
    
    if (actionItems.length > 0) {
      followUps += `• Theo dõi tiến độ ${actionItems.length} hành động đã xác định\n`;
    }
    
    if (decisions.length > 0) {
      followUps += `• Thông báo ${decisions.length} quyết định cho các bên liên quan\n`;
    }
    
    if (timeReferences.length > 0) {
      followUps += `• Đặt lịnh nhắc cho các mốc thời gian: ${timeReferences.join(', ')}\n`;
    }
    
    followUps += `• Lên lịch cuộc họp tiếp theo nếu cần thiết`;
    
    return followUps;
  };

  const generateCustomContextualSuggestion = (prompt: string, context: any): string => {
    const { keyTopics, conversationType, wordCount } = context;
    
    let suggestion = `**Dựa trên yêu cầu của bạn:** "${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : '"}"\n\n`;
    
    if (keyTopics.length > 0) {
      suggestion += `**Phân tích theo chủ đề:**\n`;
      keyTopics.slice(0, 3).forEach((topic, index) => {
        suggestion += `${index + 1}. ${topic}: Cần phân tích sâu hơn\n`;
      });
    }
    
    suggestion += `\n**Bối cảnh:** ${getConversationTypeVietnamese(conversationType)} với ${wordCount} từ được ghi nhận`;
    
    return suggestion;
  };

  const getConversationTypeVietnamese = (type: string): string => {
    const types: Record<string, string> = {
      'meeting': 'Cuộc họp',
      'interview': 'Phỏng vấn',
      'presentation': 'Thuyết trình',
      'brainstorming': 'Brainstorming',
      'educational': 'Giáo dục',
      'general': 'Trò chuyện chung'
    };
    return types[type] || 'Không xác định';
  };

  const getSentimentVietnamese = (sentiment: string): string => {
    const sentiments: Record<string, string> = {
      'positive': 'Tích cực',
      'negative': 'Tiêu cực',
      'neutral': 'Trung tính'
    };
    return sentiments[sentiment] || 'Không xác định';
  };

  const getConversationSpecificInsight = (type: string): string => {
    switch (type) {
      case 'meeting':
        return `• Đề xuất: Tạo action items và timeline rõ ràng`;
      case 'interview':
        return `• Đề xuất: Đánh giá ứng viên dựa trên các tiêu chí đã thảo luận`;
      case 'presentation':
        return `• Đề xuất: Thu thập feedback và câu hỏi từ audience`;
      case 'brainstorming':
        return `• Đề xuất: Ưu tiên hóa các ý tưởng và lập kế hoạch triển khai`;
      default:
        return `• Đề xuất: Tóm tắt các điểm chính và xác định bước tiếp theo`;
    }
  };
    
  const generatePromptBasedSuggestion = (transcriptionText: string, prompt: string): string | null => {
    if (!transcriptionText.trim() || !prompt.trim()) return null;
    
    const text = transcriptionText.toLowerCase();
    const promptLower = prompt.toLowerCase();
    
    // Analyze what type of suggestions the prompt is asking for
    if (promptLower.includes('câu hỏi') || promptLower.includes('question')) {
      return generateQuestions(transcriptionText);
    }
    
    if (promptLower.includes('hành động') || promptLower.includes('action') || promptLower.includes('task')) {
      return generateActionItems(transcriptionText);
    }
    
    if (promptLower.includes('tóm tắt') || promptLower.includes('summary') || promptLower.includes('key point')) {
      return generateSummary(transcriptionText);
    }
    
    if (promptLower.includes('insight') || promptLower.includes('phân tích') || promptLower.includes('analyze')) {
      return generateInsights(transcriptionText);
    }
    
    if (promptLower.includes('follow up') || promptLower.includes('tiếp theo') || promptLower.includes('next step')) {
      return generateFollowUps(transcriptionText);
    }
    
    // Default: try to understand the prompt and generate accordingly
    return generateCustomSuggestion(transcriptionText, prompt);
  };
  
  const generateQuestions = (text: string): string => {
    const topics = extractKeyTopics(text);
    const questions = [];
    
    if (topics.length > 0) {
      questions.push(`What are the main challenges regarding ${topics[0]}?`);
      if (topics.length > 1) {
        questions.push(`How does ${topics[0]} relate to ${topics[1]}?`);
      }
    }
    
    if (text.includes('problem') || text.includes('issue') || text.includes('challenge')) {
      questions.push("What potential solutions could address this issue?");
    }
    
    if (questions.length === 0) {
      questions.push("What are the next steps to consider?");
    }
    
    return questions.slice(0, 2).join(" • ");
  };
  
  const generateActionItems = (text: string): string => {
    const actions = [];
    const actionWords = ['need to', 'should', 'must', 'will', 'plan to', 'going to', 'have to', 'decide'];
    
    for (const word of actionWords) {
      if (text.toLowerCase().includes(word)) {
        const sentences = text.split(/[.!?]+/);
        const actionSentence = sentences.find(s => s.toLowerCase().includes(word));
        if (actionSentence) {
          actions.push(`Action: ${actionSentence.trim()}`);
          break;
        }
      }
    }
    
    if (actions.length === 0) {
      const topics = extractKeyTopics(text);
      if (topics.length > 0) {
        actions.push(`Consider taking action on: ${topics[0]}`);
      }
    }
    
    return actions.length > 0 ? actions[0] : "Review discussion points and identify next actions";
  };
  
  const generateSummary = (text: string): string => {
    const topics = extractKeyTopics(text);
    const wordCount = text.split(' ').length;
    
    if (topics.length >= 2) {
      return `Summary: Discussion covers ${topics.slice(0, 3).join(', ')} (${wordCount} words recorded)`;
    }
    
    return `Summary: ${wordCount} words recorded covering main discussion points`;
  };
  
  const generateInsights = (text: string): string => {
    const topics = extractKeyTopics(text);
    const insights = [];
    
    if (text.toLowerCase().includes('problem') || text.toLowerCase().includes('challenge')) {
      insights.push("Problem-solving discussion detected");
    }
    
    if (text.toLowerCase().includes('decision') || text.toLowerCase().includes('choose')) {
      insights.push("Decision-making process identified");
    }
    
    if (topics.length > 2) {
      insights.push(`Multiple topics interconnected: ${topics.slice(0, 2).join(' and ')}`);
    }
    
    return insights.length > 0 ? 
      `Insight: ${insights[0]}` : 
      `Insight: Key themes emerging from discussion`;
  };
  
  const generateFollowUps = (text: string): string => {
    const topics = extractKeyTopics(text);
    
    if (text.toLowerCase().includes('meeting') || text.toLowerCase().includes('schedule')) {
      return "Follow-up: Schedule next meeting to continue discussion";
    }
    
    if (text.toLowerCase().includes('research') || text.toLowerCase().includes('investigate')) {
      return "Follow-up: Conduct additional research on discussed topics";
    }
    
    if (topics.length > 0) {
      return `Follow-up: Deep dive into ${topics[0]} for more details`;
    }
    
    return "Follow-up: Document key points and share with relevant stakeholders";
  };
  
  const generateCustomSuggestion = (text: string, prompt: string): string => {
    const topics = extractKeyTopics(text);
    
    // Try to match the prompt intent with content
    if (topics.length > 0) {
      return `Based on your prompt: "${prompt.slice(0, 50)}..." - Consider: ${topics.slice(0, 2).join(', ')}`;
    }
    
    return `Based on your custom prompt, analyzing: ${text.slice(0, 100)}...`;
  };
  
  const extractKeyTopics = (text: string): string[] => {
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'these', 'those', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once']);
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word));
    
    const wordCount = words.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
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
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const response = generateResponse(chatInput, transcript);
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const generateResponse = (question: string, transcript: TranscriptSegment[]): string => {
    const fullText = transcript.map(s => s.text).join(' ').toLowerCase();
    const questionLower = question.toLowerCase();

    if (questionLower.includes('summary') || questionLower.includes('summarize')) {
      const keywords = extractKeyTopics(fullText);
      return `Based on the transcription, the main topics discussed include: ${keywords.slice(0, 3).join(', ')}. The conversation covered ${transcript.length} segments over ${Math.round((Date.now() - (transcript[0]?.timestamp.getTime() || Date.now())) / 60000)} minutes.`;
    }

    if (questionLower.includes('action') || questionLower.includes('todo')) {
      return "I've identified several potential action items from the transcription. Would you like me to extract specific tasks or commitments mentioned?";
    }

    if (questionLower.includes('key') || questionLower.includes('important')) {
      return "The key points from the transcription include the main topics discussed and any decisions made. I can help you identify specific important moments if you'd like.";
    }

    if (questionLower.includes('time') || questionLower.includes('duration')) {
      const duration = transcript.length > 0 ? 
        Math.round((Date.now() - transcript[0].timestamp.getTime()) / 60000) : 0;
      return `The current session has been running for approximately ${duration} minutes with ${transcript.length} segments recorded.`;
    }

    return "I can help you analyze the transcription content. You can ask me about summaries, key points, action items, or specific topics mentioned in the conversation.";
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
                onClick={clearTranscript}
                disabled={transcript.length === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-all disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
                <span>Clear</span>
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
                <p className="text-sm text-slate-600">Real-time suggestions and Q&A about your transcription</p>
              </div>
              
              <div ref={chatRef} className="flex-1 p-4 overflow-y-auto space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-slate-500 py-8">
                    <Bot className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">Start recording to receive real-time AI suggestions!</p>
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
                            : message.content.includes('💡') ? 'bg-blue-50 text-blue-900 border border-blue-200' : 'bg-slate-100 text-slate-900'
                        }`}>
                          <p className="text-sm">{message.content}</p>
                          <p className={`text-xs mt-1 ${
                            message.type === 'user' ? 'text-blue-100' : message.content.includes('💡') ? 'text-blue-600' : 'text-slate-500'
                          }`}>
                            {message.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="flex items-start space-x-2 max-w-[80%]">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="bg-slate-100 rounded-lg px-4 py-2">
                        <div className="flex space-x-1">
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
      />
    </div>
  );
}

export default App;