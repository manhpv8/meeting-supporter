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

interface Suggestion {
  id: string;
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
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [suggestionPrompt, setSuggestionPrompt] = useState<string>(defaultSuggestionPrompt);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>(defaultGeminiModel);
  const [lastSummaryLength, setLastSummaryLength] = useState(0);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [lastSuggestionLength, setLastSuggestionLength] = useState(0);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);

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
          
          const newTranscript = [...transcript, newSegment];
          generateRealtimeSuggestions(newTranscript, suggestionPrompt);
          generateAutoSuggestions(newTranscript);
          checkAndGenerateAutoSummary(newTranscript);
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
    setLastSummaryLength(0);
    setLastSuggestionLength(0);
  };

  const generateAutoSuggestions = (segments: TranscriptSegment[]) => {
    if (!geminiApiKey.trim()) return;
    if (segments.length === 0) return;
    if (segments.length === 0) return;

    const totalWords = segments.reduce((count, segment) => 
      count + segment.text.split(' ').length, 0
    );
    
    // Generate suggestions every 50 words or every 5 segments
    const shouldGenerateSuggestion = 
      totalWords >= lastSuggestionLength + 50 || 
      (segments.length >= 5 && segments.length % 5 === 0);
    
    if (shouldGenerateSuggestion && !isGeneratingSuggestion) {
      generateAISuggestion(segments);
      setLastSuggestionLength(totalWords);
    }
  };

  const generateAISuggestion = async (segments: TranscriptSegment[]) => {
    if (segments.length === 0) return;
    if (!geminiApiKey.trim()) return;
    
    setIsGeneratingSuggestion(true);
    
    const fullTranscription = segments.map(s => s.text).join(' ');
    
    try {
      // Use the AI Summary Prompt to extract insights
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
        content: `💡 **Auto Suggestion**: ${suggestion}`,
        timestamp: new Date()
      };
      
      setChatMessages(prev => [...prev, suggestionMessage]);
    } catch (error) {
      console.error('Auto suggestion error:', error);
      // Don't show error messages for auto suggestions to avoid spam
    } finally {
      setIsGeneratingSuggestion(false);
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

  const checkAndGenerateAutoSummary = (segments: TranscriptSegment[]) => {
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

    const totalWords = segments.reduce((count, segment) => 
      count + segment.text.split(' ').length, 0
    );
    
    // Generate summary every 100 words or when transcript length doubles
    const shouldGenerateSummary = 
      totalWords >= lastSummaryLength + 100 || 
      (segments.length >= 10 && segments.length % 8 === 0);
    
    if (shouldGenerateSummary) {
      generateGeminiSummary(segments);
      setLastSummaryLength(totalWords);
    }
  };

  const generateGeminiSummary = async (segments: TranscriptSegment[]) => {
    if (segments.length === 0) return;
    if (!geminiApiKey.trim()) return;
    
    setIsGeneratingSummary(true);
    
    const fullTranscription = segments.map(s => s.text).join(' ');
    
    try {
      const summary = await callGeminiAPI(fullTranscription, suggestionPrompt);
      
      const summaryMessage: ChatMessage = {
        id: `auto-summary-${Date.now()}`,
        type: 'assistant',
        content: `🤖 **AI Summary**: ${summary}`,
        timestamp: new Date()
      };
      
      setChatMessages(prev => [...prev, summaryMessage]);
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

  const generateComprehensiveSummary = (transcriptionText: string, prompt: string): string => {
    if (!transcriptionText.trim()) return '';
    
    const wordCount = transcriptionText.split(' ').length;
    const topics = extractKeyTopics(transcriptionText);
    const promptLower = prompt.toLowerCase();
    
    // Analyze the prompt to understand what kind of summary is needed
    let summaryParts: string[] = [];
    
    // Add word count and duration info
    summaryParts.push(`**Transcript Overview**: ${wordCount} words recorded`);
    
    // Generate content based on prompt requirements
    if (promptLower.includes('key point') || promptLower.includes('main point') || promptLower.includes('điểm chính')) {
      const keyPoints = generateKeyPoints(transcriptionText);
      if (keyPoints) summaryParts.push(`**Key Points**: ${keyPoints}`);
    }
    
    if (promptLower.includes('action') || promptLower.includes('task') || promptLower.includes('hành động')) {
      const actionItems = generateActionItemsSummary(transcriptionText);
      if (actionItems) summaryParts.push(`**Action Items**: ${actionItems}`);
    }
    
    if (promptLower.includes('insight') || promptLower.includes('phân tích') || promptLower.includes('analyze')) {
      const insights = generateInsightsSummary(transcriptionText);
      if (insights) summaryParts.push(`**Insights**: ${insights}`);
    }
    
    if (promptLower.includes('decision') || promptLower.includes('quyết định') || promptLower.includes('conclusion')) {
      const decisions = generateDecisionsSummary(transcriptionText);
      if (decisions) summaryParts.push(`**Decisions**: ${decisions}`);
    }
    
    if (promptLower.includes('follow up') || promptLower.includes('next step') || promptLower.includes('tiếp theo')) {
      const followUps = generateFollowUpsSummary(transcriptionText);
      if (followUps) summaryParts.push(`**Follow-ups**: ${followUps}`);
    }
    
    if (promptLower.includes('question') || promptLower.includes('câu hỏi')) {
      const questions = generateQuestionsSummary(transcriptionText);
      if (questions) summaryParts.push(`**Questions**: ${questions}`);
    }
    
    // Always include main topics
    if (topics.length > 0) {
      summaryParts.push(`**Main Topics**: ${topics.slice(0, 5).join(', ')}`);
    }
    
    // If no specific requirements found, generate general summary
    if (summaryParts.length === 1) {
      const generalSummary = generateGeneralSummary(transcriptionText);
      summaryParts.push(`**Summary**: ${generalSummary}`);
    }
    
    return summaryParts.join('\n\n');
  };
  
  const generateKeyPoints = (text: string): string => {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const importantSentences = sentences.filter(s => 
      s.toLowerCase().includes('important') || 
      s.toLowerCase().includes('key') ||
      s.toLowerCase().includes('main') ||
      s.toLowerCase().includes('significant') ||
      s.toLowerCase().includes('crucial')
    );
    
    if (importantSentences.length > 0) {
      return importantSentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
    }
    
    // Fallback: get first few substantial sentences
    return sentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
  };
  
  const generateActionItemsSummary = (text: string): string => {
    const actionWords = ['need to', 'should', 'must', 'will', 'plan to', 'going to', 'have to', 'decide', 'implement', 'execute'];
    const sentences = text.split(/[.!?]+/);
    const actionSentences = sentences.filter(s => 
      actionWords.some(word => s.toLowerCase().includes(word))
    );
    
    if (actionSentences.length > 0) {
      return actionSentences.slice(0, 3).map(s => `• ${s.trim()}`).join('\n');
    }
    
    return 'No specific action items identified in current discussion';
  };
  
  const generateInsightsSummary = (text: string): string => {
    const insights = [];
    const textLower = text.toLowerCase();
    
    if (textLower.includes('problem') || textLower.includes('issue') || textLower.includes('challenge')) {
      insights.push('Problem-solving discussion detected');
    }
    
    if (textLower.includes('opportunity') || textLower.includes('potential')) {
      insights.push('Opportunities and potential areas identified');
    }
    
    if (textLower.includes('risk') || textLower.includes('concern')) {
      insights.push('Risk factors and concerns discussed');
    }
    
    if (textLower.includes('strategy') || textLower.includes('approach')) {
      insights.push('Strategic approaches and methodologies covered');
    }
    
    const topics = extractKeyTopics(text);
    if (topics.length > 3) {
      insights.push(`Multiple interconnected topics: ${topics.slice(0, 3).join(', ')}`);
    }
    
    return insights.length > 0 ? insights.map(i => `• ${i}`).join('\n') : 'General discussion insights being analyzed';
  };
  
  const generateDecisionsSummary = (text: string): string => {
    const decisionWords = ['decided', 'choose', 'selected', 'agreed', 'concluded', 'determined'];
    const sentences = text.split(/[.!?]+/);
    const decisionSentences = sentences.filter(s => 
      decisionWords.some(word => s.toLowerCase().includes(word))
    );
    
    if (decisionSentences.length > 0) {
      return decisionSentences.slice(0, 2).map(s => `• ${s.trim()}`).join('\n');
    }
    
    return 'No explicit decisions recorded in current discussion';
  };
  
  const generateFollowUpsSummary = (text: string): string => {
    const followUpWords = ['next', 'follow up', 'continue', 'schedule', 'plan', 'future'];
    const sentences = text.split(/[.!?]+/);
    const followUpSentences = sentences.filter(s => 
      followUpWords.some(word => s.toLowerCase().includes(word))
    );
    
    if (followUpSentences.length > 0) {
      return followUpSentences.slice(0, 2).map(s => `• ${s.trim()}`).join('\n');
    }
    
    const topics = extractKeyTopics(text);
    if (topics.length > 0) {
      return `• Consider deeper discussion on: ${topics.slice(0, 2).join(', ')}\n• Document and share key findings`;
    }
    
    return '• Review discussion points\n• Schedule follow-up if needed';
  };
  
  const generateQuestionsSummary = (text: string): string => {
    // Extract actual questions from text
    const questions = text.split(/[.!]/).filter(s => s.includes('?')).map(s => s.trim());
    
    if (questions.length > 0) {
      return questions.slice(0, 3).map(q => `• ${q}`).join('\n');
    }
    
    // Generate relevant questions based on content
    const topics = extractKeyTopics(text);
    const generatedQuestions = [];
    
    if (topics.length > 0) {
      generatedQuestions.push(`What are the next steps regarding ${topics[0]}?`);
      if (topics.length > 1) {
        generatedQuestions.push(`How do ${topics[0]} and ${topics[1]} relate?`);
      }
    }
    
    if (text.toLowerCase().includes('problem') || text.toLowerCase().includes('challenge')) {
      generatedQuestions.push('What solutions could address the discussed challenges?');
    }
    
    return generatedQuestions.length > 0 ? 
      generatedQuestions.map(q => `• ${q}`).join('\n') : 
      '• What are the key takeaways from this discussion?';
  };
  
  const generateGeneralSummary = (text: string): string => {
    const wordCount = text.split(' ').length;
    const topics = extractKeyTopics(text);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    let summary = `Discussion covering ${wordCount} words`;
    
    if (topics.length > 0) {
      summary += ` with main focus on ${topics.slice(0, 3).join(', ')}`;
    }
    
    if (sentences.length > 5) {
      summary += `. Key themes include various aspects of the discussed topics`;
    }
    
    return summary;
  };

  const generateRealtimeSuggestions = (segments: TranscriptSegment[], prompt: string) => {
    // Only generate simple suggestions if no Gemini API key
    if (!geminiApiKey.trim()) {
      generateSimpleSuggestions(segments, prompt);
      return;
    }
    
    // Generate advanced suggestions with Gemini API
    generateGeminiSuggestions(segments, prompt);
  };
  
  const generateSimpleSuggestions = (segments: TranscriptSegment[], prompt: string) => {
    if (segments.length === 0) return;

    const fullText = segments.map(s => s.text).join(' ');
    
    // Generate suggestions when there's enough content
    if (fullText.length < 50) return;
    
    // Generate suggestions every 4 segments to avoid spam
    if (segments.length % 4 === 0) {
      const suggestionContent = generatePromptBasedSuggestion(fullText, prompt);
      
      if (suggestionContent) {
        const suggestionMessage: ChatMessage = {
          id: `suggestion-${Date.now()}`,
          type: 'assistant',
          content: `💡 **Suggestion**: ${suggestionContent}`,
          timestamp: new Date()
        };
        
        setChatMessages(prev => [...prev, suggestionMessage]);
      }
    }
  };
    
  const generateGeminiSuggestions = async (segments: TranscriptSegment[], prompt: string) => {
    if (segments.length === 0) return;
    
    const fullText = segments.map(s => s.text).join(' ');
    
    // Generate suggestions every 4 segments to avoid spam
    if (segments.length % 4 === 0 && fullText.length > 50) {
      try {
        const suggestionPromptText = `Based on this ongoing conversation, provide a brief helpful suggestion or insight (max 100 words): ${prompt}\n\nCurrent conversation: ${fullText}`;
        const suggestion = await callGeminiAPI(fullText, suggestionPromptText);
        
        const suggestionMessage: ChatMessage = {
          id: `gemini-suggestion-${Date.now()}`,
          type: 'assistant',
          content: `💡 **AI Insight**: ${suggestion}`,
          timestamp: new Date()
        };
        
        setChatMessages(prev => [...prev, suggestionMessage]);
      } catch (error) {
        console.error('Gemini suggestion error:', error);
      }
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

    // Generate AI response using Gemini API
    generateChatResponse(chatInput, transcript);
  };

  const generateChatResponse = async (question: string, transcriptSegments: TranscriptSegment[]) => {
    try {
      let response: string;
      
      if (!geminiApiKey.trim()) {
        response = generateFallbackResponse(question, transcriptSegments);
      } else {
        const fullTranscript = transcriptSegments.map(s => s.text).join(' ');
        const chatPrompt = `You are an AI assistant helping with transcription analysis. 

Context: The user has been recording a conversation/meeting and has the following transcription:

Transcription: "${fullTranscript}"

User Question: "${question}"

Please provide a helpful, accurate response based on the transcription content. If the transcription is empty or the question cannot be answered from the transcription, provide general guidance about transcription analysis.`;

        response = await callGeminiAPI(fullTranscript, chatPrompt);
      }
      
      const assistantMessage: ChatMessage = {
        id: `chat-response-${Date.now()}`,
        type: 'assistant',
        content: response,
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
      setIsTyping(false);
    }
  };
  const generateFallbackResponse = (question: string, transcript: TranscriptSegment[]): string => {
    const fullText = transcript.map(s => s.text).join(' ').toLowerCase();
    const questionLower = question.toLowerCase();

    // Provide basic analysis without Gemini API
    if (transcript.length === 0) {
      return "🔑 **Setup Required**: Please configure your Gemini API key in Settings for advanced AI responses. Start recording to build transcription content for analysis.";
    }

    if (questionLower.includes('summary') || questionLower.includes('summarize')) {
      const keywords = extractKeyTopics(fullText);
      return `📝 **Basic Summary**: Main topics discussed include: ${keywords.slice(0, 3).join(', ')}. The conversation has ${transcript.length} segments. For detailed AI analysis, please configure your Gemini API key in Settings.`;
    }

    if (questionLower.includes('action') || questionLower.includes('todo')) {
      return "📋 **Action Items**: I can identify basic action items from the transcription. For detailed AI-powered action item extraction and analysis, please configure your Gemini API key in Settings.";
    }

    if (questionLower.includes('key') || questionLower.includes('important')) {
      return "🔍 **Key Points**: I can provide basic key point identification. For comprehensive AI analysis of important moments and insights, please configure your Gemini API key in Settings.";
    }

    if (questionLower.includes('time') || questionLower.includes('duration')) {
      const duration = transcript.length > 0 ? 
        Math.round((Date.now() - transcript[0].timestamp.getTime()) / 60000) : 0;
      return `⏱️ **Session Info**: Current session has been running for approximately ${duration} minutes with ${transcript.length} segments recorded.`;
    }

    return "🔑 **Basic Mode**: I can provide basic transcription analysis. For advanced AI-powered responses and detailed insights, please configure your Gemini API key in Settings. You can ask about summaries, key points, action items, or specific topics.";
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
                {(isTyping || isGeneratingSummary) && (
                {(isTyping || isGeneratingSummary || isGeneratingSuggestion) && (
                  <div className="flex justify-start">
                    <div className="flex items-start space-x-2 max-w-[80%]">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="bg-slate-100 rounded-lg px-4 py-2">
                        <div className="flex items-center space-x-2">
                          {isGeneratingSummary && <span className="text-xs text-slate-600">Generating AI summary...</span>}
                          {isGeneratingSuggestion && <span className="text-xs text-slate-600">Generating AI suggestion...</span>}
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