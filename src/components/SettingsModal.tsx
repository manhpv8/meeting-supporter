import React, { useState } from 'react';
import { X, Save, RotateCcw, Settings, Key, Bot } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestionPrompt: string;
  onUpdatePrompt: (prompt: string) => void;
  geminiApiKey: string;
  onUpdateGeminiApiKey: (key: string) => void;
  geminiModel: string;
  onUpdateGeminiModel: (model: string) => void;
}

const defaultPrompt = 'Based on this conversation, provide helpful insights, key points, action items, and relevant follow-up suggestions.';
const defaultModel = 'gemini-1.5-flash';

export default function SettingsModal({ 
  isOpen, 
  onClose, 
  suggestionPrompt, 
  onUpdatePrompt,
  geminiApiKey,
  onUpdateGeminiApiKey,
  geminiModel,
  onUpdateGeminiModel
}: SettingsModalProps) {
  const [localPrompt, setLocalPrompt] = useState<string>(suggestionPrompt);
  const [localApiKey, setLocalApiKey] = useState<string>(geminiApiKey);
  const [localModel, setLocalModel] = useState<string>(geminiModel);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdatePrompt(localPrompt);
    onUpdateGeminiApiKey(localApiKey);
    onUpdateGeminiModel(localModel);
    onClose();
  };

  const handleReset = () => {
    setLocalPrompt(defaultPrompt);
    setLocalModel(defaultModel);
  };

  const geminiModels = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro'
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <Settings className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-slate-900">AI Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Gemini API Configuration */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-3">
              <Bot className="h-5 w-5 text-purple-600" />
              <h3 className="font-medium text-purple-900">Gemini AI Configuration</h3>
            </div>
            <p className="text-sm text-purple-700 mb-4">
              Configure your Google Gemini API to enable automatic AI-powered summaries and suggestions.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Key className="h-4 w-4 inline mr-1" />
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  placeholder="Enter your Gemini API key..."
                  className="w-full p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Get your API key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">Google AI Studio</a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Gemini Model
                </label>
                <select
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {geminiModels.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Choose the Gemini model for AI processing
                </p>
              </div>
            </div>
          </div>

          {/* Auto Summary Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">Auto Summary Feature</h3>
            <p className="text-sm text-blue-700">
              When Gemini API is configured, the system will automatically:
            </p>
            <ul className="text-sm text-blue-700 mt-2 space-y-1">
              <li>• Generate comprehensive summaries every 100 words or 8 transcript segments</li>
              <li>• Create automatic suggestions every 50 words or 5 transcript segments</li>
              <li>• Extract insights and action items based on your custom prompt</li>
            </ul>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="font-medium text-purple-900 mb-2">Auto Suggestion System</h3>
            <p className="text-sm text-purple-700">
              The AI will continuously analyze your transcription and automatically suggest:
              key insights, action items, important points, and relevant questions based on your custom prompt.
            </p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-900 mb-2">How it works</h3>
            <p className="text-sm text-green-700">
              Customize the AI prompt to get more relevant suggestions and automatic summaries from your transcriptions. 
              The AI will use this prompt to analyze the conversation content and generate helpful insights, action items, and comprehensive summaries.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              AI Summary Prompt
            </label>
            <textarea
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              placeholder="Enter your custom prompt for AI summaries..."
              className="w-full h-32 p-4 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-slate-500">
              This prompt will be used to generate AI summaries based on your transcription content.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleReset}
            className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-700 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset to Default</span>
          </button>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Save className="h-4 w-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}